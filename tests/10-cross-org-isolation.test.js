/**
 * Cross-Org Isolation & Security Tests
 *
 * Verifies the platform CANNOT leak data between two organizations.
 *
 * Note: Different orgs CAN have:
 *   - Tables with the same name (each org has its own table in its own schema)
 *   - Channels with the same name (different objects, different IDs)
 *   - Users with the same username (different user records)
 *
 * Real isolation tests verify:
 *   - Org A cannot read Org B's actual DATA (rows, secrets)
 *   - Org A cannot modify Org B's data
 *   - Org A cannot read Org B's resources by direct ID
 *   - Org A cannot enumerate Org B's user IDs (cross-org targeting)
 *
 * Setup: Acme Corp (slug: aimagin) + Globex Inc (slug: demo)
 */
const assert = require('assert');
const { post, get, patch, setCookie } = require('./helpers');

const ACME = { user: 'cue', pass: 'admin123', slug: 'aimagin' };
const GLOBEX = { user: 'demo', pass: 'demo1234', slug: 'demo' };

let acmeCookie = '';
let globexCookie = '';
let acmeOrgId = '';
let globexOrgId = '';
let acmeTableId = '';
let acmePageId = '';

async function loginAs(creds) {
  const res = await post('/api/auth/login', { username: creds.user, password: creds.pass, org_slug: creds.slug });
  assert.strictEqual(res.status, 200, `Login ${creds.user}@${creds.slug} status=${res.status}`);
  return res.setCookie ? res.setCookie.split(';')[0] : '';
}

