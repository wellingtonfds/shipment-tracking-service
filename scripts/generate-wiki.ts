import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const RESERVED_PAGE_NAMES = new Set(['home', '_sidebar']);
const MARKDOWN_LINK = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

export interface GenerateWikiOptions {
  repositoryRoot: string;
  outputDirectory: string;
  repository: string;
  branch?: string;
}

interface Page {
  sourcePath: string;
  relativePath: string;
  pageName: string;
  title: string;
}

function normalizePath(filePath: string): string {
  return filePath.split(sep).join('/');
}

function repositoryUrl(
  repository: string,
  branch: string,
  relativePath: string,
): string {
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://github.com/${repository}/blob/${encodeURIComponent(branch)}/${encodedPath}`;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  )) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(entryPath)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(entryPath);
    }
  }

  return files;
}

function pageNameFor(relativeDocsPath: string): string {
  return relativeDocsPath.slice(0, -'.md'.length).replaceAll('/', '-');
}

function titleFrom(content: string, relativePath: string): string {
  const match = /^#\s+(.+)\s*$/m.exec(content);
  if (!match)
    throw new Error(`Markdown document has no H1 title: ${relativePath}`);
  return match[1].trim();
}

function splitLinkDestination(rawDestination: string): {
  target: string;
  suffix: string;
} {
  const trimmed = rawDestination.trim();
  if (trimmed.startsWith('<')) {
    const closing = trimmed.indexOf('>');
    if (closing !== -1) {
      return {
        target: trimmed.slice(1, closing),
        suffix: trimmed.slice(closing + 1),
      };
    }
  }

  const whitespace = trimmed.search(/\s/);
  if (whitespace === -1) return { target: trimmed, suffix: '' };
  return {
    target: trimmed.slice(0, whitespace),
    suffix: trimmed.slice(whitespace),
  };
}

function isRemoteLink(target: string): boolean {
  return (
    target.startsWith('#') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(target)
  );
}

function pathAndFragment(target: string): {
  path: string;
  fragment: string;
} {
  const hashIndex = target.indexOf('#');
  if (hashIndex === -1) return { path: target, fragment: '' };
  return {
    path: target.slice(0, hashIndex),
    fragment: target.slice(hashIndex),
  };
}

function assertInsideRepository(
  absolutePath: string,
  repositoryRoot: string,
  sourceRelativePath: string,
): string {
  const repositoryRelativePath = normalizePath(
    relative(repositoryRoot, absolutePath),
  );
  if (
    repositoryRelativePath === '..' ||
    repositoryRelativePath.startsWith('../') ||
    isAbsolute(repositoryRelativePath)
  ) {
    throw new Error(
      `Local Markdown link escapes the repository in ${sourceRelativePath}`,
    );
  }
  return repositoryRelativePath;
}

function rewriteLinks(
  content: string,
  page: Page,
  pageNamesBySource: Map<string, string>,
  repositoryRoot: string,
  docsDirectory: string,
  repository: string,
  branch: string,
): string {
  return content.replace(
    MARKDOWN_LINK,
    (fullMatch, imageMarker: string, label: string, rawDestination: string) => {
      const { target, suffix } = splitLinkDestination(rawDestination);
      if (isRemoteLink(target)) return fullMatch;

      const { path: linkedPath, fragment } = pathAndFragment(target);
      if (!linkedPath) return fullMatch;

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(linkedPath);
      } catch {
        throw new Error(
          `Invalid encoded local link in ${page.relativePath}: ${target}`,
        );
      }

      const absoluteTarget = linkedPath.startsWith('/')
        ? resolve(repositoryRoot, `.${decodedPath}`)
        : resolve(dirname(page.sourcePath), decodedPath);
      const repositoryRelativePath = assertInsideRepository(
        absoluteTarget,
        repositoryRoot,
        page.relativePath,
      );

      if (!existsSync(absoluteTarget)) {
        throw new Error(
          `Missing local Markdown link in ${page.relativePath}: ${target}`,
        );
      }

      const docsRelativePath = normalizePath(
        relative(docsDirectory, absoluteTarget),
      );
      const targetPageName = pageNamesBySource.get(docsRelativePath);
      const rewrittenTarget = targetPageName
        ? `${targetPageName}${fragment}`
        : `${repositoryUrl(repository, branch, repositoryRelativePath)}${fragment}`;

      return `${imageMarker}[${label}](${rewrittenTarget}${suffix})`;
    },
  );
}

