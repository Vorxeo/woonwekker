'use strict';
const { getSession, publicUser, sendJson } = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = getSession(req);
  const user = publicUser(session);
  if (!user) return sendJson(res, 401, { error: 'unauthorized', loggedIn: false });
  return sendJson(res, 200, { loggedIn: true, user });
};
