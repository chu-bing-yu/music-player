import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleFavorite, isFavorite, pushRecent, normalizeFavorites, normalizeRecent, MAX_FAVORITES } from '../src/core/favorites.js';
import { normalizeTrack, trackKey } from '../src/core/track.js';
import { mergeResults, filterByKeyword, rankTracks } from '../src/core/search.js';

function track(id, name, artist, source) {
  return normalizeTrack({ id, name: name || '歌' + id, artist: artist || '歌手', source: source || 'gd' }, source || 'gd');
}

test('收藏/取消收藏来回切换', () => {
  const t = track(1);
  const added = toggleFavorite([], t);
  assert.equal(added.added, true);
  assert.equal(added.favorites.length, 1);
  assert.equal(isFavorite(added.favorites, trackKey(t)), true);

  const removed = toggleFavorite(added.favorites, t);
  assert.equal(removed.removed, true);
  assert.equal(removed.favorites.length, 0);
});

test('收藏上限 500 首', () => {
  const list = [];
  for (let i = 0; i < MAX_FAVORITES; i++) list.push(track(i));
  const res = toggleFavorite(list, track(99999));
  assert.equal(res.full, true);
  assert.equal(res.favorites.length, MAX_FAVORITES);
});

test('最近播放把重复项提到最前并截断', () => {
  let recent = [];
  recent = pushRecent(recent, track(1), 3);
  recent = pushRecent(recent, track(2), 3);
  recent = pushRecent(recent, track(1), 3);
  assert.deepEqual(recent.map(t => t.id), ['1', '2']);

  recent = pushRecent(recent, track(3), 3);
  recent = pushRecent(recent, track(4), 3);
  assert.deepEqual(recent.map(t => t.id), ['4', '3', '1']);
});

test('脏数据归一化', () => {
  const favs = normalizeFavorites([track(1), track(1), null, { bad: true }]);
  assert.equal(favs.length, 1);
  assert.deepEqual(normalizeRecent('nope'), []);
});

test('多源结果合并去重，错误单独收集', () => {
  const groups = [
    { source: 'gd', tracks: [track(1), track(2)] },
    { source: 'itunes', tracks: [track(2), track(3)] },
    { source: 'gd', tracks: [], error: 'blocked' }
  ];
  const merged = mergeResults(groups);
  assert.equal(merged.tracks.length, 3);
  assert.equal(merged.errors.length, 1);
  assert.equal(merged.counts.itunes, 2);
});

test('关键词过滤与排序：歌名开头优先', () => {
  const list = [
    track(1, '雨天', '孙燕姿'),
    track(2, '雨', '某人'),
    track(3, '晴天', '周杰伦'),
    track(4, '小雨', '歌手雨')
  ];
  const ranked = rankTracks(list, '雨');
  assert.equal(ranked[0].name, '雨');
  assert.equal(ranked.length, 4);

  const filtered = filterByKeyword(list, '周杰伦');
  assert.deepEqual(filtered.map(t => t.id), ['3']);
  assert.equal(filterByKeyword(list, '').length, 4);
});
