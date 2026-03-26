import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "./db.js";

const STORE_ROOT = process.env.FILES_ROOT || "/files";
function storeDir(orgId) { const s = orgId.replace(/-/g, "").slice(0, 8); return path.join(STORE_ROOT, `store_${s}`); }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

// Access levels: owner > editor > viewer
// shared_with: [{ type: "user"|"role", id: N, access: "editor"|"viewer" }]

// --- Access check ---
// Returns: "owner", "editor", "viewer", or null (no access)
export function getAccessLevel(entry, userId, roleIds = []) {
  if (!entry) return null;
  if (entry.created_by === userId) return "owner";
  if (entry.visibility === "public") return "viewer";
  if (entry.visibility === "org") return "viewer"; // org = everyone can view

  const shared = entry.shared_with || [];
  let best = null;
  for (const s of shared) {
    const match =
      (s.type === "user" && s.id === userId) ||
      (s.type === "role" && roleIds.includes(s.id));
    if (match) {
      const level = s.access || "viewer";
      if (level === "editor") return "editor"; // editor is highest shared level
      best = "viewer";
    }
  }
  return best;
}

export function canAccess(entry, userId, roleIds = []) {
  return getAccessLevel(entry, userId, roleIds) !== null;
}

// --- List files by view ---
export async function listMyFiles(orgId, userId, parentId = null) {
  const result = await query(
    `SELECT * FROM org_file_entries WHERE org_id = $1 AND created_by = $2 AND ${parentId ? "parent_id = $3" : "parent_id IS NULL"} ORDER BY entry_type ASC, name ASC`,
    parentId ? [orgId, userId, parentId] : [orgId, userId]
  );
  return result.rows;
}

export async function listSharedWithMe(orgId, userId, roleIds = []) {
  // Find all entries shared with this user or any of their roles
  const conditions = [`f.shared_with @> $3::jsonb`];
  const params = [orgId, userId, JSON.stringify([{ type: "user", id: userId }])];
  let i = 4;
  for (const rid of roleIds) {
    conditions.push(`f.shared_with @> $${i}::jsonb`);
    params.push(JSON.stringify([{ type: "role", id: rid }]));
    i++;
  }

  const result = await query(
    `SELECT f.*, u.username as owner_name, u.first_name as owner_first, u.last_name as owner_last
     FROM org_file_entries f LEFT JOIN users u ON f.created_by = u.id
     WHERE f.org_id = $1 AND f.created_by != $2 AND (${conditions.join(" OR ")})
     ORDER BY f.updated_at DESC`,
    params
  );

  // Add computed access level for each entry
  return result.rows.map((r) => ({
    ...r,
    my_access: getAccessLevel(r, userId, roleIds),
  }));
}

export async function listOrgFiles(orgId, parentId = null) {
  const result = await query(
    `SELECT f.*, u.username as owner_name FROM org_file_entries f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.org_id = $1 AND f.visibility = 'org' AND ${parentId ? "f.parent_id = $2" : "f.parent_id IS NULL"}
     ORDER BY f.entry_type ASC, f.name ASC`,
    parentId ? [orgId, parentId] : [orgId]
  );
  return result.rows;
}

// --- Get single entry ---
export async function getEntry(orgId, entryId) {
  const result = await query("SELECT * FROM org_file_entries WHERE id = $1 AND org_id = $2", [entryId, orgId]);
  return result.rows[0] || null;
}

