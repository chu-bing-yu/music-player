import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readChatSettings, writeSettingsMirror, clearSettingsMirror, SETTINGS_MIRROR_KEY
} from '../src/services/chatSettings.js';

/** Node 里没有 localStorage，用一个最简 Map 顶上 */
function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear()
  };
  return map;
}

function hostWith(storageValue) {
  return {
    storage: {
      get: async (key) => (key === 'mp:settings' ? storageValue : null)
    }
  };
}

test('镜像优先：聊天侧读到 App 刚写的设置', async () => {
  installStorage();
  writeSettingsMirror({ cardTapPlay: true, sources: { tencent: false, itunes: true, audius: true, netease: true } });

  const s = await readChatSettings(hostWith({ cardTapPlay: false, sources: { tencent: true, itunes: true, audius: true, netease: true } }));
  assert.equal(s.cardTapPlay, true);
  assert.equal(s.sources.tencent, false);
});

test('镜像缺的键由宿主补齐', async () => {
  installStorage();
  // 镜像里只有 cardTapPlay，没有 sources
  writeSettingsMirror({ cardTapPlay: true });

  const s = await readChatSettings(hostWith({ sources: { tencent: false, itunes: true, audius: true, netease: true } }));
  assert.equal(s.cardTapPlay, true);
  assert.equal(s.sources.tencent, false);
});

test('只有宿主：宿主值为准', async () => {
  installStorage();
  const s = await readChatSettings(hostWith({ cardTapPlay: true, systemMedia: 'off' }));
  assert.equal(s.cardTapPlay, true);
  assert.equal(s.systemMedia, 'off');
});

test('两边都没有：回退默认值', async () => {
  installStorage();
  const s = await readChatSettings(null);
  assert.equal(s.cardTapPlay, false);
  assert.equal(s.sources.tencent, true);
  assert.equal(s.systemMedia, 'auto');
});

test('宿主 storage 抛错不影响', async () => {
  installStorage();
  writeSettingsMirror({ cardTapPlay: true });
  const broken = { storage: { get: async () => { throw new Error('boom'); } } };
  const s = await readChatSettings(broken);
  assert.equal(s.cardTapPlay, true);
});

test('清掉镜像后不再影响', async () => {
  installStorage();
  writeSettingsMirror({ cardTapPlay: true });
  clearSettingsMirror();
  assert.equal(localStorage.getItem(SETTINGS_MIRROR_KEY), null);
  const s = await readChatSettings(null);
  assert.equal(s.cardTapPlay, false);
});

test('镜像被写坏时当没有', async () => {
  const map = installStorage();
  map.set(SETTINGS_MIRROR_KEY, '{not json');
  const s = await readChatSettings(hostWith({ cardTapPlay: true }));
  assert.equal(s.cardTapPlay, true);
});
