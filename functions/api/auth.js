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

const truncate = (value, max = 500) => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const startOAuth = (url, env) => {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const missing = !clientId ? 'GITHUB_CLIENT_ID' : 'GITHUB_CLIENT_SECRET';
    console.error('[auth] missing env', missing);
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

  console.log('[auth] startOAuth', {
    requestOrigin: url.origin,
    authorizeUrl: authorizeUrl.toString(),
    redirectUri
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': buildStateCookie(cookieValue),
      'Cache-Control': 'no-store'
    }
  });
};

const handleCallback = async (url, request, env, debug) => {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const missing = !clientId ? 'GITHUB_CLIENT_ID' : 'GITHUB_CLIENT_SECRET';
    console.error('[auth] missing env', missing);
    return htmlResponse(`<p>Missing required env var: ${missing}</p>`, 500);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = parseStateCookie(request.headers.get('cookie'));
  const hasStateCookie = !!savedState;
  const stateMatches = savedState && savedState.state === state;
  console.log('[auth] callback start', {
    origin: url.origin,
    hasStateCookie,
    stateMatches,
    stateParamPresent: !!state,
    codePresent: !!code
  });
  if (!code || !state || !savedState || savedState.state !== state) {
    return htmlResponse('<p>Invalid OAuth state.</p>', 400);
  }

  const redirectUri = `${url.origin}/api/auth`;
  let tokenData = {};
  let tokenStatus = null;
  let tokenBody = '';
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
    tokenStatus = tokenRes.status;
    if (!tokenRes.ok) {
      tokenBody = await tokenRes.text();
      console.error('[auth] token exchange failed', { status: tokenStatus, body: truncate(tokenBody) });
      return htmlResponse(`<p>GitHub token exchange failed (${tokenStatus}).</p><pre>${tokenBody || 'No body'}</pre>`, tokenStatus);
    }
    const contentType = tokenRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      tokenData = await tokenRes.json();
    } else {
      const text = await tokenRes.text();
      tokenBody = text;
      tokenData = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (err) {
    console.error('[auth] token exchange network error', err);
    return htmlResponse('<p>GitHub token exchange failed (network).</p>', 502);
  }
  const accessToken = tokenData.access_token;
  const targetOrigin = savedState.origin || url.origin;

  console.log('[auth] token exchange result', {
    status: tokenStatus,
    hasToken: !!accessToken,
    body: truncate(tokenBody || JSON.stringify(tokenData || {}))
  });

  if (!accessToken) {
    return htmlResponse(`<p>GitHub token exchange error: ${tokenData.error || 'token_missing'}</p>`, 400, {
      'Set-Cookie': clearStateCookie
    });
  }

  const debugInfo = debug
    ? `
    <h2>OAuth Debug</h2>
    <ul>
      <li>Origin: ${targetOrigin}</li>
      <li>Redirect URI: ${redirectUri}</li>
      <li>State cookie present: ${hasStateCookie}</li>
      <li>State match: ${stateMatches}</li>
      <li>Token status: ${tokenStatus}</li>
      <li>Token body (truncated): <pre>${truncate(tokenBody || JSON.stringify(tokenData || {}))}</pre></li>
    </ul>
    <p><a href="${url.origin}/api/auth">Retry authorize</a></p>
    `
    : '';

  const html = `<!doctype html>
<html>
<body>
<p>Completing authentication…${debug ? '' : ' you can close this window.'}</p>
${debugInfo}
<script>
  (function() {
    const token = ${JSON.stringify(accessToken)};
    const message = "authorization:github:" + JSON.stringify({ token, provider: "github" });
    const target = ${JSON.stringify(targetOrigin)};
    if (window.opener) {
      window.opener.postMessage(message, target);
      ${debug ? '' : 'window.close();'}
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
  try {
    if (request.method !== 'GET') {
      return htmlResponse('<p>Method Not Allowed</p>', 405);
    }

    const url = new URL(request.url);
    const debugParam = url.searchParams.get('debug') === '1';
    const debugEnv = env.CF_PAGES === '1' && env.DEBUG_OAUTH === '1';
    const debug = debugParam || debugEnv;

    const queryForLog = Object.fromEntries(url.searchParams.entries());
    if (queryForLog.code) queryForLog.code = '[redacted]';
    if (queryForLog.token) queryForLog.token = '[redacted]';

    console.log('[auth] request start', {
      url: `${url.pathname}${url.search}`,
      origin: url.origin,
      query: queryForLog,
      debug
    });

    if (url.searchParams.get('code')) {
      const resp = await handleCallback(url, request, env, debug);
      console.log('[auth] completed callback');
      return resp;
    }
    const resp = startOAuth(url, env, debug);
    console.log('[auth] redirecting to GitHub');
    return resp;
  } catch (err) {
    console.error('[auth] unexpected error', err);
    return htmlResponse('<p>Unexpected error during OAuth.</p>', 500);
  }
};
