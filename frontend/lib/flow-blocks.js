// Block catalog — loaded from shared registry
// This is the single source of truth for block definitions.
// Both frontend (UI) and backend (execution) read this.

import registry from '../../shared/block-registry.json';

export const BLOCK_CATALOG = registry.blocks;
export const CONFIG_TYPES = registry.configTypes;
export const CATEGORIES = registry.categories;

export function getBlock(type) {
  return BLOCK_CATALOG.find(b => b.type === type);
}

export function getBlocksByCategory(category) {
  return BLOCK_CATALOG.filter(b => b.category === category);
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
