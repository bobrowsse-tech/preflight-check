import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import type { ExpectedEnv } from './types';

function readText(root: string, rel: string): string | undefined {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8').trim();
  } catch {
    return undefined;
  }
}

function addOrConflict(
  map: Map<string, ExpectedEnv>,
  tool: string,
  expectedVersion: string,
  source: string
): void {
  const existing = map.get(tool);
  if (!existing) {
    map.set(tool, { tool, expectedVersion, source });
    return;
  }
  if (normalizeVersion(existing.expectedVersion) === normalizeVersion(expectedVersion)) {
    return;
  }
  const conflicts = existing.conflictingSources ?? [];
  conflicts.push({ source, expectedVersion });
  // Keep the higher-priority expectation (first writer wins); flag conflict.
  existing.conflictingSources = conflicts;
}

export function normalizeVersion(v: string): string {
  return v.replace(/^v/i, '').trim();
}

/**
 * Extract expected toolchain from repo config files (priority order).
 */
export function extractExpectations(root: string): ExpectedEnv[] {
  const map = new Map<string, ExpectedEnv>();

  // Priority 1: .nvmrc / .node-version
  for (const f of ['.nvmrc', '.node-version']) {
    const v = readText(root, f);
    if (v) {
      addOrConflict(map, 'node', v.split(/\s+/)[0], f);
      break;
    }
  }

  // Priority 1b: .python-version
  const py = readText(root, '.python-version');
  if (py) {
    addOrConflict(map, 'python', py.split(/\s+/)[0], '.python-version');
  }

  // Priority 2: .tool-versions (asdf)
  const toolVersions = readText(root, '.tool-versions');
  if (toolVersions) {
    for (const line of toolVersions.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const [tool, version] = trimmed.split(/\s+/);
      if (tool && version) {
        addOrConflict(map, tool === 'nodejs' ? 'node' : tool, version, '.tool-versions');
      }
    }
  }

  // Priority 3 (secondary): Dockerfile FROM image:tag
  for (const df of ['Dockerfile', 'dockerfile']) {
    const text = readText(root, df);
    if (!text) {
      continue;
    }
    const m = text.match(/^\s*FROM\s+([^\s]+)/im);
    if (m) {
      const image = m[1];
      const tagMatch = image.match(/^(?:.*\/)?(node|python|golang|ruby)(?::(.+))?$/i);
      if (tagMatch) {
        const tool = tagMatch[1].toLowerCase() === 'golang' ? 'go' : tagMatch[1].toLowerCase();
        const tag = tagMatch[2] || 'latest';
        if (tag !== 'latest') {
          addOrConflict(map, tool, tag, df);
        }
      }
    }
    break;
  }

  // Priority 4 (tertiary): GitHub Actions setup-* 
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    for (const file of fs.readdirSync(workflowsDir)) {
      if (!/\.ya?ml$/i.test(file)) {
        continue;
      }
      const rel = `.github/workflows/${file}`;
      const text = readText(root, rel);
      if (!text) {
        continue;
      }
      let doc: unknown;
      try {
        doc = parseYaml(text);
      } catch {
        continue;
      }
      walkActions(doc, (tool, version) => {
        addOrConflict(map, tool, version, rel);
      });
    }
  }

  return [...map.values()];
}

function walkActions(node: unknown, onSetup: (tool: string, version: string) => void): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkActions(item, onSetup);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.uses === 'string') {
    const uses = obj.uses;
    const withBlock = (obj.with ?? {}) as Record<string, unknown>;
    const version =
      (typeof withBlock['node-version'] === 'string' && withBlock['node-version']) ||
      (typeof withBlock['python-version'] === 'string' && withBlock['python-version']) ||
      (typeof withBlock['go-version'] === 'string' && withBlock['go-version']) ||
      undefined;
    if (version) {
      if (/actions\/setup-node/.test(uses)) {
        onSetup('node', version);
      } else if (/actions\/setup-python/.test(uses)) {
        onSetup('python', version);
      } else if (/actions\/setup-go/.test(uses)) {
        onSetup('go', version);
      }
    }
  }
  for (const v of Object.values(obj)) {
    walkActions(v, onSetup);
  }
}

/**
 * Required env keys from .env.example (names only).
 */
export function extractEnvExampleKeys(root: string): Array<{ key: string; source: string }> {
  const text = readText(root, '.env.example');
  if (!text) {
    return [];
  }
  const keys: Array<{ key: string; source: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) {
      keys.push({ key: m[1], source: '.env.example' });
    }
  }
  return keys;
}
