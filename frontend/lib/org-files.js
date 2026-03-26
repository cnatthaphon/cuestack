import fs from "fs/promises";
import path from "path";
import { query } from "./db.js";

// Base directory for org file storage
const FILES_ROOT = process.env.FILES_ROOT || "/files";

// Get org's storage directory
function orgDir(orgId) {
  const short = orgId.replace(/-/g, "").slice(0, 8);
  return path.join(FILES_ROOT, `org_${short}`);
}

// Ensure org directory exists
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

// Sanitize file path — prevent directory traversal
function safePath(orgId, filePath) {
  // Remove leading slashes, resolve .., ensure stays within org dir
  const clean = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(orgDir(orgId), clean);
  if (!full.startsWith(orgDir(orgId))) {
    throw new Error("Invalid file path");
  }
  return full;
}

// Get org storage usage in bytes
async function getUsage(orgId) {
  const dir = orgDir(orgId);
  try {
    return await dirSize(dir);
  } catch {
    return 0;
  }
}

async function dirSize(dirPath) {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else {
        const stat = await fs.stat(full);
        total += stat.size;
      }
    }
  } catch {}
  return total;
}

// Get storage limit for org (from organizations table, in MB)
async function getLimit(orgId) {
  const result = await query("SELECT storage_limit_mb FROM organizations WHERE id = $1", [orgId]);
  return (result.rows[0]?.storage_limit_mb || 1000) * 1024 * 1024; // Convert to bytes
}

// List files in a directory
export async function listFiles(orgId, dirPath = "/") {
  const dir = safePath(orgId, dirPath);
  await ensureDir(dir);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const stat = await fs.stat(full);
      files.push({
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, "/"),
        type: entry.isDirectory() ? "directory" : "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

// Upload a file
export async function uploadFile(orgId, filePath, buffer) {
  const full = safePath(orgId, filePath);
  const limit = await getLimit(orgId);
  const usage = await getUsage(orgId);
  if (usage + buffer.length > limit) {
    throw new Error(`Storage limit exceeded (${Math.round(limit / 1024 / 1024)}MB)`);
  }
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, buffer);
  const stat = await fs.stat(full);
  return { path: filePath, size: stat.size, modified: stat.mtime.toISOString() };
}

// Download a file — returns { buffer, filename }
export async function downloadFile(orgId, filePath) {
  const full = safePath(orgId, filePath);
  const stat = await fs.stat(full);
  if (stat.isDirectory()) throw new Error("Cannot download a directory");
  const buffer = await fs.readFile(full);
  return { buffer, filename: path.basename(filePath), size: stat.size };
}

// Delete a file or directory
export async function deleteFile(orgId, filePath) {
  const full = safePath(orgId, filePath);
  const stat = await fs.stat(full);
  if (stat.isDirectory()) {
    await fs.rm(full, { recursive: true });
  } else {
    await fs.unlink(full);
  }
  return true;
}

// Create a directory
export async function createDir(orgId, dirPath) {
  const full = safePath(orgId, dirPath);
  await fs.mkdir(full, { recursive: true });
  return { path: dirPath, type: "directory" };
}

// Get storage stats
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
