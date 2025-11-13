import { build, context } from 'esbuild';
import { mkdir, rm, cp, stat, readdir } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');

const entryPoints = {
  'background/service-worker': resolve(projectRoot, 'src/background/service-worker.js'),
  'content/content': resolve(projectRoot, 'src/content/content.js'),
  'sidebar/sidebar': resolve(projectRoot, 'src/sidebar/sidebar.js'),
  'popup/popup': resolve(projectRoot, 'src/popup/popup.js')
};

const staticAssets = [
  ['manifest.json', 'manifest.json'],
  ['src/sidebar/sidebar.html', 'sidebar/sidebar.html'],
  ['src/sidebar/sidebar.css', 'sidebar/sidebar.css'],
  ['src/popup/popup.html', 'popup/popup.html'],
  ['src/popup/popup.css', 'popup/popup.css'],
  ['src/auth/auth.html', 'auth/auth.html']
];

async function ensureDist() {
  try {
    await stat(distDir);
  } catch {
    await mkdir(distDir, { recursive: true });
  }
}

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
}

async function copyAssets() {
  const copyPromises = staticAssets.map(async ([src, dest]) => {
    const srcPath = resolve(projectRoot, src);
    const destPath = resolve(distDir, dest);
    await mkdir(dirname(destPath), { recursive: true });
    await cp(srcPath, destPath);
  });
  await Promise.all(copyPromises);

  const iconsDir = resolve(projectRoot, 'assets/icons');
  try {
    const files = await readdir(iconsDir);
    await mkdir(resolve(distDir, 'icons'), { recursive: true });
    await Promise.all(
      files.map((file) =>
        cp(join(iconsDir, file), join(distDir, 'icons', file))
      )
    );
  } catch {
    // optional icons directory
  }
}

async function bundle({ watch = false } = {}) {
  await ensureDist();

  const buildOptions = {
    entryPoints,
    outdir: distDir,
    bundle: true,
    format: 'esm',
    target: ['chrome114'],
    sourcemap: true,
    platform: 'browser',
    chunkNames: 'chunks/[name]-[hash]',
    entryNames: '[dir]/[name]',
    logLevel: 'info'
  };

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    await copyAssets();
  } else {
    await build(buildOptions);
    await copyAssets();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const shouldClean = !args.includes('--no-clean');

  if (shouldClean) {
    await cleanDist();
  } else {
    await ensureDist();
  }

  await bundle({ watch });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

