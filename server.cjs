'use strict';
/**
 * Local API + static server for Woonwekker (dev / Verified proofs).
 * Shares Mollie + entitlement logic with Vercel api/* via lib/ww-gate.cjs.
 * Google OAuth via lib/ww-auth.cjs — fail-closed without GOOGLE_CLIENT_* or woonwekker_google_oauth_clientid / woonwekker_google_oauth_clientsecret.
 * Fail-closed without MOLLIE_API_KEY, Mollie_Api_Key, or mollie_api_key — no fake unlock.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const gate = require('./lib/ww-gate.cjs');
const auth = require('./lib/ww-auth.cjs');

// Optional local .env (never required; Vercel Production is primary for keys)
try {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
  }
} catch {}

const ROOT = path.resolve(__dirname, 'dist');
const HOST = process.env.WW_HOST || '127.0.0.1';
const PORT = Number(process.env.WW_PORT || 4174);

function contentType(fp) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
    }[path.extname(fp)] || 'application/octet-stream'
  );
}

function serveStatic(req, res, urlPath) {
  let p = path.resolve(ROOT, '.' + decodeURIComponent(urlPath.split('?')[0]));
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  const fullPrivate = path.resolve(ROOT, 'listings.full.json');
  if (path.resolve(p) === fullPrivate) {
    res.writeHead(404);
    return res.end('Not found');
  }
  fs.readFile(p, (e, b) => {
    if (e) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType(p), 'Content-Length': b.length });
    res.end(b);
  });
}

function adapt(handler) {
  return (req, res, url) => {
    req.query = Object.fromEntries(url.searchParams);
    // Preserve path for dynamic [id]
    if (url.pathname.startsWith('/api/listing/')) {
      req.query.id = decodeURIComponent(url.pathname.replace(/^\/api\/listing\//, '').replace(/\/$/, ''));
    }
    return handler(req, res);
  };
}

const entitlement = adapt(require('./api/entitlement.js'));
const checkout = adapt(require('./api/checkout.js'));
const plaats = adapt(require('./api/plaats.js'));
const checkoutReturn = adapt(require('./api/checkout/return.js'));
const webhook = adapt(require('./api/mollie/webhook.js'));
const listings = adapt(require('./api/listings.js'));
const listingId = adapt(require('./api/listing/[id].js'));
const billing = adapt(require('./api/billing-portal.js'));
const notFound = adapt(require('./api/not-found.js'));
const authStatus = adapt(require('./api/auth/status.js'));
const authGoogle = adapt(require('./api/auth/google.js'));
const authGoogleCb = adapt(require('./api/auth/google/callback.js'));
const authMe = adapt(require('./api/auth/me.js'));
const authLogout = adapt(require('./api/auth/logout.js'));
const authSignup = adapt(require('./api/auth/signup.js'));
const authConfirm = adapt(require('./api/auth/confirm.js'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;
  try {
    if (pathname === '/listings.json' && req.method === 'GET') return listings(req, res, url);
    if (pathname === '/listings.full.json' || pathname.startsWith('/data/')) return notFound(req, res, url);
    if (pathname === '/api/entitlement' && req.method === 'GET') return entitlement(req, res, url);
    if (pathname === '/api/checkout' && req.method === 'POST') return checkout(req, res, url);
    if ((pathname === '/api/plaats' || pathname === '/api/plaats/') && req.method === 'POST') return plaats(req, res, url);
    if (pathname === '/api/checkout/return' && req.method === 'GET') return checkoutReturn(req, res, url);
    if (pathname === '/api/mollie/webhook' && req.method === 'POST') return webhook(req, res, url);
    if (pathname === '/api/billing-portal') return billing(req, res, url);
    if (/^\/api\/listing\/[^/]+\/?$/.test(pathname) && req.method === 'GET') return listingId(req, res, url);
    if (pathname === '/api/auth/status' && req.method === 'GET') return authStatus(req, res, url);
    if (pathname === '/api/auth/google' && req.method === 'GET') return authGoogle(req, res, url);
    if ((pathname === '/api/auth/callback/google' || pathname === '/api/auth/google/callback') && req.method === 'GET') return authGoogleCb(req, res, url);
    if (pathname === '/api/auth/me' && req.method === 'GET') return authMe(req, res, url);
    if (pathname === '/api/auth/logout' && (req.method === 'GET' || req.method === 'POST'))
      return authLogout(req, res, url);
    if (pathname === '/api/auth/signup' && req.method === 'POST') return authSignup(req, res, url);
    if (pathname === '/api/auth/confirm' && req.method === 'GET') return authConfirm(req, res, url);
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[server]', e);
    return gate.sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Woonwekker API+static http://${HOST}:${PORT}/`);
  console.log(`Mollie: ${gate.mollieEnabled() ? 'configured' : 'MISSING — fail-closed (no unlock)'}`);
  console.log(`Google OAuth: ${auth.googleConfigured() ? 'configured' : 'MISSING — fail-closed'}`);
  console.log(`Resend email: ${auth.resendConfigured() ? 'configured' : 'MISSING — fail-closed'}`);
});
