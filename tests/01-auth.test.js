const assert = require('assert');
const { post, get, setCookie, setSuperCookie, clearCookie, getCookie } = require('./helpers');

// Shared state across tests in this file
let superCookieVal = '';
let orgCookieVal = '';

module.exports = {
  'init database': async () => {
    // First call initializes the DB schema and seed data
    const res = await get('/api/init');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin login (admin/admin, no org)': async () => {
    const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
    assert.strictEqual(res.status, 200);
    assert(res.data.user, 'response should have user object');
    assert.strictEqual(res.data.user.is_super_admin, true);
    assert.strictEqual(res.data.user.username, 'admin');
    // Save super admin cookie
    assert(res.setCookie, 'should set session cookie');
    superCookieVal = res.setCookie.split(';')[0];
    setSuperCookie(superCookieVal);
    setCookie(superCookieVal);
  },

  'org user login (cue/admin123, org=demo)': async () => {
    const res = await post('/api/auth/login', { username: 'cue', password: 'admin123', org_slug: 'globex' });
    assert.strictEqual(res.status, 200);
    assert(res.data.user, 'response should have user object');
    assert.strictEqual(res.data.user.username, 'cue');
    assert.strictEqual(res.data.user.org_slug, 'globex');
    assert.strictEqual(res.data.user.is_super_admin, false);
    orgCookieVal = res.setCookie.split(';')[0];
    setCookie(orgCookieVal);
  },

  'login with wrong password': async () => {
    const res = await post('/api/auth/login', { username: 'admin', password: 'wrongpassword' });
    assert.strictEqual(res.status, 401);
    assert(res.data.error, 'should have error message');
  },

  'login with nonexistent user': async () => {
    const res = await post('/api/auth/login', { username: 'nouser999', password: 'whatever' });
    assert.strictEqual(res.status, 401);
    assert(res.data.error, 'should have error message');
  },

  'login with nonexistent org': async () => {
    const res = await post('/api/auth/login', { username: 'cue', password: 'admin123', org_slug: 'nonexistent-org' });
    assert.strictEqual(res.status, 401);
    assert(res.data.error, 'should have error message');
  },

  'GET /api/auth/me with valid cookie': async () => {
    setCookie(orgCookieVal);
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 200);
    assert(res.data.user, 'should have user object');
    assert(res.data.org, 'should have org object');
    assert.strictEqual(res.data.user.username, 'cue');
    assert(res.data.user.org_id, 'should have org_id');
    assert(Array.isArray(res.data.user.permissions), 'should have permissions array');
  },

  'GET /api/auth/me without cookie': async () => {
    clearCookie();
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 401);
    assert(res.data.error, 'should have error message');
  },

  'POST /api/auth/logout clears cookie': async () => {
    // Login first
    const loginRes = await post('/api/auth/login', { username: 'cue', password: 'admin123', org_slug: 'globex' });
    assert.strictEqual(loginRes.status, 200);
    setCookie(loginRes.setCookie.split(';')[0]);

    const res = await post('/api/auth/logout', {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'login after logout works': async () => {
    clearCookie();
    const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.is_super_admin, true);
    // Restore super admin cookie for next tests
    superCookieVal = res.setCookie.split(';')[0];
    setSuperCookie(superCookieVal);
    setCookie(superCookieVal);
  },
};
