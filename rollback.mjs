/**
 * 回退到某个已归档版本。
 *
 *   npm run releases              列出所有归档
 *   npm run rollback -- 0.1.0     用 0.1.0 的产物回退，版本号自动 +1 patch
 *   npm run rollback -- 0.1.0 --as 0.3.0
 *
 * 只替换 plugin.js / manifest.json / README.md，不改 src/：
 * 回退是「发布旧产物」，之后想继续开发，重新 npm run build 会回到源码状态。
 * 版本号必须比线上大，宿主才会提示更新。
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['plugin.js', 'manifest.json', 'README.md'];
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

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

function listVersions() {
  if (!existsSync('releases')) return [];
  return readdirSync('releases', { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name); })
    .map(function (d) { return d.name.slice(1); })
    .sort(function (a, b) { return compareVersion(b, a); });
}

function bumpPatch(version) {
  const parts = versionParts(version);
  return parts[0] + '.' + parts[1] + '.' + (parts[2] + 1);
}

const args = process.argv.slice(2);
const versions = listVersions();

if (!args.length || args.indexOf('--list') !== -1) {
  console.log('已归档版本（新 → 旧）：');
  versions.forEach(function (v) {
    console.log('  v' + v + (v === pkg.version ? '   ← 当前' : ''));
  });
  console.log('\n用法：npm run rollback -- <版本号> [--as <新版本号>]');
  process.exit(0);
}

const target = String(args[0]).replace(/^v/, '');
const dir = join('releases', 'v' + target);

if (versions.indexOf(target) === -1 || !existsSync(join(dir, 'plugin.js'))) {
  console.error('找不到归档：v' + target);
  console.error('可用：' + (versions.join(', ') || '（无）'));
  process.exit(1);
}

const asIndex = args.indexOf('--as');
let nextVersion = asIndex !== -1 ? String(args[asIndex + 1] || '').replace(/^v/, '') : '';

if (!nextVersion) {
  const base = compareVersion(pkg.version, target) >= 0 ? pkg.version : target;
  nextVersion = bumpPatch(base);
}

if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error('版本号格式应为 x.y.z：' + nextVersion);
  process.exit(1);
}

if (compareVersion(nextVersion, pkg.version) <= 0) {
  console.error(`新版本号 ${nextVersion} 必须大于当前 ${pkg.version}，否则宿主不会提示更新`);
  process.exit(1);
}

/* ---------- 写回产物 ---------- */

FILES.forEach(function (name) {
  const from = join(dir, name);
  if (existsSync(from)) copyFileSync(from, name);
});

// 把产物里内嵌的旧版本号改成新版本号（banner 与 __VERSION__ 都是字面量）
let code = readFileSync('plugin.js', 'utf8');
code = code.split('v' + target).join('v' + nextVersion);
code = code.split('"' + target + '"').join('"' + nextVersion + '"');
writeFileSync('plugin.js', code);

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = nextVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

pkg.version = nextVersion;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`已回退到 v${target} 的产物，发布版本号 v${nextVersion}`);
console.log('下一步：npm run deploy');
console.log('注意：src/ 未改动；继续开发时 npm run build 会用当前源码重新覆盖产物');
