import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { writeReportFile } from '../src/output.js';

describe('writeReportFile', () => {
  it('writes markdown and creates parent directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jev-report-'));
    const path = join(dir, 'reports', 'jev-review.md');

    writeReportFile(path, '# Jev review\n');

    expect(readFileSync(path, 'utf8')).toBe('# Jev review\n');
  });

  it('appends a trailing newline if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jev-report-'));
    const path = join(dir, 'jev-review.md');

    writeReportFile(path, '# Jev review');

    expect(readFileSync(path, 'utf8')).toBe('# Jev review\n');
  });
});
