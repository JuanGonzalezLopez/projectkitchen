const RATE_LIMIT_WINDOW_SECONDS = 10 * 60; // 10 minutes
const RATE_LIMIT_MAX = 5;
const memoryRateMap = new Map();

const jsonResponse = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', ...extraHeaders }
});

const getClientIp = (request) => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || '';
};

const parseBody = async (request) => {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await request.json();
    } catch (_) {
      return {};
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
};

const checkRateLimit = async (ip, env) => {
  if (!ip) return false;
  const kv = env.RATE_LIMIT_KV;
  const now = Math.floor(Date.now() / 1000);
  if (kv) {
    const key = `rate:${ip}`;
    const current = Number(await kv.get(key)) || 0;
    if (current >= RATE_LIMIT_MAX) return true;
    await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return false;
  }

  const entry = memoryRateMap.get(ip) || { count: 0, expires: now + RATE_LIMIT_WINDOW_SECONDS };
  if (entry.expires < now) {
    entry.count = 0;
    entry.expires = now + RATE_LIMIT_WINDOW_SECONDS;
  }
  entry.count += 1;
  memoryRateMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
};

const verifyTurnstile = async (token, ip, secret) => {
  if (!token || !secret) return { success: false, error: 'missing-turnstile' };
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });
    return res.json();
  } catch (e) {
    return { success: false, error: 'verification-error' };
  }
};

const sendEmail = async ({ name, phone, message, clientIp }, env) => {
  const apiKey = env.EMAIL_API_KEY;
  const to = env.CONTACT_TO_EMAIL;
  const from = env.CONTACT_FROM_EMAIL || to;
  if (!apiKey || !to || !from) {
    return { ok: false, error: 'Email service not configured.' };
  }

  const timestamp = new Date().toISOString();
  const text = [
    `New website inquiry at ${timestamp}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `IP: ${clientIp || 'unknown'}`,
    'Message:',
    message
  ].join('\n');

  const payload = {
    from,
    to: [to],
    subject: `New website inquiry: ${name || 'Website lead'}`,
    text,
    reply_to: env.CONTACT_FROM_EMAIL || from
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 403 && (errorText || '').toLowerCase().includes('testing')) {
        return { ok: false, error: 'Resend testing mode: set CONTACT_TO_EMAIL to your Resend account email for tests, or verify a domain in Resend and set CONTACT_FROM_EMAIL to that domain.' };
      }
      return { ok: false, error: `Email provider error: ${errorText || res.statusText}` };
    }
  } catch (err) {
    return { ok: false, error: 'Email provider is unreachable.' };
  }

  return { ok: true };
};

export const onRequest = async (context) => {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405, { ...corsHeaders, Allow: 'POST' });
  }

  const body = await parseBody(request);
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const turnstileToken = (body.turnstileToken || body['cf-turnstile-response'] || '').toString();
  const honeypot = (body.company || body.website || body.honeypot || '').toString().trim();

  if (honeypot) {
    return jsonResponse({ ok: false, error: 'Invalid submission' }, 400, corsHeaders);
  }

  if (!name || !phone || !message) {
    return jsonResponse({ ok: false, error: 'Missing required fields.' }, 400, corsHeaders);
  }

  if (name.length > 120 || phone.length > 120 || message.length < 5 || message.length > 5000) {
    return jsonResponse({ ok: false, error: 'Field validation failed.' }, 400, corsHeaders);
  }

  const clientIp = getClientIp(request);
  const isRateLimited = await checkRateLimit(clientIp, env);
  if (isRateLimited) {
    return jsonResponse({ ok: false, error: 'Too many requests. Please wait and try again.' }, 429, corsHeaders);
  }

  const turnstileResult = await verifyTurnstile(turnstileToken, clientIp, env.TURNSTILE_SECRET_KEY);
  if (!turnstileResult.success) {
    return jsonResponse({ ok: false, error: 'Spam verification failed.' }, 400, corsHeaders);
  }

  const emailResult = await sendEmail({ name, phone, message, clientIp }, env);
  if (!emailResult.ok) {
    return jsonResponse({ ok: false, error: emailResult.error || 'Unable to send message.' }, 500, corsHeaders);
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
};
