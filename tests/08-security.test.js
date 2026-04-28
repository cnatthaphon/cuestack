const assert = require('assert');
const { post, get, setCookie, clearCookie, rawGet, BASE } = require('./helpers');

let orgACookie = '';

module.exports = {
  'setup: login as org user A (demo)': async () => {
    const res = await post('/api/auth/login', {
      username: 'cue',
      password: 'admin123',
      org_slug: 'globex',
    });
    assert.strictEqual(res.status, 200);
    orgACookie = res.setCookie.split(';')[0];
    setCookie(orgACookie);
  },

  'org user: cannot access super admin endpoints': async () => {
    setCookie(orgACookie);
    const res = await get('/api/super/orgs');
    assert.strictEqual(res.status, 403);
  },

  'org user: cannot access super admin stats': async () => {
    setCookie(orgACookie);
    const res = await get('/api/super/stats');
    assert.strictEqual(res.status, 403);
  },

  'security headers present (X-Content-Type-Options)': async () => {
    setCookie(orgACookie);
    const res = await rawGet('/api/auth/me');
    const xcto = res.headers.get('x-content-type-options');
    assert.strictEqual(xcto, 'nosniff', 'X-Content-Type-Options should be nosniff');
  },

  'security headers present (X-Frame-Options)': async () => {
    setCookie(orgACookie);
    const res = await rawGet('/api/auth/me');
    const xfo = res.headers.get('x-frame-options');
    assert.strictEqual(xfo, 'SAMEORIGIN', 'X-Frame-Options should be SAMEORIGIN');
  },

  'security headers present (Strict-Transport-Security)': async () => {
    setCookie(orgACookie);
    const res = await rawGet('/api/auth/me');
    const hsts = res.headers.get('strict-transport-security');
    assert(hsts, 'Strict-Transport-Security header should be present');
    assert(hsts.includes('max-age'), 'HSTS should include max-age');
  },

  'security headers present (Content-Security-Policy)': async () => {
    setCookie(orgACookie);
    const res = await rawGet('/api/auth/me');
    const csp = res.headers.get('content-security-policy');
    assert(csp, 'Content-Security-Policy header should be present');
    assert(csp.includes("default-src"), 'CSP should include default-src');
  },

  'security headers: no server version leak': async () => {
    setCookie(orgACookie);
    const res = await rawGet('/api/health');
    const server = res.headers.get('server');
    // nginx may expose "nginx" but should not expose version
    if (server) {
      assert(!server.match(/nginx\/\d/), 'Server header should not expose nginx version');
    }
  },

  'expired/invalid JWT returns 401': async () => {
    // Use a clearly invalid JWT token
    setCookie('cuestack-session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnZhbGlkIjp0cnVlfQ.invalid');
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 401, `expected 401 for invalid JWT, got ${res.status}`);
  },

  'no cookie returns 401 on protected endpoints': async () => {
    clearCookie();

    const endpoints = [
      '/api/auth/me',
      '/api/pages',
      '/api/users',
      '/api/channels',
    ];

    for (const ep of endpoints) {
      const res = await get(ep);
      assert.strictEqual(res.status, 401, `${ep} should return 401 without auth, got ${res.status}`);
    }
  },

  'POST /api/auth/login with empty body returns 400': async () => {
    clearCookie();
    const res = await post('/api/auth/login', {});
    assert(res.status === 400 || res.status === 401,
      `expected 400 or 401 for empty login, got ${res.status}`);
  },

  'health endpoint is public (no auth needed)': async () => {
    clearCookie();
    const res = await get('/api/health');
    assert.strictEqual(res.status, 200);
    assert(res.data.status, 'health should have status field');
  },
};
