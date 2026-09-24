import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateWiki } from '../scripts/generate-wiki.js';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<{ output: string; repositoryRoot: string }> {
  const repositoryRoot = await mkdtemp(resolve(tmpdir(), 'wiki-generator-'));
  temporaryDirectories.push(repositoryRoot);
  const output = resolve(repositoryRoot, 'wiki');
  await mkdir(resolve(repositoryRoot, 'docs', 'adr'), { recursive: true });
  await mkdir(resolve(repositoryRoot, 'postman'), { recursive: true });
  await writeFile(
    resolve(repositoryRoot, 'docs', 'PROJECT_DEFINITION.md'),
    '# Project Definition\n\nSee [Guide](./DEVELOPMENT.md#setup).\n',
  );
  await writeFile(
    resolve(repositoryRoot, 'docs', 'DEVELOPMENT.md'),
    '# Development Guide\n\nSee [ADR](./adr/0001.md) and [collection](../postman/collection.json).\n',
  );
  await writeFile(
    resolve(repositoryRoot, 'docs', 'adr', '0001.md'),
    '# Architecture Decision\n\nReturn to [the guide](../DEVELOPMENT.md).\n',
  );
  await writeFile(resolve(repositoryRoot, 'postman', 'collection.json'), '{}');
  return { output, repositoryRoot };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Wiki generator', () => {
  it('generates flattened pages, navigation, source banners, and rewritten links', async () => {
    const { output, repositoryRoot } = await fixture();
    await generateWiki({
      repositoryRoot,
      outputDirectory: output,
      repository: 'acme/service',
    });

    const home = await readFile(resolve(output, 'Home.md'), 'utf8');
    const sidebar = await readFile(resolve(output, '_Sidebar.md'), 'utf8');
    const definition = await readFile(
      resolve(output, 'PROJECT_DEFINITION.md'),
      'utf8',
    );
    const guide = await readFile(resolve(output, 'DEVELOPMENT.md'), 'utf8');
    const adr = await readFile(resolve(output, 'adr-0001.md'), 'utf8');

    expect(home).toContain('https://github.com/acme/service/tree/main/docs');
    expect(sidebar.split('\n').filter(Boolean)).toEqual([
      '- [Project Definition](PROJECT_DEFINITION)',
      '- [Architecture Decision](adr-0001)',
      '- [Development Guide](DEVELOPMENT)',
    ]);
    expect(home).toContain(sidebar.trim());
    expect(definition).toContain('[Guide](DEVELOPMENT#setup)');
    expect(guide).toContain('[ADR](adr-0001)');
    expect(guide).toContain(
      '[collection](https://github.com/acme/service/blob/main/postman/collection.json)',
    );
    expect(adr).toContain('[the guide](DEVELOPMENT)');
    expect(adr).toContain(
      '[`docs/adr/0001.md`](https://github.com/acme/service/blob/main/docs/adr/0001.md)',
    );
  });

  it('produces identical output on consecutive runs', async () => {
    const { output, repositoryRoot } = await fixture();
    const options = {
      repositoryRoot,
      outputDirectory: output,
      repository: 'acme/service',
    };
    await generateWiki(options);
    const first = await Promise.all(
      ['Home.md', '_Sidebar.md', 'DEVELOPMENT.md'].map((file) =>
        readFile(resolve(output, file), 'utf8'),
      ),
    );
    await generateWiki(options);
    const second = await Promise.all(
      ['Home.md', '_Sidebar.md', 'DEVELOPMENT.md'].map((file) =>
        readFile(resolve(output, file), 'utf8'),
      ),
    );
    expect(second).toEqual(first);
  });

  it('fails for a missing local link', async () => {
    const { output, repositoryRoot } = await fixture();
    await writeFile(
      resolve(repositoryRoot, 'docs', 'BROKEN.md'),
      '# Broken\n\n[Missing](./missing.md)\n',
    );

    await expect(
      generateWiki({
        repositoryRoot,
        outputDirectory: output,
        repository: 'acme/service',
      }),
    ).rejects.toThrow(
      'Missing local Markdown link in docs/BROKEN.md: ./missing.md',
    );
  });

  it('fails when flattened page names collide', async () => {
    const { output, repositoryRoot } = await fixture();
    await writeFile(
      resolve(repositoryRoot, 'docs', 'adr-0001.md'),
      '# Duplicate\n',
    );

    await expect(
      generateWiki({
        repositoryRoot,
        outputDirectory: output,
        repository: 'acme/service',
      }),
    ).rejects.toThrow('Wiki page name collision');
  });

  it.each(['Home.md', '_Sidebar.md'])(
    'fails for the reserved page name %s',
    async (fileName) => {
      const { output, repositoryRoot } = await fixture();
      await writeFile(
        resolve(repositoryRoot, 'docs', fileName),
        '# Reserved\n',
      );

      await expect(
        generateWiki({
          repositoryRoot,
          outputDirectory: output,
          repository: 'acme/service',
        }),
      ).rejects.toThrow('Markdown document uses reserved Wiki page name');
    },
  );
});
