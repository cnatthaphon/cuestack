import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "./db.js";

// Physical storage — flat structure, files stored by UUID key
const STORE_ROOT = process.env.FILES_ROOT || "/files";

function storeDir(orgId) {
  const short = orgId.replace(/-/g, "").slice(0, 8);
  return path.join(STORE_ROOT, `store_${short}`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// --- List entries in a directory ---
export async function listFiles(orgId, parentId = null) {
  const result = await query(
    `SELECT id, name, parent_id, entry_type, size, mime_type, is_public, created_by, created_at, updated_at
     FROM org_file_entries WHERE org_id = $1 AND ${parentId ? "parent_id = $2" : "parent_id IS NULL"}
     ORDER BY entry_type ASC, name ASC`,
    parentId ? [orgId, parentId] : [orgId]
  );
  return result.rows;
}

// --- Get single entry ---
export async function getEntry(orgId, entryId) {
  const result = await query(
    "SELECT * FROM org_file_entries WHERE id = $1 AND org_id = $2",
    [entryId, orgId]
  );
  return result.rows[0] || null;
}

// --- Get entry by path (traverse from root) ---
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

// --- Create directory ---
export async function createDirectory(orgId, name, parentId = null, userId = null) {
  if (!name || !/^[^/\\<>:"|?*]+$/.test(name)) throw new Error("Invalid directory name");
  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, created_by)
     VALUES ($1, $2, $3, 'directory', $4) RETURNING *`,
    [orgId, name, parentId || null, userId]
  );
  return result.rows[0];
}

// --- Upload file ---
export async function uploadFile(orgId, name, parentId, buffer, mimeType, userId) {
  if (!name) throw new Error("File name required");

  // Check quota
  const limit = await getLimit(orgId);
  const usage = await getUsage(orgId);
  if (usage + buffer.length > limit) {
    throw new Error(`Storage limit exceeded (${Math.round(limit / 1024 / 1024)}MB)`);
  }

  // Store physical file with UUID key
  const storageKey = crypto.randomUUID();
  const dir = storeDir(orgId);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, storageKey), buffer);

  const result = await query(
    `INSERT INTO org_file_entries (org_id, name, parent_id, entry_type, storage_key, size, mime_type, created_by)
     VALUES ($1, $2, $3, 'file', $4, $5, $6, $7) RETURNING *`,
    [orgId, name, parentId || null, storageKey, buffer.length, mimeType || "application/octet-stream", userId]
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

// --- Rename entry ---
export async function renameEntry(orgId, entryId, newName) {
  if (!newName || !/^[^/\\<>:"|?*]+$/.test(newName)) throw new Error("Invalid name");
  await query(
    "UPDATE org_file_entries SET name = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [newName, entryId, orgId]
  );
}

// --- Move entry (change parent — instant, no physical file move) ---
export async function moveEntry(orgId, entryId, newParentId) {
  // Prevent moving into self or own descendant
  if (newParentId) {
    let check = newParentId;
    while (check) {
      if (check === entryId) throw new Error("Cannot move into own subdirectory");
      const parent = await query("SELECT parent_id FROM org_file_entries WHERE id = $1", [check]);
      check = parent.rows[0]?.parent_id || null;
    }
  }
  await query(
    "UPDATE org_file_entries SET parent_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [newParentId || null, entryId, orgId]
  );
}

// --- Delete entry ---
export async function deleteEntry(orgId, entryId) {
  const entry = await getEntry(orgId, entryId);
  if (!entry) return false;

  if (entry.entry_type === "file" && entry.storage_key) {
    // Delete physical file
    try {
      await fs.unlink(path.join(storeDir(orgId), entry.storage_key));
    } catch {}
  }

  if (entry.entry_type === "directory") {
    // Recursively delete children
    const children = await listFiles(orgId, entryId);
    for (const child of children) {
      await deleteEntry(orgId, child.id);
    }
  }

  await query("DELETE FROM org_file_entries WHERE id = $1 AND org_id = $2", [entryId, orgId]);
  return true;
}

// --- Toggle public sharing ---
export async function setPublic(orgId, entryId, isPublic) {
  await query(
    "UPDATE org_file_entries SET is_public = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [isPublic, entryId, orgId]
  );
}

// --- Share with specific users ---
export async function shareWith(orgId, entryId, userIds) {
  await query(
    "UPDATE org_file_entries SET shared_with = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [JSON.stringify(userIds), entryId, orgId]
  );
}

// --- Get breadcrumb path ---
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
  const result = await query(
    "SELECT COALESCE(SUM(size), 0) as total FROM org_file_entries WHERE org_id = $1 AND entry_type = 'file'",
    [orgId]
  );
  return parseInt(result.rows[0].total);
}

async function getLimit(orgId) {
  const result = await query("SELECT storage_limit_mb FROM organizations WHERE id = $1", [orgId]);
  return (result.rows[0]?.storage_limit_mb || 1000) * 1024 * 1024;
}

export async function getStorageStats(orgId) {
  const usage = await getUsage(orgId);
  const limit = await getLimit(orgId);
  return {
    used_bytes: usage,
    used_mb: Math.round(usage / 1024 / 1024 * 10) / 10,
    limit_mb: Math.round(limit / 1024 / 1024),
    percent: Math.round(usage / limit * 100),
  };
}
