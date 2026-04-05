const assert = require('assert');
const { post, get, patch, del, setCookie } = require('./helpers');

let orgCookie = '';
let folderId = null;
let pageId = null;

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
  'login as org admin for pages': async () => {
    await loginOrgAdmin();
  },

  'POST /api/pages create folder': async () => {
    setCookie(orgCookie);
    const res = await post('/api/pages', {
      name: 'E2E Test Folder',
      entry_type: 'folder',
    });
    assert.strictEqual(res.status, 201);
    assert(res.data.page, 'should return page/folder object');
    assert.strictEqual(res.data.page.entry_type, 'folder');
    assert.strictEqual(res.data.page.name, 'E2E Test Folder');
    folderId = res.data.page.id;
  },

  'POST /api/pages create dashboard page in folder': async () => {
    setCookie(orgCookie);
    const res = await post('/api/pages', {
      name: 'E2E Test Dashboard',
      page_type: 'dashboard',
      parent_id: folderId,
    });
    assert.strictEqual(res.status, 201);
    assert(res.data.page, 'should return page object');
    assert.strictEqual(res.data.page.page_type, 'dashboard');
    assert.strictEqual(res.data.page.parent_id, folderId);
    pageId = res.data.page.id;
  },

  'GET /api/pages lists folder and page': async () => {
    setCookie(orgCookie);
    const res = await get('/api/pages');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.pages), 'should return pages array');

    const folder = res.data.pages.find(p => p.id === folderId);
    assert(folder, 'folder should be in the list');

    const page = res.data.pages.find(p => p.id === pageId);
    assert(page, 'page should be in the list');
  },

  'PATCH /api/pages/{id} update config': async () => {
    setCookie(orgCookie);
    const res = await patch(`/api/pages/${pageId}`, {
      config: { widgets: [{ type: 'text', content: 'Hello E2E' }], layout: { columns: 3 } },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'PATCH /api/pages/{id} change visibility to org': async () => {
    setCookie(orgCookie);
    const res = await patch(`/api/pages/${pageId}`, {
      visibility: 'org',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'verify page is visible as shared': async () => {
    setCookie(orgCookie);
    // Get the page directly — owner can always see it
    const res = await get(`/api/pages/${pageId}`);
    assert.strictEqual(res.status, 200);
    assert(res.data.page, 'should return page');
    assert.strictEqual(res.data.page.visibility, 'org');
  },

  'GET /api/pages?view=shared shows org-visible pages': async () => {
    // This is tested from the owner's perspective as we need a different user
    // to truly test shared view; we verify the endpoint works
    setCookie(orgCookie);
    const res = await get('/api/pages?view=shared');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.pages), 'should return pages array');
    // Shared view excludes own pages, so our page may not appear here
    // Just verify the endpoint works without error
  },

  'DELETE /api/pages/{id} delete page': async () => {
    setCookie(orgCookie);
    const res = await del(`/api/pages/${pageId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'DELETE /api/pages/{folderId} delete folder': async () => {
    setCookie(orgCookie);
    const res = await del(`/api/pages/${folderId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  },

  'verify page and folder are gone': async () => {
    setCookie(orgCookie);
    const res = await get('/api/pages');
    assert.strictEqual(res.status, 200);
    const folder = res.data.pages.find(p => p.id === folderId);
    assert(!folder, 'folder should be deleted');
    const page = res.data.pages.find(p => p.id === pageId);
    assert(!page, 'page should be deleted');
  },
};
