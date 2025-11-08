import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');

const filesToPatch: string[] = [];

const collectFiles = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath);
    } else if (stats.isFile() && fullPath.endsWith('.js')) {
      filesToPatch.push(fullPath);
    }
  }
};

try {
  const stats = statSync(distDir);
  if (!stats.isDirectory()) {
    console.log('[fix-imports] dist/ not found, skipping.');
    process.exit(0);
  }
} catch {
  console.log('[fix-imports] dist/ not found, skipping.');
  process.exit(0);
}

collectFiles(distDir);

const importPattern = /(import|export)\s+(?:[^'";]+?\s+from\s+)?(['"])(\.\.\/[^'";]+|\.\/[^'";]+)\2/g;
let patchedFileCount = 0;

const resolveReplacement = (filePath: string, specifier: string): string | null => {
  const baseDir = path.dirname(filePath);
  const absSpecifier = path.resolve(baseDir, specifier);
  const directFile = `${absSpecifier}.js`;
  if (existsSync(directFile)) {
    return specifier.endsWith('.js') ? null : `${specifier}.js`;
  }
  const indexFile = path.join(absSpecifier, 'index.js');
  if (existsSync(indexFile)) {
    return specifier.endsWith('/index.js') ? null : `${specifier}/index.js`;
  }
  return null;
};

for (const filePath of filesToPatch) {
  let content = readFileSync(filePath, 'utf8');
  let modified = false;
  content = content.replace(importPattern, (fullMatch, keyword, quote, specifier) => {
    const replacement = resolveReplacement(filePath, specifier);
    if (!replacement) {
      return fullMatch;
    }
    modified = true;
    return fullMatch.replace(specifier, replacement);
  });
  if (modified) {
    writeFileSync(filePath, content);
    patchedFileCount += 1;
  }
}

console.log(`[fix-imports] Patched ${patchedFileCount} files.`);
