const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  }
});

export const onRequest = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  return jsonResponse({
    ok: true,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || ''
  });
};
