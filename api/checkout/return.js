'use strict';
const {
  mollieEnabled,
  mollieRequest,
  grantIfPaid,
  signEntitlement,
  cookieHeader,
  findActiveBellenSubscription,
  entitlementPayloadFromPayment,
} = require('../../lib/ww-gate.cjs');

function wantsJson(req, q) {
  if (q && (q.format === 'json' || q.json === '1')) return true;
  const accept = String((req.headers && req.headers.accept) || '');
  return /application\/json/i.test(accept);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  return res.end();
}

function sendJsonLocal(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      if (v != null) res.setHeader(k, v);
    }
  }
  return res.end(body);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = req.query || Object.fromEntries(url.searchParams);
  const paymentId = q.payment_id;
  const customerId = q.customer_id;
  const state = q.state;
  const asJson = wantsJson(req, q);

  if (!mollieEnabled()) {
    if (asJson) return sendJsonLocal(res, 503, { error: 'payments_unavailable', status: 'unavailable' });
    return redirect(res, '/account/?checkout=unavailable');
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
        if (asJson) return sendJsonLocal(res, 400, { error: 'invalid_state', status: 'invalid' });
        return redirect(res, '/account/?checkout=invalid');
      }
    }
    if (!payment) {
      if (asJson) return sendJsonLocal(res, 404, { error: 'missing_payment', status: 'missing' });
      return redirect(res, '/account/?checkout=missing');
    }

    const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
    const secure = !/localhost|127\.0\.0\.1/i.test(host);

    if (payment.status === 'paid') {
      let payload = await grantIfPaid(payment);
      // Attach subscription id when present so later entitlement polls can refresh.
      if (payload && payload.customerId) {
        try {
          const active = await findActiveBellenSubscription(payload.customerId);
          if (active) {
            payload = entitlementPayloadFromPayment(payment, {
              customerId: payload.customerId,
              subscriptionId: active.id,
            });
          }
        } catch (_) {}
      }
      const headers = {};
      if (payload) {
        headers['Set-Cookie'] = cookieHeader(signEntitlement(payload), { secure });
      }
      if (asJson) {
        return sendJsonLocal(
          res,
          200,
          { status: 'paid', plan: payload ? 'bellen' : 'kijken' },
          headers
        );
      }
      if (headers['Set-Cookie']) res.setHeader('Set-Cookie', headers['Set-Cookie']);
      return redirect(res, '/account/?checkout=success');
    }

    // open / pending / authorized — return-before-paid race; client may retry with payment_id
    const st = payment.status || 'open';
    const pendingish = st === 'open' || st === 'pending' || st === 'authorized';
    const checkoutFlag = pendingish ? 'pending' : st;
    if (asJson) {
      return sendJsonLocal(res, 200, {
        status: st,
        plan: 'kijken',
        paymentId: payment.id,
        pending: pendingish,
      });
    }
    const qs = new URLSearchParams({ checkout: checkoutFlag });
    if (payment.id) qs.set('payment_id', payment.id);
    if (payment.customerId) qs.set('customer_id', payment.customerId);
    return redirect(res, `/account/?${qs.toString()}`);
  } catch (e) {
    console.error('[checkout/return]', e.message);
    if (asJson) return sendJsonLocal(res, 500, { error: 'return_failed', status: 'error' });
    return redirect(res, '/account/?checkout=error');
  }
};
