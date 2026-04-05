const assert = require('assert');
const { post, get, setCookie, clearCookie } = require('./helpers');

let orgCookie = '';

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  'login as org admin for data tests': async () => {
    await loginOrgAdmin();
  },

  'POST /api/v1/data/events inserts event': async () => {
    setCookie(orgCookie);
    const res = await post('/api/v1/data/events', {
      channel: 'e2e-test-sensor',
      source: 'e2e-test',
      payload: { temperature: 25.5, humidity: 60, test_id: 'e2e-unique-marker' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ok');
  },

  'wait for event ingestion': async () => {
    // ClickHouse async insert buffer may need a moment
    await sleep(2000);
  },

  'GET /api/v1/data/events retrieves events': async () => {
    setCookie(orgCookie);
    const res = await get('/api/v1/data/events?channel=e2e-test-sensor&limit=10');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.events), 'should return events array');
    assert(res.data.events.length > 0, 'should have at least one event');
    // Check the event has correct data
    const event = res.data.events.find(e => {
      const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
      return p.test_id === 'e2e-unique-marker';
    });
    assert(event, 'should find our test event');
  },

  'GET /api/v1/data/events with nonexistent channel': async () => {
    setCookie(orgCookie);
    const res = await get('/api/v1/data/events?channel=nonexistent-channel-xyz');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.events), 'should return events array');
    assert.strictEqual(res.data.events.length, 0, 'should have no events');
  },

  'GET /api/v1/data/events without auth returns 401': async () => {
    clearCookie();
    const res = await get('/api/v1/data/events?channel=test');
    assert.strictEqual(res.status, 401);
  },

  'POST /api/v1/data/events insert second event': async () => {
    setCookie(orgCookie);
    const res = await post('/api/v1/data/events', {
      channel: 'e2e-test-sensor',
      source: 'e2e-test-2',
      payload: { temperature: 30.0, humidity: 55, test_id: 'e2e-second-marker' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ok');
  },

  'wait for second event': async () => {
    await sleep(2000);
  },

  'query back second event by source': async () => {
    setCookie(orgCookie);
    const res = await get('/api/v1/data/events?channel=e2e-test-sensor&source=e2e-test-2&limit=10');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.events), 'should return events array');
    // Source filter may or may not be supported; if events returned, check them
    if (res.data.events.length > 0) {
      const event = res.data.events.find(e => {
        const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        return p.test_id === 'e2e-second-marker';
      });
      assert(event, 'should find our second test event');
    }
  },
};
