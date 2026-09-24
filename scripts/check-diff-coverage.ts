import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMeasuredSourceFile } from './coverage-policy.js';

export interface DiffCoverageResult {
  covered: number;
  total: number;
  uncovered: string[];
}

export function passesDiffCoverage(result: DiffCoverageResult): boolean {
  return result.total === 0 || result.covered * 100 >= result.total * 70;
}

function sourcePath(filePath: string): string {
  const relativePath = isAbsolute(filePath)
    ? relative(process.cwd(), filePath)
    : filePath.replace(/^\.\//, '');
  return relativePath.replaceAll('\\', '/');
}

export function changedLinesFromDiff(diff: string): Map<string, Set<number>> {
  const changed = new Map<string, Set<number>>();
  let filePath: string | undefined;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      filePath = line.startsWith('+++ b/')
        ? sourcePath(line.slice('+++ b/'.length))
        : undefined;
      continue;
    }

    if (!filePath || !line.startsWith('@@ ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) throw new Error(`Invalid Git diff hunk: ${line}`);

    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const fileLines = changed.get(filePath) ?? new Set<number>();
    for (let offset = 0; offset < count; offset += 1) {
      fileLines.add(start + offset);
    }
    changed.set(filePath, fileLines);
  }

  return changed;
}

export function lineHitsFromLcov(
  lcov: string,
): Map<string, Map<number, number>> {
  const coverage = new Map<string, Map<number, number>>();
  let fileLines: Map<number, number> | undefined;

  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) {
      const filePath = sourcePath(line.slice(3));
      fileLines = coverage.get(filePath) ?? new Map<number, number>();
      coverage.set(filePath, fileLines);
      continue;
    }
    if (!line.startsWith('DA:') || !fileLines) continue;

    const match = /^DA:(\d+),(\d+)(?:,.*)?$/.exec(line);
    if (!match) throw new Error(`Invalid LCOV line: ${line}`);
    const lineNumber = Number(match[1]);
    const hits = Number(match[2]);
    fileLines.set(lineNumber, (fileLines.get(lineNumber) ?? 0) + hits);
  }

  if (coverage.size === 0)
    throw new Error('LCOV report contains no source files');
  return coverage;
}

export function calculateDiffCoverage(
  diff: string,
  lcov: string,
): DiffCoverageResult {
  const changed = changedLinesFromDiff(diff);
  const coverage = lineHitsFromLcov(lcov);
  const result: DiffCoverageResult = { covered: 0, total: 0, uncovered: [] };

  for (const [filePath, lines] of changed) {
    if (!isMeasuredSourceFile(filePath)) continue;
    const fileLines = coverage.get(filePath);
    if (!fileLines) {
      throw new Error(`No LCOV record for changed source file: ${filePath}`);
    }
    for (const line of lines) {
      const hits = fileLines.get(line);
      if (hits === undefined) continue;
      result.total += 1;
      if (hits > 0) result.covered += 1;
      else result.uncovered.push(`${filePath}:${line}`);
    }
  }

  return result;
}

function main(): void {
  const baseSha = process.argv[2];
  if (!baseSha) throw new Error('Usage: npm run coverage:diff -- <base-sha>');

  const diff = execFileSync(
    'git',
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-ext-diff',
      '--no-color',
      '--unified=0',
      '--diff-filter=ACMR',
      baseSha,
      'HEAD',
      '--',
      'src/',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const lcov = readFileSync('coverage/lcov.info', 'utf8');
  const result = calculateDiffCoverage(diff, lcov);

  if (result.total === 0) {
    console.log('Diff coverage: no executable source lines changed; passing.');
    return;
  }

  const percentage = (result.covered / result.total) * 100;
  console.log(
    `Diff coverage: ${result.covered}/${result.total} executable changed lines (${percentage.toFixed(2)}%); required: 70%.`,
  );
  if (result.uncovered.length > 0) {
    console.log(
      `Uncovered changed lines: ${result.uncovered.slice(0, 20).join(', ')}`,
    );
  }
  if (!passesDiffCoverage(result)) process.exitCode = 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
