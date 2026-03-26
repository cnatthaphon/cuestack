import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "./db.js";

// Physical storage — flat, files stored by UUID key
const STORE_ROOT = process.env.FILES_ROOT || "/files";

function storeDir(orgId) {
  const short = orgId.replace(/-/g, "").slice(0, 8);
  return path.join(STORE_ROOT, `store_${short}`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// visibility: 'private' (only owner), 'org' (all org members), 'public' (anyone with link)
// shared_with: [{ type: 'user', id: 1 }, { type: 'role', id: 5 }]

// --- List files by view ---

// My Files — files I own in a specific parent
export async function listMyFiles(orgId, userId, parentId = null) {
  const result = await query(
    `SELECT * FROM org_file_entries
     WHERE org_id = $1 AND created_by = $2 AND ${parentId ? "parent_id = $3" : "parent_id IS NULL"}
     ORDER BY entry_type ASC, name ASC`,
    parentId ? [orgId, userId, parentId] : [orgId, userId]
  );
  return result.rows;
}

// Shared with me — files others shared with me (via user ID or my role IDs)
export async function listSharedWithMe(orgId, userId, roleId) {
  const result = await query(
    `SELECT f.*, u.username as owner_name FROM org_file_entries f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.org_id = $1 AND f.created_by != $2
     AND (
       f.shared_with @> $3::jsonb
       OR f.shared_with @> $4::jsonb
     )
     ORDER BY f.updated_at DESC`,
    [orgId, userId, JSON.stringify([{ type: "user", id: userId }]), JSON.stringify([{ type: "role", id: roleId }])]
  );
  return result.rows;
}

// Org Files — files with visibility = 'org'
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

// --- Get single entry (with access check) ---
export async function getEntry(orgId, entryId) {
  const result = await query(
    "SELECT * FROM org_file_entries WHERE id = $1 AND org_id = $2",
    [entryId, orgId]
  );
  return result.rows[0] || null;
}

export function canAccess(entry, userId, roleId) {
  if (!entry) return false;
  if (entry.created_by === userId) return true; // owner
  if (entry.visibility === "org" || entry.visibility === "public") return true;
  // Check shared_with
  const shared = entry.shared_with || [];
  return shared.some((s) =>
    (s.type === "user" && s.id === userId) ||
    (s.type === "role" && s.id === roleId)
  );
}

// --- Create directory ---
export async function createDirectory(orgId, name, parentId = null, userId = null, visibility = "private") {
  if (!name || !/^[^/\\<>:"|?*]+$/.test(name)) throw new Error("Invalid directory name");
  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, visibility, created_by)
     VALUES ($1, $2, $3, 'directory', $4, $5) RETURNING *`,
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
  const dir = storeDir(orgId);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, storageKey), buffer);

  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, storage_key, size, mime_type, visibility, created_by)
     VALUES ($1, $2, $3, 'file', $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, name, parentId || null, storageKey, buffer.length, mimeType || "application/octet-stream", visibility, userId]
  );
  return result.rows[0];
}

// --- Download file ---
export async function downloadFile(orgId, entryId) {
  const entry = await getEntry(orgId, entryId);
  if (!entry || entry.entry_type !== "file") throw new Error("File not found");
  const filePath = path.join(storeDir(orgId), entry.storage_key);
  const buffer = await fs.readFile(filePath);
  return { buffer, filename: entry.name, size: entry.size, mime_type: entry.mime_type };
}

// --- Rename (instant — DB only) ---
export async function renameEntry(orgId, entryId, newName) {
  if (!newName || !/^[^/\\<>:"|?*]+$/.test(newName)) throw new Error("Invalid name");
  await query("UPDATE org_file_entries SET name = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3", [newName, entryId, orgId]);
}

// --- Move (instant — DB only) ---
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

// --- Delete ---
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
  // shareWith: [{ type: 'user', id: 1 }, { type: 'role', id: 5 }]
  await query(
    "UPDATE org_file_entries SET shared_with = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [JSON.stringify(shareWith), entryId, orgId]
  );
}

export async function setVisibility(orgId, entryId, visibility) {
  if (!["private", "org", "public"].includes(visibility)) throw new Error("Invalid visibility");
  await query(
    "UPDATE org_file_entries SET visibility = $1, is_public = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4",
    [visibility, visibility === "public", entryId, orgId]
  );
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
