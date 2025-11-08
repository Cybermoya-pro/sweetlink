import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
const localBasePath = path.join(repoRoot, 'tsconfig.base.json');
const defaultUpstreamBasePath = path.join(repoRoot, '..', 'sweetistics', 'tsconfig.base.json');
const upstreamBasePath = process.env.SWEETLINK_UPSTREAM_TSCONFIG ?? defaultUpstreamBasePath;

if (existsSync(upstreamBasePath)) {
  copyFileSync(upstreamBasePath, localBasePath);
  console.log(`Synced tsconfig.base.json from ${upstreamBasePath}`);
} else if (!existsSync(localBasePath)) {
  throw new Error(
    `tsconfig.base.json is missing and upstream path ${upstreamBasePath} could not be found. ` +
      'Set SWEETLINK_UPSTREAM_TSCONFIG to the Sweetistics root copy before re-running the sync.',
  );
}

const desiredPaths = {
  '@/*': ['./src/*'],
  '@tests/*': ['./tests/*'],
  '@sweetlink/shared': ['./shared/src/index.ts'],
  '@sweetlink/shared/*': ['./shared/src/*'],
  '@sweetlink/shared/node': ['./shared/src/node.ts'],
  '@sweetlink-app': ['./src/index.ts'],
  '@sweetlink-app/*': ['./src/*'],
};

const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
  extends?: string;
  compilerOptions?: { paths?: Record<string, string[]> } & Record<string, unknown>;
};

if (!tsconfig.compilerOptions) {
  tsconfig.compilerOptions = {};
}

if (tsconfig.extends !== './tsconfig.base.json') {
  console.log(`Updating tsconfig extends from ${tsconfig.extends ?? '<unset>'} to ./tsconfig.base.json`);
}
tsconfig.extends = './tsconfig.base.json';
tsconfig.compilerOptions.paths = desiredPaths;

writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
console.log('tsconfig.json patched for standalone build.');