function navigation(pages: Page[]): string {
  return pages.map((page) => `- [${page.title}](${page.pageName})`).join('\n');
}

export async function generateWiki(
  options: GenerateWikiOptions,
): Promise<void> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const docsDirectory = resolve(repositoryRoot, 'docs');
  const outputDirectory = resolve(options.outputDirectory);
  const branch = options.branch ?? 'main';
  const sourceFiles = await markdownFiles(docsDirectory);
  const pageNames = new Map<string, string>();
  const pages: Page[] = [];

  for (const sourcePath of sourceFiles) {
    const relativeDocsPath = normalizePath(relative(docsDirectory, sourcePath));
    const pageName = pageNameFor(relativeDocsPath);
    const normalizedPageName = pageName.toLowerCase();
    if (RESERVED_PAGE_NAMES.has(normalizedPageName)) {
      throw new Error(
        `Markdown document uses reserved Wiki page name: ${relativeDocsPath}`,
      );
    }
    const collision = pageNames.get(normalizedPageName);
    if (collision) {
      throw new Error(
        `Wiki page name collision: ${collision} and ${relativeDocsPath} both map to ${pageName}.md`,
      );
    }
    pageNames.set(normalizedPageName, relativeDocsPath);

    const content = await readFile(sourcePath, 'utf8');
    pages.push({
      sourcePath,
      relativePath: `docs/${relativeDocsPath}`,
      pageName,
      title: titleFrom(content, `docs/${relativeDocsPath}`),
    });
  }

  pages.sort((left, right) => {
    const leftIsDefinition = left.pageName === 'PROJECT_DEFINITION';
    const rightIsDefinition = right.pageName === 'PROJECT_DEFINITION';
    if (leftIsDefinition !== rightIsDefinition)
      return leftIsDefinition ? -1 : 1;
    return left.title.localeCompare(right.title, 'pt-BR');
  });

  const pageNamesBySource = new Map(
    pages.map((page) => [
      page.relativePath.slice('docs/'.length),
      page.pageName,
    ]),
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const page of pages) {
    const source = await readFile(page.sourcePath, 'utf8');
    const canonicalUrl = repositoryUrl(
      options.repository,
      branch,
      page.relativePath,
    );
    const banner = `> **Página gerada automaticamente.** A fonte de verdade é [\`${page.relativePath}\`](${canonicalUrl}) na branch \`${branch}\`. Edições diretas na Wiki serão substituídas.\n\n`;
    const rewritten = rewriteLinks(
      source,
      page,
      pageNamesBySource,
      repositoryRoot,
      docsDirectory,
      options.repository,
      branch,
    );
    await writeFile(
      resolve(outputDirectory, `${page.pageName}.md`),
      `${banner}${rewritten.trimEnd()}\n`,
      'utf8',
    );
  }

  const links = navigation(pages);
  await writeFile(
    resolve(outputDirectory, 'Home.md'),
    `# Documentação\n\n> **Página gerada automaticamente.** A fonte de verdade é o [diretório \`docs/\`](https://github.com/${options.repository}/tree/${encodeURIComponent(branch)}/docs) na branch \`${branch}\`. Edições diretas na Wiki serão substituídas.\n\n${links}\n`,
    'utf8',
  );
  await writeFile(
    resolve(outputDirectory, '_Sidebar.md'),
    `${links}\n`,
    'utf8',
  );
}

async function main(): Promise<void> {
  const outputDirectory = process.argv[2];
  const repository = process.env.GITHUB_REPOSITORY;
  if (!outputDirectory || !repository) {
    throw new Error(
      'Usage: GITHUB_REPOSITORY=<owner/repository> npm run wiki:generate -- <output-directory>',
    );
  }

  await generateWiki({
    repositoryRoot: process.cwd(),
    outputDirectory,
    repository,
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
