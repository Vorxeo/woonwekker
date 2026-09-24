'use strict';
const {
  mollieEnabled,
  mollieRequest,
  grantIfPaid,
  signEntitlement,
  cookieHeader,
} = require('../../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  // Vercel may pass query on req.query
  const q = req.query || Object.fromEntries(url.searchParams);
  const paymentId = q.payment_id;
  const customerId = q.customer_id;
  const state = q.state;

  if (!mollieEnabled()) {
    res.statusCode = 302;
    res.setHeader('Location', '/account/?checkout=unavailable');
    return res.end();
  }
  try {
    let payment = null;
    if (paymentId) {
      payment = await mollieRequest('GET', `/payments/${encodeURIComponent(paymentId)}`);
    } else if (customerId) {
      const list = await mollieRequest(
        'GET',
        `/customers/${encodeURIComponent(customerId)}/payments?limit=5`
      );
      const embeds = (list._embedded && list._embedded.payments) || [];
      payment =
        embeds.find((p) => p.metadata && state && p.metadata.state === state) ||
        embeds[0] ||
        null;
      if (payment && state && payment.metadata && payment.metadata.state && payment.metadata.state !== state) {
        res.statusCode = 302;
        res.setHeader('Location', '/account/?checkout=invalid');
        return res.end();
      }
    }
    if (!payment) {
      res.statusCode = 302;
      res.setHeader('Location', '/account/?checkout=missing');
      return res.end();
    }
    if (payment.status === 'paid') {
      const payload = await grantIfPaid(payment);
      if (payload) {
        const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
        const secure = !/localhost|127\.0\.0\.1/i.test(host);
        res.setHeader('Set-Cookie', cookieHeader(signEntitlement(payload), { secure }));
      }
      res.statusCode = 302;
      res.setHeader('Location', '/account/?checkout=success');
      return res.end();
    }
    res.statusCode = 302;
    res.setHeader('Location', `/account/?checkout=${encodeURIComponent(payment.status || 'open')}`);
    return res.end();
  } catch (e) {
    console.error('[checkout/return]', e.message);
    res.statusCode = 302;
    res.setHeader('Location', '/account/?checkout=error');
    return res.end();
  }
};
