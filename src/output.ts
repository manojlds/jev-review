import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeReportFile(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath) || '.', { recursive: true });
  writeFileSync(filePath, contents.endsWith('\n') ? contents : `${contents}\n`);
}
