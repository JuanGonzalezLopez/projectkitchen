import { verifyRequestAuth } from '../shared/auth.js';

const ALLOWED_JSON_PATHS = [
  'data/content.json',
  'data/services.json',
  'data/projects.json'
];
const manifestRegex = /^assets\/projects\/([a-z0-9-]+)\/manifest\.json$/;

const rateMap = new Map();
const RATE_WINDOW = 600; // seconds
const RATE_MAX = 20;

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

const validatePath = (path) => {
  if (ALLOWED_JSON_PATHS.includes(path)) return path;
  const m = path.match(manifestRegex);
  if (m) return path;
  throw { status: 400, message: 'Path not allowed' };
};

const slugFromPath = (path) => {
  const m = path.match(manifestRegex);
  return m ? m[1] : null;
};

const prettyJson = (obj) => JSON.stringify(obj, null, 2) + '\n';

const fetchSha = async (path, env) => {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: buildAuthHeaders(env) });
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
      sha,
      branch: env.GITHUB_BRANCH
    })
  });
  const body = await res.json();
  if (!res.ok) {
    throw { status: 500, message: body.message || 'GitHub commit failed' };
  }
  return body;
};

const encodeBase64 = (text) => btoa(unescape(encodeURIComponent(text)));

const requireEnv = (env) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    throw { status: 500, message: 'Missing GitHub configuration' };
  }
};

export const onRequest = async (context) => {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') throw { status: 405, message: 'Method Not Allowed' };
    requireEnv(env);
    const auth = await verifyRequestAuth(context);
    const ip = request.headers.get('cf-connecting-ip') || '';
    if (rateLimit(ip)) throw { status: 429, message: 'Too many requests' };

    const body = await request.json();
    const path = validatePath(body.path);
    const json = body.json;
    if (typeof json !== 'object') throw { status: 400, message: 'Invalid JSON payload' };
    const slug = slugFromPath(path);
    if (slug && !/^[a-z0-9-]+$/.test(slug)) throw { status: 400, message: 'Invalid slug' };

    const sha = await fetchSha(path, env);
    const content = encodeBase64(prettyJson(json));
    const commitMessage = body.message || `Admin update ${path} by ${auth.email || 'unknown'} at ${new Date().toISOString()}`;
    const commitRes = await commitFile({ path, content, sha, message: commitMessage }, env);

    return new Response(JSON.stringify({ ok: true, path, commitUrl: commitRes.commit?.html_url || '', sha: commitRes.content?.sha || sha }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (err) {
    const status = err.status || 500;
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Error saving file' }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
};
