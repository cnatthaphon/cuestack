const assert = require('assert');
const { post, get, patch, del, setCookie, useSuperAdmin, setSuperCookie } = require('./helpers');

let demo_org_id = null;
let testUserId = null;
let testUserCookie = null;

async function loginSuperAdmin() {
  const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
  assert.strictEqual(res.status, 200);
  const c = res.setCookie.split(';')[0];
  setCookie(c);
  setSuperCookie(c);
}

module.exports = {
  'setup: get demo org id': async () => {
    await loginSuperAdmin();
    const res = await get('/api/super/orgs');
    assert.strictEqual(res.status, 200);
    const demo = res.data.orgs.find(o => o.slug === 'demo');
    assert(demo, 'demo org should exist');
    demo_org_id = demo.id;
  },

  'super admin: create user in demo org': async () => {
    useSuperAdmin();
    const res = await post(`/api/super/orgs/${demo_org_id}/users`, {
      username: 'e2e-testuser',
      password: 'testpass123',
      role: 'admin',
    });
    assert.strictEqual(res.status, 201);
    assert(res.data.user, 'should return user object');
    assert.strictEqual(res.data.user.username, 'e2e-testuser');
    testUserId = res.data.user.id;
  },

  'login as new user': async () => {
    const res = await post('/api/auth/login', {
      username: 'e2e-testuser',
      password: 'testpass123',
      org_slug: 'demo',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.username, 'e2e-testuser');
    testUserCookie = res.setCookie.split(';')[0];
    setCookie(testUserCookie);
  },

  'new user: GET /api/auth/me has correct data': async () => {
    setCookie(testUserCookie);
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.username, 'e2e-testuser');
    assert(res.data.user.org_id, 'should have org_id');
    assert(res.data.org, 'should have org object');
  },

  'super admin: list users in org shows new user': async () => {
    useSuperAdmin();
    const res = await get(`/api/super/orgs/${demo_org_id}/users`);
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.users), 'should return users array');
    const found = res.data.users.find(u => u.username === 'e2e-testuser');
    assert(found, 'new user should be in the list');
  },

  'super admin: update user profile': async () => {
    useSuperAdmin();
    assert(testUserId, 'testUserId must be set');
    const res = await patch(`/api/users/${testUserId}`, {
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'org user (non-admin): GET /api/super/orgs returns 403': async () => {
    // Create a limited user to test
    useSuperAdmin();
    const res = await post(`/api/super/orgs/${demo_org_id}/users`, {
      username: 'e2e-limited',
      password: 'limitpass123',
      role: 'viewer',
    });
    assert.strictEqual(res.status, 201);

    // Login as limited user
    const loginRes = await post('/api/auth/login', {
      username: 'e2e-limited',
      password: 'limitpass123',
      org_slug: 'demo',
    });
    assert.strictEqual(loginRes.status, 200);
    setCookie(loginRes.setCookie.split(';')[0]);

    const superRes = await get('/api/super/orgs');
    assert.strictEqual(superRes.status, 403);

    // Cleanup limited user
    useSuperAdmin();
    if (res.data.user?.id) {
      await del(`/api/users/${res.data.user.id}`);
    }
  },

  'cleanup: delete test user': async () => {
    useSuperAdmin();
    assert(testUserId, 'testUserId must be set');
    const res = await del(`/api/users/${testUserId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },
};
