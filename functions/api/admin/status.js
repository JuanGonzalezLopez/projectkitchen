import { verifyRequestAuth } from '../../shared/auth.js';

export const onRequest = async (context) => {
  try {
    const auth = await verifyRequestAuth(context);
    return new Response(JSON.stringify({ ok: true, authMode: auth.mode, email: auth.email || null }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (err) {
    const status = err.status || 401;
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Unauthorized' }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
};
