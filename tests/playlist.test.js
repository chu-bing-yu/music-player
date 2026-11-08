import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlaylist, normalizePlaylists, renamePlaylist, deletePlaylist,
  addTracksToPlaylist, removeTrackFromPlaylist, moveTrackInPlaylist,
  findPlaylist, playlistDuration, MAX_PLAYLISTS, MAX_TRACKS_PER_PLAYLIST
} from '../src/core/playlist.js';
import { normalizeTrack } from '../src/core/track.js';

function track(id) {
  return normalizeTrack({ id, name: '歌' + id, artist: '歌手', duration: 180000 }, 'gd');
}

test('新建歌单插到最前面，名字会去空格并兜底', () => {
  const res = createPlaylist([], '  夜跑  ', 'p1', 1000);
  assert.equal(res.list.length, 1);
  assert.equal(res.playlist.name, '夜跑');
  assert.equal(res.playlist.createdAt, 1000);

  const blank = createPlaylist([], '   ', 'p2', 2000);
  assert.equal(blank.playlist.name, '未命名歌单');
});

test('歌单数量达到上限后拒绝创建', () => {
  let list = [];
  for (let i = 0; i < MAX_PLAYLISTS; i++) {
    list = createPlaylist(list, 'P' + i, 'p' + i, i).list;
  }
  const res = createPlaylist(list, '多余', 'px', 0);
  assert.equal(res.playlist, null);
  assert.equal(res.reason, 'limit');
});

test('加歌自动去重，重复数会统计', () => {
  const list = createPlaylist([], '测试', 'p1', 1).list;
  const first = addTracksToPlaylist(list, 'p1', [track(1), track(2)], 2);
  assert.equal(first.added, 2);

  const again = addTracksToPlaylist(first.list, 'p1', [track(2), track(3)], 3);
  assert.equal(again.added, 1);
  assert.equal(again.duplicate, 1);
  assert.equal(findPlaylist(again.list, 'p1').tracks.length, 3);
});

test('歌单满 500 首后不再追加', () => {
  const list = createPlaylist([], '大表', 'p1', 1).list;
  const many = [];
  for (let i = 0; i < MAX_TRACKS_PER_PLAYLIST; i++) many.push(track(i));
  const filled = addTracksToPlaylist(list, 'p1', many, 2);
  assert.equal(filled.added, MAX_TRACKS_PER_PLAYLIST);

  const extra = addTracksToPlaylist(filled.list, 'p1', [track(9999)], 3);
  assert.equal(extra.added, 0);
  assert.equal(extra.full, true);
});

test('移除、上移下移都只动目标歌单', () => {
  let list = createPlaylist([], 'A', 'a', 1).list;
  list = createPlaylist(list, 'B', 'b', 1).list;
  list = addTracksToPlaylist(list, 'a', [track(1), track(2), track(3)], 2).list;

  list = moveTrackInPlaylist(list, 'a', 0, 2, 3);
  assert.deepEqual(findPlaylist(list, 'a').tracks.map(t => t.name), ['歌2', '歌3', '歌1']);

  list = removeTrackFromPlaylist(list, 'a', 'gd::2', 4);
  assert.deepEqual(findPlaylist(list, 'a').tracks.map(t => t.name), ['歌3', '歌1']);
  assert.equal(findPlaylist(list, 'b').tracks.length, 0);
});

test('重命名与删除', () => {
  let list = createPlaylist([], '旧名', 'p1', 1).list;
  list = renamePlaylist(list, 'p1', '新名', 2);
  assert.equal(findPlaylist(list, 'p1').name, '新名');

  list = deletePlaylist(list, 'p1');
  assert.equal(list.length, 0);
});

test('normalizePlaylists 过滤脏数据并截断长度', () => {
  const raw = [
    null,
    { name: '没有 id' },
    { id: 'p1', name: '正常', tracks: [track(1), track(1), track(2)] },
    { id: 'p2' }
  ];
  const list = normalizePlaylists(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].tracks.length, 2);
  assert.equal(list[1].name, '未命名歌单');
});

test('歌单总时长按秒级毫秒累加', () => {
  let list = createPlaylist([], 'A', 'a', 1).list;
  list = addTracksToPlaylist(list, 'a', [track(1), track(2)], 2).list;
  assert.equal(playlistDuration(findPlaylist(list, 'a')), 360000);
});
