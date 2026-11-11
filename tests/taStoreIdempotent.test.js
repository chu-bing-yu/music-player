/**
 * 角色数据层的幂等：同名歌单不重复、同曲评论只留一条、删除要能跨别名删干净。
 * 这三个是「评论/歌单重复出现 + 左滑删不掉」的结构性根因。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCharId,
  createCharPlaylist,
  saveComment,
  deleteComment,
  loadPlaylists,
  loadComments
} from '../src/services/taStore.js';

function fakeHost() {
  const store = new Map();
  return {
    storage: {
      get: async (k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
      set: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; }
    },
    _dump: () => Object.fromEntries(store)
  };
}

const track = (id, name, artist) => ({ source: 'tencent', platform: 'qq', id, name, artist });

test('角色 id 归一：空串和 ta 是同一个', () => {
  assert.equal(normalizeCharId(''), 'ta');
  assert.equal(normalizeCharId(null), 'ta');
  assert.equal(normalizeCharId('ta-1'), 'ta-1');
  assert.equal(normalizeCharId('  '), 'ta');
});

test('同名同角色歌单第二次复用，不新建', async () => {
  const host = fakeHost();
  const a = await createCharPlaylist(host, 'ta-1', '雨夜书单', [track(1, '晴天', '周杰伦')]);
  const b = await createCharPlaylist(host, 'ta-1', '雨夜书单', [track(2, '夜曲', '周杰伦')]);

  assert.equal(a.ok, true);
  assert.equal(a.reused, false);
  assert.equal(b.reused, true, '第二次应该是复用');

  const list = await loadPlaylists(host);
  const same = list.filter((p) => p.owner === 'char' && p.name === '雨夜书单');
  assert.equal(same.length, 1, '不能出现两个同名歌单');
  assert.equal(same[0].tracks.length, 2, '复用时要把新歌追加进去');
});

test('同一首歌重复写评论只留一条（同 key）', async () => {
  const host = fakeHost();
  const t = track(1, '晴天', '周杰伦');
  await saveComment(host, 'ta-1', t, '第一次');
  await saveComment(host, 'ta-1', t, '第二次');

  const map = await loadComments(host);
  const keys = Object.keys(map);
  assert.equal(keys.length, 1);
  assert.equal(map[keys[0]]['ta-1'].text, '第二次', '应覆盖成最新一条');
});

test('同一首歌换了 key（只有歌名 vs 带 id）会归并到同一个 key', async () => {
  const host = fakeHost();
  await saveComment(host, 'ta-1', track(1, '晴天', '周杰伦'), '有 id 的');
  await saveComment(host, 'ta-1', { name: '晴天', artist: '周杰伦' }, '只有歌名的');

  const map = await loadComments(host);
  const keys = Object.keys(map);
  assert.equal(keys.length, 1, '同一首歌不能存成两条：' + JSON.stringify(keys));
  assert.equal(map[keys[0]]['ta-1'].text, '只有歌名的');
});

test('角色 id 空串与 ta 视为同一人，共用一条', async () => {
  const host = fakeHost();
  const t = track(2, '夜曲', '周杰伦');
  await saveComment(host, '', t, '甲');
  await saveComment(host, 'ta', t, '乙');

  const map = await loadComments(host);
  const entry = map[Object.keys(map)[0]];
  assert.deepEqual(Object.keys(entry), ['ta']);
  assert.equal(entry['ta'].text, '乙');
});

test('删除评论能跨别名 + 跨重复 key 一起清掉', async () => {
  const host = fakeHost();
  // 手工造一份「历史重复数据」：两个 key、两个角色别名、同一条正文
  await host.storage.set('mp:comments', {
    'tencent:qq:1': {
      ta: { text: '副歌一进来就被击中了', at: 1, name: '晴天', artist: '周杰伦' }
    },
    'name|晴天|周杰伦': {
      '': { text: '副歌一进来就被击中了', at: 2, name: '晴天', artist: '周杰伦' }
    }
  });
  if (typeof localStorage !== 'undefined') localStorage.removeItem('mp:mirror:mp:comments');

  const res = await deleteComment(host, 'ta', 'tencent:qq:1', '副歌一进来就被击中了');
  assert.equal(res.ok, true);
  assert.ok(res.removed >= 2, '两份重复都要删掉，实际 ' + res.removed);

  const map = await loadComments(host);
  assert.deepEqual(Object.keys(map), []);
});

test('删除不存在的评论返回失败而不是崩溃', async () => {
  const host = fakeHost();
  const res = await deleteComment(host, 'ta', 'tencent:qq:404', 'x');
  assert.equal(res.ok, false);
  assert.equal(res.removed, 0);
});
