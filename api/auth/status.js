'use strict';
const {
  googleConfigured,
  resendConfigured,
  getSession,
  publicUser,
  sendJson,
} = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = getSession(req);
  const user = publicUser(session);
  return sendJson(res, 200, {
    googleConfigured: googleConfigured(),
    resendConfigured: resendConfigured(),
    loggedIn: !!user,
    ...(user ? { user } : {}),
  });
};
