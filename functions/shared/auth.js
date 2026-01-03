const textDecoder = new TextDecoder();

const decodeBase64Url = (input) => {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
};

const parseJwt = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid-jwt');
  const payload = JSON.parse(textDecoder.decode(decodeBase64Url(parts[1])));
  return { header: JSON.parse(textDecoder.decode(decodeBase64Url(parts[0]))), payload, signature: parts[2] };
};

const importPublicKey = async (modulusB64, exponentB64) =>
  crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: modulusB64, e: exponentB64, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

const verifyJwt = async (token, jwks, expectedAud) => {
  const { header, payload } = parseJwt(token);
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error('kid-not-found');
  const cryptoKey = await importPublicKey(key.n, key.e);
  const enc = new TextEncoder();
  const data = enc.encode(token.split('.').slice(0, 2).join('.'));
  const signature = decodeBase64Url(token.split('.')[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, data);
  if (!valid) throw new Error('invalid-signature');
  if (expectedAud && payload.aud && payload.aud !== expectedAud && !(Array.isArray(payload.aud) && payload.aud.includes(expectedAud))) {
    throw new Error('aud-mismatch');
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('jwt-expired');
  return payload;
};

const getJwks = async (teamDomain) => {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { cache: 'no-store' });
  if (!res.ok) throw new Error('jwks-fetch-failed');
  return res.json();
};

const basicAuth = (request, env) => {
  const user = env.ADMIN_BASIC_USER;
  const pass = env.ADMIN_BASIC_PASS;
  if (!user || !pass) return null;
  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('basic ')) return null;
  const decoded = atob(header.split(' ')[1] || '');
  const [u, p] = decoded.split(':');
  if (u === user && p === pass) return { email: `${user}@basic`, mode: 'basic' };
  return null;
};

export const verifyRequestAuth = async ({ request, env }) => {
  const basic = basicAuth(request, env);
  if (basic) return basic;

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw { status: 401, message: 'Missing Access token' };

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) throw { status: 500, message: 'Access verification not configured' };

  const jwks = await getJwks(teamDomain);
  const payload = await verifyJwt(token, jwks, aud);
  const email = payload.email || payload.sub || '';
  const allowlist = (env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length && !allowlist.includes(email.toLowerCase())) {
    throw { status: 403, message: 'Email not allowed' };
  }
  return { email, mode: 'access' };
};
