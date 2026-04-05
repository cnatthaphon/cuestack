const assert = require('assert');
const { post, get, patch, del, setCookie } = require('./helpers');

let orgCookie = '';
let testChannelId = null;
let testTokenId = null;
let testTokenValue = null;

async function loginOrgAdmin() {
  const res = await post('/api/auth/login', {
    username: 'cue',
    password: 'admin123',
    org_slug: 'aimagin',
  });
  assert.strictEqual(res.status, 200);
  orgCookie = res.setCookie.split(';')[0];
  setCookie(orgCookie);
}

module.exports = {
  'login as org admin': async () => {
    await loginOrgAdmin();
  },

  'GET /api/channels lists channels': async () => {
    setCookie(orgCookie);
    const res = await get('/api/channels');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.channels), 'should return channels array');
    assert(Array.isArray(res.data.tokens), 'should return tokens array');
    assert(res.data.connection, 'should return connection info');
  },

  'POST /api/channels creates new channel': async () => {
    setCookie(orgCookie);
    const res = await post('/api/channels', {
      name: 'e2e-test-channel',
      description: 'E2E test channel',
      channel_type: 'data',
    });
    assert.strictEqual(res.status, 201);
    assert(res.data.channel, 'should return channel object');
    assert.strictEqual(res.data.channel.name, 'e2e-test-channel');
    testChannelId = res.data.channel.id;
  },

  'POST /api/channels create_token': async () => {
    setCookie(orgCookie);
    const res = await post('/api/channels', {
      action: 'create_token',
      name: 'E2E Test Token',
      permissions: ['publish', 'subscribe'],
    });
    assert.strictEqual(res.status, 201);
    assert(res.data.token, 'should return token value');
    assert(res.data.prefix, 'should return token prefix');
    assert(res.data.token.startsWith('cht_'), 'token should start with cht_');
    testTokenValue = res.data.token;
  },

  'GET /api/channels shows new channel and token': async () => {
    setCookie(orgCookie);
    const res = await get('/api/channels');
    assert.strictEqual(res.status, 200);

    const ch = res.data.channels.find(c => c.name === 'e2e-test-channel');
    assert(ch, 'new channel should be in the list');

    const tk = res.data.tokens.find(t => t.name === 'E2E Test Token');
    assert(tk, 'new token should be in the list');
    testTokenId = tk.id;
  },

  'PATCH /api/channels/{id} disable channel': async () => {
    setCookie(orgCookie);
    assert(testChannelId, 'testChannelId must be set');
    const res = await patch(`/api/channels/${testChannelId}`, { is_active: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'POST /api/channels disable_token': async () => {
    setCookie(orgCookie);
    assert(testTokenId, 'testTokenId must be set');
    const res = await post('/api/channels', {
      action: 'disable_token',
      token_id: testTokenId,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.active, false);
  },

  'POST /api/channels enable_token': async () => {
    setCookie(orgCookie);
    const res = await post('/api/channels', {
      action: 'enable_token',
      token_id: testTokenId,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.active, true);
  },

  'POST /api/channels delete_token': async () => {
    setCookie(orgCookie);
    const res = await post('/api/channels', {
      action: 'delete_token',
      token_id: testTokenId,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'DELETE /api/channels/{id} delete channel': async () => {
    setCookie(orgCookie);
    assert(testChannelId, 'testChannelId must be set');
    const res = await del(`/api/channels/${testChannelId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'verify channel and token are gone': async () => {
    setCookie(orgCookie);
    const res = await get('/api/channels');
    assert.strictEqual(res.status, 200);

    const ch = res.data.channels.find(c => c.id === testChannelId);
    assert(!ch, 'deleted channel should not be in the list');

    const tk = res.data.tokens.find(t => t.id === testTokenId);
    assert(!tk, 'deleted token should not be in the list');
  },
};
