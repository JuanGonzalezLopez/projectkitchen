const buildCsp = (isAdmin) => {
  const baseDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:" + (isAdmin ? " blob: https://avatars.githubusercontent.com" : ""),
    "font-src 'self' https://fonts.gstatic.com data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'" + (isAdmin ? " 'unsafe-eval'" : "") + " https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com" + (isAdmin ? " https://github.com https://api.github.com https://raw.githubusercontent.com" : " https://github.com https://api.github.com"),
    "frame-src https://challenges.cloudflare.com"
  ];
  return baseDirectives.join('; ');
};

const securityHeaders = (isAdmin) => ({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), usb=(), vr=()",
  'Content-Security-Policy': buildCsp(isAdmin)
});

export const onRequest = async ({ request, next }) => {
  const url = new URL(request.url);
  const isAdmin = url.pathname.startsWith('/admin');

  const response = await next();
  const newHeaders = new Headers(response.headers);

  // Remove any existing CSP header to ensure a single policy.
  newHeaders.delete('Content-Security-Policy');

  const appliedHeaders = securityHeaders(isAdmin);
  Object.entries(appliedHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
};
