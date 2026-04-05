// Block catalog — loaded from shared registry
// This is the single source of truth for block definitions.
// Both frontend (UI) and backend (execution) read this.

import registry from '../../shared/block-registry.json';

export const BLOCK_CATALOG = registry.blocks;
export const CONFIG_TYPES = registry.configTypes;
export const CATEGORIES = registry.categories;

// ─── Org custom blocks (loaded at runtime from API) ─────────────────────────
let _orgBlocks = [];
let _orgBlocksLoaded = false;

export async function loadOrgBlocks() {
  try {
    const res = await fetch('/api/blocks');
    if (res.ok) {
      const data = await res.json();
      _orgBlocks = (data.blocks || []).filter(b => b._custom);
      _orgBlocksLoaded = true;
    }
  } catch {
    // Silently fail — org blocks are optional
  }
}

export function getOrgBlocks() {
  return _orgBlocks;
}

export function isOrgBlocksLoaded() {
  return _orgBlocksLoaded;
}

/** Return all blocks: system + org custom */
export function getAllBlocks() {
  return [...BLOCK_CATALOG, ..._orgBlocks];
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

export function getBlock(type) {
  return getAllBlocks().find(b => b.type === type);
}

export function getBlocksByCategory(category) {
  return getAllBlocks().filter(b => b.category === category);
}

// Generate config summary text for display on nodes
export function getConfigSummary(node) {
  const block = getBlock(node.type);
  if (!block) return '';
  const config = node.config || {};

  // Show first non-empty config value
  for (const field of block.configSchema) {
    const val = config[field.key];
    if (val !== undefined && val !== '' && val !== null) {
      if (field.type === 'multi-text') {
        return Array.isArray(val) ? val.join(', ') : String(val);
      }
      if (field.type === 'code') return 'Python';
      return String(val).substring(0, 30);
    }
  }
  return '';
}
