const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

const parseStateCookie = (cookieHeader = '') => {
  const match = cookieHeader.split(';').find((part) => part.trim().startsWith('gh_oauth_state='));
  if (!match) return null;
  try {
    const value = match.split('=').slice(1).join('=').trim();
    return JSON.parse(atob(value));
  } catch (e) {
    return null;
  }
};

const buildStateCookie = (value) =>
  `gh_oauth_state=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=900`;

const clearStateCookie = 'gh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0';

const startOAuth = (url, env) => {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'GitHub OAuth is not configured.' }, 500);
  }

  const origin = url.origin;
  const stateValue = crypto.randomUUID();
  const cookieValue = btoa(JSON.stringify({ state: stateValue, origin }));
  const redirectUri = `${url.origin}${url.pathname}`;

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'repo');
  authorizeUrl.searchParams.set('state', stateValue);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': buildStateCookie(cookieValue)
    }
  });
};

const handleCallback = async (url, request, env) => {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'GitHub OAuth is not configured.' }, 500);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = parseStateCookie(request.headers.get('cookie'));
  if (!code || !state || !savedState || savedState.state !== state) {
    return jsonResponse({ ok: false, error: 'Invalid OAuth state.' }, 400);
  }

  const redirectUri = `${url.origin}${url.pathname}`;
  let tokenData = {};
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    tokenData = await tokenRes.json();
  } catch (err) {
    tokenData = { error: 'oauth_exchange_failed' };
  }
  const accessToken = tokenData.access_token;
  const targetOrigin = savedState.origin || url.origin;
  const message = accessToken
    ? `authorization:github:success:${accessToken}`
    : `authorization:github:error:${tokenData.error || 'token_missing'}`;

  const html = `<!doctype html>
<html>
<body>
<p>Completing authentication… you can close this window.</p>
<script>
  (function() {
    const message = ${JSON.stringify(message)};
    const target = ${JSON.stringify(targetOrigin)};
    if (window.opener) {
      window.opener.postMessage(message, target);
      window.close();
    } else {
      document.body.innerText = 'Authentication complete. Please return to the app.';
    }
  })();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html',
      'Set-Cookie': clearStateCookie
    }
  });
};

export const onRequest = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get('code')) {
    return handleCallback(url, request, env);
  }
  return startOAuth(url, env);
};
