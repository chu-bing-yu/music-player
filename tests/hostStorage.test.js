/**
 * 宿主 storage 的镜像合并。
 *
 * 这里锁住一个曾经吃过大亏的 bug：App 读宿主值时会顺手把 localStorage 镜像覆盖掉，
 * 于是「角色在聊天侧新建的歌单 / 写的乐评」一进 App 就被抹掉，永远看不到。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/services/host.js';

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

function hostWith(values) {
  return createHost({
    storage: {
      get: async (key) => (key in values ? values[key] : null),
      set: async (key, value) => { values[key] = value; return true; }
    }
  });
}

test('宿主有值、镜像有新增条目：读出来是并集', async () => {
  installStorage();
  localStorage.setItem('mp:mirror:mp:playlists', JSON.stringify([
    { id: 'char-1', name: '角色挑的', owner: 'char', tracks: [] }
  ]));

  const host = hostWith({ 'mp:playlists': [{ id: 'mine-1', name: '夜跑', tracks: [] }] });
  const list = await host.storage.get('mp:playlists', []);

  assert.deepEqual(list.map((p) => p.id).sort(), ['char-1', 'mine-1']);
});

test('读宿主不会把镜像覆盖掉（这是原来的坑）', async () => {
  installStorage();
  const mirror = [{ id: 'char-1', name: '角色挑的', owner: 'char', tracks: [] }];
  localStorage.setItem('mp:mirror:mp:playlists', JSON.stringify(mirror));

  const host = hostWith({ 'mp:playlists': [{ id: 'mine-1', name: '夜跑', tracks: [] }] });
  await host.storage.get('mp:playlists', []);

  const after = JSON.parse(localStorage.getItem('mp:mirror:mp:playlists'));
  assert.deepEqual(after.map((p) => p.id).sort(), ['char-1', 'mine-1']);
});

test('短评对象：合并后镜像里的新评价还在', async () => {
  installStorage();
  localStorage.setItem('mp:mirror:mp:comments', JSON.stringify({
    'tencent:1': { ta: { text: '镜像里的评价', at: 2 } }
  }));

  const host = hostWith({ 'mp:comments': { 'tencent:2': { ta: { text: '宿主里的评价', at: 1 } } } });
  const map = await host.storage.get('mp:comments', {});

  assert.ok(map['tencent:1']);
  assert.ok(map['tencent:2']);
});

test('队列按 at 取新的那份', async () => {
  installStorage();
  localStorage.setItem('mp:mirror:mp:queue', JSON.stringify({ tracks: [{ id: 'a' }], at: 200 }));

  const host = hostWith({ 'mp:queue': { tracks: [{ id: 'b' }], at: 100 } });
  const queue = await host.storage.get('mp:queue', null);

  assert.equal(queue.tracks[0].id, 'a');
});

test('宿主读不到时回退镜像', async () => {
  installStorage();
  localStorage.setItem('mp:mirror:mp:playlists', JSON.stringify([{ id: 'char-1', name: '角色挑的' }]));

  const host = hostWith({});
  const list = await host.storage.get('mp:playlists', []);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'char-1');
});

test('set 同时写宿主和镜像', async () => {
  installStorage();
  const values = {};
  const host = hostWith(values);
  await host.storage.set('mp:playlists', [{ id: 'x' }]);

  assert.equal(values['mp:playlists'][0].id, 'x');
  assert.equal(JSON.parse(localStorage.getItem('mp:mirror:mp:playlists'))[0].id, 'x');
});
