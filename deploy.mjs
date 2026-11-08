/**
 * 发布到 GitHub（触发小手机「检查更新」用的同一个 raw 地址）
 *
 * PowerShell:
 *   $env:GITHUB_TOKEN="ghp_xxx"; npm run deploy
 * bash:
 *   GITHUB_TOKEN=ghp_xxx npm run deploy
 *
 * 令牌只从环境变量读取，不写入任何文件。建议用 1 天有效期的 classic token（repo 权限）。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OWNER = 'chu-bing-yu';
const REPO = 'music-player';
const FILES = ['plugin.js', 'manifest.json', 'README.md'];

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

async function request(method, path, body) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'music-player-deploy',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

/** 国内直连 api.github.com 偶尔会被 TLS 重置，失败重试 3 次 */
async function api(method, path, body) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await request(method, path, body);
    } catch (err) {
      lastError = err;
      if (attempt === 3) break;
      console.warn(`网络错误（第 ${attempt} 次，重试中）：${err.message}`);
      await new Promise((r) => setTimeout(r, 900 * attempt));
    }
  }
  throw lastError;
}

const me = await api('GET', '/user');
if (me.status !== 200) {
  console.error('认证失败：', me.status, me.json && me.json.message);
  process.exit(1);
}

// 仓库不存在时自动建一个公开仓库，省得手动去 GitHub 点
const repo = await api('GET', `/repos/${OWNER}/${REPO}`);
if (repo.status === 404) {
  console.log(`仓库 ${OWNER}/${REPO} 不存在，正在创建…`);
  const created = await api('POST', '/user/repos', {
    name: REPO,
    private: false,
    auto_init: true,
    description: 'Roche 音乐播放器插件'
  });
  if (created.status !== 201) {
    console.error('创建仓库失败：', created.status, created.json && created.json.message);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1500));
} else if (repo.status !== 200) {
  console.error('读取仓库失败：', repo.status, repo.json && repo.json.message);
  process.exit(1);
}

let failed = 0;

for (const name of FILES) {
  const content = readFileSync(join(here, name));
  const target = `/repos/${OWNER}/${REPO}/contents/${name}`;
  const existing = await api('GET', `${target}?ref=main`);
  const payload = {
    message: `release v${pkg.version} · ${name}`,
    content: content.toString('base64'),
    branch: 'main'
  };
  if (existing.json && existing.json.sha) payload.sha = existing.json.sha;

  const put = await api('PUT', target, payload);
  const ok = put.status === 200 || put.status === 201;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}  ${content.length}B  ${ok ? '' : (put.json && put.json.message) || ''}`);
}

if (failed) {
  // 中途失败会让仓库处于新旧混合状态，必须让调用方感知到
  console.error(`\n${failed} 个文件发布失败，线上可能仍是旧版本或新旧混合，请重跑或回退 commit`);
  process.exit(1);
}

console.log('\n版本 ' + pkg.version + ' 已发布');
console.log('Manifest: https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/main/manifest.json');
console.log('提示：小手机里打开「插件 App 管理 → 检查更新 → 重载」即可生效');
