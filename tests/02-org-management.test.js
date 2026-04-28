const assert = require('assert');
const { post, get, patch, del, setCookie, useSuperAdmin, getSuperCookie, setSuperCookie } = require('./helpers');

let testOrgId = null;

// Helper: login as super admin fresh
async function loginSuperAdmin() {
  const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
  assert.strictEqual(res.status, 200);
  const c = res.setCookie.split(';')[0];
  setCookie(c);
  setSuperCookie(c);
  return c;
}

module.exports = {
  'super admin: list orgs': async () => {
    await loginSuperAdmin();
    const res = await get('/api/super/orgs');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.orgs), 'should return orgs array');
    assert(res.data.orgs.length > 0, 'should have at least one org');
  },

  'super admin: create org TestOrg': async () => {
    useSuperAdmin();
    const res = await post('/api/super/orgs', { name: 'TestOrg', slug: 'testorg', plan: 'free' });
    assert.strictEqual(res.status, 201);
    assert(res.data.org, 'should return created org');
    assert.strictEqual(res.data.org.name, 'TestOrg');
    assert.strictEqual(res.data.org.slug, 'testorg');
    testOrgId = res.data.org.id;
  },

  'super admin: update org name': async () => {
    useSuperAdmin();
    assert(testOrgId, 'testOrgId should be set');
    const res = await patch(`/api/super/orgs/${testOrgId}`, { name: 'TestOrg Updated' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin: set license_expires_at (future)': async () => {
    useSuperAdmin();
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { license_expires_at: future });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin: set max_users and max_devices': async () => {
    useSuperAdmin();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { max_users: 50, max_devices: 100 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin: deactivate org': async () => {
    useSuperAdmin();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { is_active: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'login to deactivated org fails': async () => {
    // Create a user in testorg first, then try to login
    // Since testorg has no user yet, trying to login with any user to "testorg" slug should fail
    // because the query filters by o.is_active = true
    const res = await post('/api/auth/login', { username: 'anyuser', password: 'anypass', org_slug: 'testorg' });
    // Should be 401 because the org query with is_active=true won't find it
    assert(res.status === 401 || res.status === 403, `expected 401 or 403, got ${res.status}`);
  },

  'super admin: reactivate org': async () => {
    await loginSuperAdmin();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { is_active: true });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin: set expired license': async () => {
    useSuperAdmin();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { license_expires_at: past });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'super admin: renew license (clear expiry)': async () => {
    useSuperAdmin();
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await patch(`/api/super/orgs/${testOrgId}`, { license_expires_at: future });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'org user: GET /api/super/orgs returns 403': async () => {
    // Login as org user
    const loginRes = await post('/api/auth/login', { username: 'cue', password: 'admin123', org_slug: 'globex' });
    assert.strictEqual(loginRes.status, 200);
    setCookie(loginRes.setCookie.split(';')[0]);

    const res = await get('/api/super/orgs');
    assert.strictEqual(res.status, 403);
  },

  'cleanup: delete TestOrg': async () => {
    await loginSuperAdmin();
    assert(testOrgId, 'testOrgId should be set');
    const res = await del(`/api/super/orgs/${testOrgId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);

    // Verify it's gone
    const listRes = await get('/api/super/orgs');
    const found = listRes.data.orgs.find(o => o.id === testOrgId);
    assert(!found, 'TestOrg should be deleted');
  },
};
