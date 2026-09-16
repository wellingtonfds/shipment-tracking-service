import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const FORBIDDEN_BY_LAYER: Array<{ layer: string; patterns: RegExp[] }> = [
  {
    layer: 'src/domain',
    patterns: [
      /['"]@nestjs\//,
      /['"]@nestjs/,
      /['"]@prisma\//,
      /['"]axios['"]/,
      /['"]@nestjs\/swagger/,
      /generated\/prisma/,
    ],
  },
  {
    layer: 'src/application',
    patterns: [
      /['"]@nestjs\//,
      /['"]@prisma\//,
      /['"]axios['"]/,
      /generated\/prisma/,
      /infrastructure\//,
    ],
  },
];

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('architecture boundaries', () => {
  for (const { layer, patterns } of FORBIDDEN_BY_LAYER) {
    it(`${layer} nao importa framework, ORM ou infraestrutura`, () => {
      const files = collectFiles(join(ROOT, layer));
      expect(files.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        for (const pattern of patterns) {
          if (pattern.test(content)) {
            violations.push(`${relative(ROOT, file)} -> ${pattern}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