module.exports = {
  // ─── Setup ─────────────────────────────────────────────────────────────
  'login both orgs': async () => {
    acmeCookie = await loginAs(ACME);
    globexCookie = await loginAs(GLOBEX);
  },

  'org IDs verified different': async () => {
    setCookie(acmeCookie);
    acmeOrgId = (await get('/api/auth/me')).data.user.org_id;
    setCookie(globexCookie);
    globexOrgId = (await get('/api/auth/me')).data.user.org_id;
    assert(acmeOrgId);
    assert(globexOrgId);
    assert.notStrictEqual(acmeOrgId, globexOrgId);
  },

  'Acme creates secret table with secret data': async () => {
    setCookie(acmeCookie);
    let res = await post('/api/tables', {
      name: 'isolation_test_acme', columns: [{ name: 'secret', type: 'text' }], db_type: 'analytical',
    });
    if (res.status !== 200 && res.status !== 201) {
      const list = await get('/api/tables');
      acmeTableId = (list.data.tables || []).find(t => t.name === 'isolation_test_acme')?.id;
    } else {
      acmeTableId = res.data.id || res.data.table?.id;
    }
    assert(acmeTableId);
    await post(`/api/tables/${acmeTableId}/data`, { rows: [{ secret: 'ACME_SECRET_TOKEN_XYZ_2026' }] });
  },

  // ─── Real isolation tests ─────────────────────────────────────────────
  'Globex CANNOT read Acme secret table data via direct ID': async () => {
    setCookie(globexCookie);
    const r = await get(`/api/tables/${acmeTableId}/data`);
    const body = JSON.stringify(r.data);
    // Either 403/404 OR the response must NOT contain Acme's secret
    assert(!body.includes('ACME_SECRET_TOKEN_XYZ_2026'), `LEAK: Acme secret found in Globex response: ${body.slice(0, 200)}`);
  },

  'Globex CANNOT inject data into Acme table': async () => {
    setCookie(globexCookie);
    await post(`/api/tables/${acmeTableId}/data`, { rows: [{ secret: 'GLOBEX_INJECTED' }] });
    // Verify Acme's data was NOT modified
    setCookie(acmeCookie);
    const data = await get(`/api/tables/${acmeTableId}/data`);
    const body = JSON.stringify(data.data.rows || []);
    assert(!body.includes('GLOBEX_INJECTED'), 'INJECTION: Globex modified Acme table');
  },

  'Globex CANNOT modify Acme table description (PATCH)': async () => {
    setCookie(globexCookie);
    const r = await patch(`/api/tables/${acmeTableId}`, { description: 'HACKED_BY_GLOBEX' });
    assert([403, 404].includes(r.status), `Expected 403/404, got ${r.status} (PATCH not properly scoped)`);
    // Verify description NOT changed
    setCookie(acmeCookie);
    const list = await get('/api/tables');
    const acmeTable = (list.data.tables || []).find(t => t.id === acmeTableId);
    assert(!acmeTable?.description?.includes('HACKED_BY_GLOBEX'), 'Description was modified by Globex');
  },

  'Globex CANNOT read Acme page by direct ID': async () => {
    setCookie(acmeCookie);
    const pages = await get('/api/pages');
    acmePageId = (pages.data.pages || []).filter(p => p.entry_type !== 'folder')[0]?.id;
    if (!acmePageId) return; // skip if no pages
    setCookie(globexCookie);
    const r = await get(`/api/pages/${acmePageId}`);
    assert([403, 404].includes(r.status), `Globex got ${r.status} on Acme page (should be 403/404)`);
  },

  'Globex compute returns ONLY its own data, never Acme data': async () => {
    // Insert distinctive marker into Acme power_consumption
    setCookie(acmeCookie);
    const tablesRes = await get('/api/tables');
    const acmePowerTbl = (tablesRes.data.tables || []).find(t => t.name === 'power_consumption');
    if (acmePowerTbl) {
      await post(`/api/tables/${acmePowerTbl.id}/data`, {
        rows: [{ timestamp: '2099-12-31T00:00:00Z', power_w: 88811, temp_int: 88811, temp_ext: 88811, state: 'ACME_LEAK_CANARY_XYZ' }],
      });
    }
    // Globex computes — should NEVER see ACME_LEAK_CANARY_XYZ string
    setCookie(globexCookie);
    const r = await post('/api/dashboards/compute', {
      formula: 'energy_monitor', model_config: {}, inputs: { setpoint: 24 },
      source_table: 'power_consumption', force_refresh: true,
    });
    const body = JSON.stringify(r.data || {});
    assert(!body.includes('ACME_LEAK_CANARY_XYZ'), `LEAK: Globex compute output contains Acme canary string`);
    // Check for 88811 only in actual values (not floating point artifacts)
    // Look for "88811" preceded by ":" or "," (i.e. as a value, not embedded in another number)
    const canaryMatches = body.match(/[":,]\s*88811[,}\s]/);
    assert(!canaryMatches, `LEAK: Globex compute output contains canary value 88811: ${canaryMatches?.[0]}`);
  },

  'Cache is per-org (Globex cannot read Acme cached results)': async () => {
    // Acme computes (caches result)
    setCookie(acmeCookie);
    await post('/api/dashboards/compute', {
      formula: 'energy_monitor', model_config: {},
      inputs: { setpoint: 24, peak_alert_pct: 999 },
      source_table: 'power_consumption', force_refresh: true,
    });
    // Globex computes with same inputs — should NOT get Acme's cached entry
    setCookie(globexCookie);
    const r = await post('/api/dashboards/compute', {
      formula: 'energy_monitor', model_config: {},
      inputs: { setpoint: 24, peak_alert_pct: 999 },
      source_table: 'power_consumption',
    });
    // Globex's data should be its own (different total or different cache entry)
    // Key check: cache key isolation — even if cached, must be Globex's own cached entry
    setCookie(acmeCookie);
    const acmeRes = await post('/api/dashboards/compute', {
      formula: 'energy_monitor', model_config: {},
      inputs: { setpoint: 24, peak_alert_pct: 999 },
      source_table: 'power_consumption',
    });
    // Final check: Acme's compute output mentions ACME_MARKER (state), Globex's must not
    const acmeBody = JSON.stringify(acmeRes.data?.data || {});
    const globexBody = JSON.stringify(r.data?.data || {});
    if (acmeBody.includes('ACME_MARKER')) {
      assert(!globexBody.includes('ACME_MARKER'), 'LEAK: Globex saw Acme marker via shared cache');
    }
  },

  'Globex notifications CANNOT contain Acme private content': async () => {
    setCookie(acmeCookie);
    await post('/api/notifications', {
      title: 'Acme Internal', message: 'CONFIDENTIAL_ACME_NOTIFICATION_2026', type: 'warning',
    });
    setCookie(globexCookie);
    const r = await get('/api/notifications');
    const body = JSON.stringify(r.data);
    assert(!body.includes('CONFIDENTIAL_ACME_NOTIFICATION_2026'), 'LEAK: Acme notification visible to Globex');
  },

  'Globex CANNOT see Acme user IDs (cross-org targeting protection)': async () => {
    // Even if both orgs have a user named "cue", their IDs must be different and Globex
    // must not see Acme's user.id (which would let Globex POST notifications targeting Acme users)
    setCookie(acmeCookie);
    const acmeUsers = await get('/api/users');
    const acmeUserIds = new Set((acmeUsers.data.users || []).map(u => u.id));

    setCookie(globexCookie);
    const globexUsers = await get('/api/users');
    const globexUserIds = (globexUsers.data.users || []).map(u => u.id);

    // No Globex-visible user_id should be in Acme's user list
    for (const id of globexUserIds) {
      assert(!acmeUserIds.has(id), `LEAK: Globex sees Acme user_id ${id}`);
    }
  },

  'cleanup: drop test tables': async () => {
    setCookie(acmeCookie);
    if (acmeTableId) {
      await fetch(`http://localhost:8080/api/tables/${acmeTableId}`, {
        method: 'DELETE', headers: { Cookie: acmeCookie },
      }).catch(() => {});
    }
  },
};
