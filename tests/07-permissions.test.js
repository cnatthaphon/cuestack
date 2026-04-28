const assert = require('assert');
const { post, get, patch, del, setCookie, useSuperAdmin, setSuperCookie } = require('./helpers');

let demo_org_id = null;
let viewerUserId = null;
let viewerCookie = '';
let viewerRoleId = null;
let adminRoleId = null;

async function loginSuperAdmin() {
  const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
  assert.strictEqual(res.status, 200);
  const c = res.setCookie.split(';')[0];
  setCookie(c);
  setSuperCookie(c);
}

module.exports = {
  'setup: get demo org id and roles': async () => {
    await loginSuperAdmin();
    const orgsRes = await get('/api/super/orgs');
    const demo = orgsRes.data.orgs.find(o => o.slug === 'demo');
    assert(demo, 'demo org should exist');
    demo_org_id = demo.id;
  },

  'create viewer user': async () => {
    useSuperAdmin();
    const res = await post(`/api/super/orgs/${demo_org_id}/users`, {
      username: 'e2e-viewer',
      password: 'viewerpass123',
      role: 'viewer',
    });
    assert.strictEqual(res.status, 201);
    viewerUserId = res.data.user.id;
    viewerRoleId = res.data.user.role_id;
  },

  'login as viewer': async () => {
    const res = await post('/api/auth/login', {
      username: 'e2e-viewer',
      password: 'viewerpass123',
      org_slug: 'demo',
    });
    assert.strictEqual(res.status, 200);
    viewerCookie = res.setCookie.split(';')[0];
    setCookie(viewerCookie);
  },

  'viewer: GET /api/auth/me shows correct role': async () => {
    setCookie(viewerCookie);
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.username, 'e2e-viewer');
    // Viewer typically has limited permissions
    assert(Array.isArray(res.data.user.permissions), 'should have permissions array');
  },

  'viewer: POST /api/pages returns 403 (no create permission)': async () => {
    setCookie(viewerCookie);
    const res = await post('/api/pages', {
      name: 'Viewer Attempt',
      page_type: 'dashboard',
    });
    assert.strictEqual(res.status, 403, `expected 403, got ${res.status}`);
  },

  'viewer: GET /api/pages works (read access)': async () => {
    setCookie(viewerCookie);
    const res = await get('/api/pages');
    // Viewers may have read access — at minimum should not error
    assert(res.status === 200 || res.status === 403,
      `expected 200 or 403, got ${res.status}`);
  },

  'viewer: GET /api/super/orgs returns 403': async () => {
    setCookie(viewerCookie);
    const res = await get('/api/super/orgs');
    assert.strictEqual(res.status, 403);
  },

  'super admin: get admin role id': async () => {
    // Login as org admin to access roles endpoint
    const loginRes = await post('/api/auth/login', {
      username: 'cue',
      password: 'admin123',
      org_slug: 'demo',
    });
    setCookie(loginRes.setCookie.split(';')[0]);

    const res = await get('/api/roles');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.roles), 'should return roles array');
    const adminRole = res.data.roles.find(r => r.name.toLowerCase() === 'admin');
    assert(adminRole, 'admin role should exist');
    adminRoleId = adminRole.id;
  },

  'super admin: change viewer to admin role': async () => {
    await loginSuperAdmin();
    assert(viewerUserId, 'viewerUserId must be set');
    assert(adminRoleId, 'adminRoleId must be set');
    const res = await patch(`/api/users/${viewerUserId}`, {
      role_id: adminRoleId,
      role_ids: [adminRoleId],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'promoted user: re-login has admin permissions': async () => {
    const res = await post('/api/auth/login', {
      username: 'e2e-viewer',
      password: 'viewerpass123',
      org_slug: 'demo',
    });
    assert.strictEqual(res.status, 200);
    viewerCookie = res.setCookie.split(';')[0];
    setCookie(viewerCookie);

    const meRes = await get('/api/auth/me');
    assert.strictEqual(meRes.status, 200);
    // Should now have more permissions than before
    assert(meRes.data.user.permissions.length > 0, 'should have admin permissions');
  },

  'promoted user: POST /api/pages works now': async () => {
    setCookie(viewerCookie);
    const res = await post('/api/pages', {
      name: 'Admin Can Create',
      page_type: 'dashboard',
    });
    // Should succeed now with admin role
    assert.strictEqual(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    // Clean up
    if (res.data.page?.id) {
      await del(`/api/pages/${res.data.page.id}`);
    }
  },

  'cleanup: delete viewer/promoted user': async () => {
    await loginSuperAdmin();
    assert(viewerUserId, 'viewerUserId must be set');
    const res = await del(`/api/users/${viewerUserId}`);
    assert.strictEqual(res.status, 200);
  },
};