// --- Create directory ---
export async function createDirectory(orgId, name, parentId = null, userId = null, visibility = "private") {
  if (!name || !/^[^/\\<>:"|?*]+$/.test(name)) throw new Error("Invalid directory name");
  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, visibility, created_by) VALUES ($1, $2, $3, 'directory', $4, $5) RETURNING *`,
    [orgId, name, parentId || null, visibility, userId]
  );
  return result.rows[0];
}

// --- Upload file ---
export async function uploadFile(orgId, name, parentId, buffer, mimeType, userId, visibility = "private") {
  if (!name) throw new Error("File name required");
  const limit = await getLimit(orgId);
  const usage = await getUsage(orgId);
  if (usage + buffer.length > limit) throw new Error(`Storage limit exceeded (${Math.round(limit / 1024 / 1024)}MB)`);
  const storageKey = crypto.randomUUID();
  await ensureDir(storeDir(orgId));
  await fs.writeFile(path.join(storeDir(orgId), storageKey), buffer);
  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, storage_key, size, mime_type, visibility, created_by) VALUES ($1, $2, $3, 'file', $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, name, parentId || null, storageKey, buffer.length, mimeType || "application/octet-stream", visibility, userId]
  );
  return result.rows[0];
}

// --- Download ---
export async function downloadFile(orgId, entryId) {
  const entry = await getEntry(orgId, entryId);
  if (!entry || entry.entry_type !== "file") throw new Error("File not found");
  const buffer = await fs.readFile(path.join(storeDir(orgId), entry.storage_key));
  return { buffer, filename: entry.name, size: entry.size, mime_type: entry.mime_type };
}

// --- Rename (owner only) ---
export async function renameEntry(orgId, entryId, newName) {
  if (!newName || !/^[^/\\<>:"|?*]+$/.test(newName)) throw new Error("Invalid name");
  await query("UPDATE org_file_entries SET name = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3", [newName, entryId, orgId]);
}

// --- Move (owner only) ---
export async function moveEntry(orgId, entryId, newParentId) {
  if (newParentId) {
    let check = newParentId;
    while (check) {
      if (check === entryId) throw new Error("Cannot move into own subdirectory");
      const parent = await query("SELECT parent_id FROM org_file_entries WHERE id = $1", [check]);
      check = parent.rows[0]?.parent_id || null;
    }
  }
  await query("UPDATE org_file_entries SET parent_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3", [newParentId || null, entryId, orgId]);
}

// --- Delete (owner only, recursive) ---
export async function deleteEntry(orgId, entryId) {
  const entry = await getEntry(orgId, entryId);
  if (!entry) return false;
  if (entry.entry_type === "file" && entry.storage_key) {
    try { await fs.unlink(path.join(storeDir(orgId), entry.storage_key)); } catch {}
  }
  if (entry.entry_type === "directory") {
    const children = await query("SELECT id FROM org_file_entries WHERE org_id = $1 AND parent_id = $2", [orgId, entryId]);
    for (const child of children.rows) await deleteEntry(orgId, child.id);
  }
  await query("DELETE FROM org_file_entries WHERE id = $1 AND org_id = $2", [entryId, orgId]);
  return true;
}

// --- Share ---
export async function shareEntry(orgId, entryId, shareWith) {
  // shareWith: [{ type: "user", id: 1, access: "editor" }, { type: "role", id: 5, access: "viewer" }]
  await query("UPDATE org_file_entries SET shared_with = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [JSON.stringify(shareWith), entryId, orgId]);
}

export async function setVisibility(orgId, entryId, visibility) {
  if (!["private", "org", "public"].includes(visibility)) throw new Error("Invalid visibility");
  await query("UPDATE org_file_entries SET visibility = $1, is_public = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4",
    [visibility, visibility === "public", entryId, orgId]);
}

// --- Breadcrumb ---
export async function getBreadcrumb(orgId, entryId) {
  const crumbs = [];
  let current = entryId;
  while (current) {
    const entry = await query("SELECT id, name, parent_id FROM org_file_entries WHERE id = $1 AND org_id = $2", [current, orgId]);
    if (!entry.rows[0]) break;
    crumbs.unshift({ id: entry.rows[0].id, name: entry.rows[0].name });
    current = entry.rows[0].parent_id;
  }
  return crumbs;
}

// --- Get entry by path ---
export async function getEntryByPath(orgId, filePath) {
  const parts = filePath.split("/").filter(Boolean);
  let parentId = null;
  let entry = null;
  for (const name of parts) {
    const result = await query(
      `SELECT * FROM org_file_entries WHERE org_id = $1 AND name = $2 AND ${parentId ? "parent_id = $3" : "parent_id IS NULL"}`,
      parentId ? [orgId, name, parentId] : [orgId, name]
    );
    entry = result.rows[0];
    if (!entry) return null;
    parentId = entry.id;
  }
  return entry;
}

// --- Storage stats ---
async function getUsage(orgId) {
  const result = await query("SELECT COALESCE(SUM(size), 0) as total FROM org_file_entries WHERE org_id = $1 AND entry_type = 'file'", [orgId]);
  return parseInt(result.rows[0].total);
}
async function getLimit(orgId) {
  const result = await query("SELECT storage_limit_mb FROM organizations WHERE id = $1", [orgId]);
  return (result.rows[0]?.storage_limit_mb || 1000) * 1024 * 1024;
}
export async function getStorageStats(orgId) {
  const usage = await getUsage(orgId);
  const limit = await getLimit(orgId);
  return { used_bytes: usage, used_mb: Math.round(usage / 1024 / 1024 * 10) / 10, limit_mb: Math.round(limit / 1024 / 1024), percent: Math.round(usage / limit * 100) };
}
