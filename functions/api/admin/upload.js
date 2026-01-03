import { verifyRequestAuth } from '../../shared/auth.js';

const rateMap = new Map();
const RATE_WINDOW = 600;
const RATE_MAX = 20;
const MAX_BYTES = 8 * 1024 * 1024;
const allowedMime = ['image/png', 'image/jpeg', 'image/webp'];

const rateLimit = (ip) => {
  if (!ip) return false;
  const now = Math.floor(Date.now() / 1000);
  const entry = rateMap.get(ip) || { count: 0, exp: now + RATE_WINDOW };
  if (entry.exp < now) {
    entry.count = 0;
    entry.exp = now + RATE_WINDOW;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count > RATE_MAX;
};

const buildAuthHeaders = (env) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  'User-Agent': 'projectkitchen-admin',
  'Content-Type': 'application/json',
  Accept: 'application/json'
});

const requireEnv = (env) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    throw { status: 500, message: 'Missing GitHub configuration' };
  }
};

const validateTargetDir = (dir) => {
  if (dir === 'assets/uploads') return dir;
  const m = dir.match(/^assets\/projects\/([a-z0-9-]+)$/);
  if (m) return dir;
  throw { status: 400, message: 'Invalid targetDir' };
};

const sanitizeFilename = (name) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  const stamp = Date.now();
  return `${base}-${stamp}.${ext || 'png'}`;
};

const encodeBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fetchShaIfExists = async (path, env) => {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: buildAuthHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw { status: 500, message: `GitHub fetch failed (${res.status})` };
  const body = await res.json();
  return body.sha;
};

const commitFile = async ({ path, content, sha, message }, env) => {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildAuthHeaders(env),
    body: JSON.stringify({
      message,
      content,
      sha: sha || undefined,
      branch: env.GITHUB_BRANCH
    })
  });
  const body = await res.json();
  if (!res.ok) throw { status: 500, message: body.message || 'GitHub commit failed' };
  return body;
};

export const onRequest = async (context) => {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') throw { status: 405, message: 'Method Not Allowed' };
    requireEnv(env);
    await verifyRequestAuth(context);
    const ip = request.headers.get('cf-connecting-ip') || '';
    if (rateLimit(ip)) throw { status: 429, message: 'Too many requests' };

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) throw { status: 400, message: 'Expected form-data' };
    const form = await request.formData();
    const file = form.get('file');
    const targetDir = validateTargetDir(form.get('targetDir') || '');
    if (!file || typeof file.name !== 'string') throw { status: 400, message: 'Missing file' };
    if (file.size > MAX_BYTES) throw { status: 413, message: 'File too large' };
    if (!allowedMime.includes(file.type)) throw { status: 400, message: 'Invalid file type' };

    const filename = sanitizeFilename(file.name);
    const path = `${targetDir}/${filename}`;
    const buffer = await file.arrayBuffer();
    const content = encodeBase64(buffer);
    const sha = await fetchShaIfExists(path, env);
    const commitMessage = `Upload ${path} at ${new Date().toISOString()}`;
    const commitRes = await commitFile({ path, content, sha, message: commitMessage }, env);

    return new Response(JSON.stringify({ ok: true, path, commitUrl: commitRes.commit?.html_url || '' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (err) {
    const status = err.status || 500;
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Upload failed' }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
};
