import { describe, expect, it } from 'vitest';
import {
  calculateDiffCoverage,
  changedLinesFromDiff,
  passesDiffCoverage,
} from '../scripts/check-diff-coverage.js';

const sourceFile = 'src/application/health/use-cases/check-health.use-case.ts';

function diffFor(filePath: string, range: string): string {
  return `diff --git a/${filePath} b/${filePath}\n+++ b/${filePath}\n@@ -0,0 +${range} @@\n`;
}

function lcovFor(filePath: string, hits: number[]): string {
  return [
    `SF:${filePath}`,
    ...hits.map((count, index) => `DA:${index + 1},${count}`),
    `LF:${hits.length}`,
    `LH:${hits.filter((count) => count > 0).length}`,
    'end_of_record',
  ].join('\n');
}

describe('changed-line coverage gate', () => {
  it('passes exactly at 70% and fails below 70%', () => {
    const diff = diffFor(sourceFile, '1,10');
    const covered = lcovFor(sourceFile, [1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
    const below = lcovFor(sourceFile, [1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    const above = lcovFor(sourceFile, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);

    const atThreshold = calculateDiffCoverage(diff, covered);
    expect(atThreshold).toMatchObject({
      covered: 7,
      total: 10,
    });
    expect(passesDiffCoverage(atThreshold)).toBe(true);
    const underThreshold = calculateDiffCoverage(diff, below);
    expect(underThreshold).toMatchObject({
      covered: 6,
      total: 10,
    });
    expect(passesDiffCoverage(underThreshold)).toBe(false);
    expect(passesDiffCoverage(calculateDiffCoverage(diff, above))).toBe(true);
  });

  it('aggregates changed lines across hunks and files, including renames', () => {
    const renamed = 'src/application/health/use-cases/renamed.use-case.ts';
    const secondFile = 'src/application/health/health.tokens.ts';
    const diff = [
      `diff --git a/${sourceFile} b/${renamed}`,
      `rename from ${sourceFile}`,
      `rename to ${renamed}`,
      `+++ b/${renamed}`,
      '@@ -1 +1,2 @@',
      '@@ -8 +9 @@',
      diffFor(secondFile, '1'),
    ].join('\n');
    const hits = [1, 0, 0, 0, 0, 0, 0, 0, 1];

    expect(changedLinesFromDiff(diff).get(renamed)).toEqual(new Set([1, 2, 9]));
    expect(
      calculateDiffCoverage(
        diff,
        [lcovFor(renamed, hits), lcovFor(secondFile, [1])].join('\n'),
      ),
    ).toMatchObject({
      covered: 3,
      total: 4,
      uncovered: [`${renamed}:2`],
    });
  });

  it('ignores excluded files, deleted files, and non-executable changed lines', () => {
    const excluded = diffFor(
      'src/infrastructure/http/tracking/dtos/create-shipment.dto.ts',
      '1,2',
    );
    const generated = diffFor('src/generated/prisma/client.ts', '1,2');
    const declaration = diffFor('src/domain/shared/types.d.ts', '1,2');
    const deleted = `diff --git a/${sourceFile} b/${sourceFile}\n+++ /dev/null\n@@ -1 +0,0 @@`;
    const typeOnly = diffFor(sourceFile, '1,2');

    const result = calculateDiffCoverage(
      [excluded, generated, declaration, deleted, typeOnly].join('\n'),
      lcovFor(sourceFile, []),
    );
    expect(result).toEqual({ covered: 0, total: 0, uncovered: [] });
    expect(passesDiffCoverage(result)).toBe(true);
  });

  it('fails when an included source file is missing from LCOV', () => {
    expect(() =>
      calculateDiffCoverage(
        diffFor(sourceFile, '1'),
        lcovFor('src/main.ts', [1]),
      ),
    ).toThrow(`No LCOV record for changed source file: ${sourceFile}`);
  });

  it('fails when the LCOV report contains no source records', () => {
    expect(() => calculateDiffCoverage('', '')).toThrow(
      'LCOV report contains no source files',
    );
  });
});
