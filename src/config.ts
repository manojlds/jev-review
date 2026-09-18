import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { DEFAULT_IGNORE } from './ignore.js';

export const CONFIG_FILE_NAME = 'jev-review.config.json';

export interface ReviewConfig {
  ignore: string[];
  ignoreDefaults: boolean;
  path?: string;
}

interface ReviewConfigFile {
  ignore?: unknown;
  ignoreDefaults?: unknown;
}

export function loadReviewConfig(cwd: string, configPath?: string): ReviewConfig {
  const path = resolveConfigPath(cwd, configPath);
  if (!path) {
    return { ignore: [...DEFAULT_IGNORE], ignoreDefaults: true };
  }

  const parsed = parseConfigFile(path);
  const ignoreDefaults = parsed.ignoreDefaults !== false;
  const extra = asStringArray(parsed.ignore, path);
  const ignore = ignoreDefaults ? [...DEFAULT_IGNORE, ...extra] : extra;

  return { ignore, ignoreDefaults, path };
}

function resolveConfigPath(cwd: string, configPath?: string): string | undefined {
  if (configPath) {
    const resolved = isAbsolute(configPath) ? configPath : join(cwd, configPath);
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    return resolved;
  }

  const candidate = join(cwd, CONFIG_FILE_NAME);
  return existsSync(candidate) ? candidate : undefined;
}

function parseConfigFile(path: string): ReviewConfigFile {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('config root must be an object');
    }
    return value as ReviewConfigFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${CONFIG_FILE_NAME} at ${path}: ${message}`);
  }
}

function asStringArray(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Invalid ${CONFIG_FILE_NAME} at ${path}: ignore must be an array of strings`);
  }
  return value;
}
