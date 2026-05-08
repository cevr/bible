import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import solidTransformPlugin from '@opentui/solid/bun-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load .env file and create define mappings for embedding
function loadEnvDefines(): Record<string, string> {
  const envPath = join(rootDir, '.env');
  const defines: Record<string, string> = {};

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      // Embed as process.env.KEY replacement
      defines[`process.env.${key}`] = JSON.stringify(value);
    }
  }

  return defines;
}

const envDefines = loadEnvDefines();
console.log(`Embedding ${Object.keys(envDefines).length} environment variables from .env`);

console.log('Building Bible CLI...');

const binDir = join(rootDir, 'bin');
mkdirSync(binDir, { recursive: true });

// Single-step build: transform JSX + bundle + compile to binary
console.log('Transforming Solid JSX, bundling, and compiling to binary...');

// Embed the CLI root directory path so commands can find prompts/outputs
const cliDefines = {
  ...envDefines,
  __BIBLE_CLI_ROOT__: JSON.stringify(rootDir),
};

const buildResult = await Bun.build({
  entrypoints: [join(rootDir, 'src/main.ts')],
  target: 'bun',
  plugins: [solidTransformPlugin],
  minify: false, // Keep readable for debugging if needed
  define: cliDefines, // Embed .env variables and CLI root at compile time
  compile: {
    target: 'bun-darwin-arm64',
    outfile: join(binDir, 'bible'),
    autoloadBunfig: false, // Disable bunfig.toml loading at runtime
  },
});

if (!buildResult.success) {
  console.error('Build failed:');
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✅ Binary built: ${join(binDir, 'bible')}`);

// Copy to node_modules/.bin for convenience
const nodeModulesBin = join(rootDir, 'node_modules/.bin/bible');
await Bun.$`cp ${join(binDir, 'bible')} ${nodeModulesBin}`;
console.log(`✅ Copied to: ${nodeModulesBin}`);
