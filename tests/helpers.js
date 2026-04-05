const BASE = process.env.BASE_URL || 'http://localhost:8080';
let cookie = '';
let superCookie = '';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function rawGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return res;
}

function setCookie(c) { cookie = c; }
function getCookie() { return cookie; }
function setSuperCookie(c) { superCookie = c; }
function getSuperCookie() { return superCookie; }
function useSuperAdmin() { cookie = superCookie; }
function useOrgUser(c) { cookie = c; }
function clearCookie() { cookie = ''; }

module.exports = { BASE, post, get, patch, del, rawGet, setCookie, getCookie, setSuperCookie, getSuperCookie, useSuperAdmin, useOrgUser, clearCookie };
