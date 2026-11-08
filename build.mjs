import { build } from 'esbuild';
import {
  readFileSync, statSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, existsSync
} from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

// 版本号必须两处一致，否则归档和宿主显示会对不上
if (manifest.version !== pkg.version) {
  console.error(`版本号不一致：package.json=${pkg.version}  manifest.json=${manifest.version}`);
  process.exit(1);
}

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'plugin.js',
  charset: 'utf8',
  legalComments: 'none',
  loader: { '.css': 'text' },
  define: {
    __VERSION__: JSON.stringify(pkg.version)
  },
  banner: {
    js: `/* music-player v${pkg.version} | built ${new Date().toISOString()} */`
  }
});

const size = statSync('plugin.js').size;

/* ---------- 归档：每次构建都留一份可回退的产物 ---------- */

const ARCHIVE_FILES = ['plugin.js', 'manifest.json', 'README.md'];
const archiveDir = join('releases', 'v' + pkg.version);
mkdirSync(archiveDir, { recursive: true });
ARCHIVE_FILES.forEach(function (name) {
  if (existsSync(name)) copyFileSync(name, join(archiveDir, name));
});

function versionParts(v) {
  return String(v).split('.').map(function (n) { return Number(n) || 0; });
}

function compareVersion(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function buildIndex() {
  if (!existsSync('releases')) return [];
  return readdirSync('releases', { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name); })
    .map(function (d) {
      const version = d.name.slice(1);
      const file = join('releases', d.name, 'plugin.js');
      return {
        version: version,
        archivedAt: existsSync(file) ? statSync(file).mtime.toISOString() : '',
        size: existsSync(file) ? statSync(file).size : 0,
        entry: 'releases/' + d.name + '/plugin.js'
      };
    })
    .sort(function (a, b) { return compareVersion(b.version, a.version); });
}

writeFileSync('releases/index.json', JSON.stringify(buildIndex(), null, 2) + '\n');

console.log(`built plugin.js  ${(size / 1024).toFixed(1)} KB  v${pkg.version}`);
console.log(`archived        releases/v${pkg.version}/`);
