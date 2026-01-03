const htmlResponse = (html, status = 200, headers = {}) =>
  new Response(html, {
    status,
    headers: {
      'content-type': 'text/html',
      'cache-control': 'no-store',
      ...headers
    }
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
    const missing = !clientId ? 'GITHUB_CLIENT_ID' : 'GITHUB_CLIENT_SECRET';
    return htmlResponse(`<p>Missing required env var: ${missing}</p>`, 500);
  }

  const stateValue = crypto.randomUUID();
  const cookieValue = btoa(JSON.stringify({ state: stateValue, origin: url.origin }));
  const redirectUri = `${url.origin}/api/auth`;

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'repo');
  authorizeUrl.searchParams.set('state', stateValue);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': buildStateCookie(cookieValue),
      'Cache-Control': 'no-store'
    }
  });
};

const handleCallback = async (url, request, env) => {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const missing = !clientId ? 'GITHUB_CLIENT_ID' : 'GITHUB_CLIENT_SECRET';
    return htmlResponse(`<p>Missing required env var: ${missing}</p>`, 500);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = parseStateCookie(request.headers.get('cookie'));
  if (!code || !state || !savedState || savedState.state !== state) {
    return htmlResponse('<p>Invalid OAuth state.</p>', 400);
  }

  const redirectUri = `${url.origin}/api/auth`;
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
        redirect_uri: redirectUri,
        state
      })
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return htmlResponse(`<p>GitHub token exchange failed (${tokenRes.status}).</p><pre>${text || 'No body'}</pre>`, tokenRes.status);
    }
    const contentType = tokenRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      tokenData = await tokenRes.json();
    } else {
      // fallback to urlencoded parsing
      const text = await tokenRes.text();
      tokenData = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (err) {
    return htmlResponse('<p>GitHub token exchange failed (network).</p>', 502);
  }
  const accessToken = tokenData.access_token;
  const targetOrigin = savedState.origin || url.origin;

  if (!accessToken) {
    return htmlResponse(`<p>GitHub token exchange error: ${tokenData.error || 'token_missing'}</p>`, 400, {
      'Set-Cookie': clearStateCookie
    });
  }

  const html = `<!doctype html>
<html>
<body>
<p>Completing authentication… you can close this window.</p>
<script>
  (function() {
    const token = ${JSON.stringify(accessToken)};
    const message = "authorization:github:" + JSON.stringify({ token, provider: "github" });
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
      'Set-Cookie': clearStateCookie,
      'cache-control': 'no-store'
    }
  });
};

export const onRequest = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return htmlResponse('<p>Method Not Allowed</p>', 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get('code')) {
    return handleCallback(url, request, env);
  }
  return startOAuth(url, env);
};
