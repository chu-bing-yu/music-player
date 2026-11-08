import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPrefs, normalizePrefs, addPref, removePref, updatePref,
  prefsToPrompt, avoidTexts, MAX_PREFS
} from '../src/core/prefs.js';

test('默认有四类偏好', () => {
  const list = defaultPrefs();
  assert.equal(list.length, 4);
  assert.deepEqual(list.map((p) => p.label), ['曲风与语种', '年代', '情绪', '避雷']);
  list.forEach((p) => {
    assert.equal(p.builtin, true);
    assert.ok(p.weight >= 0 && p.weight <= 100);
  });
});

test('归一化：权重越界被夹住，空项被丢掉', () => {
  const list = normalizePrefs([
    { id: 'a', label: '曲风', prompt: '流行', weight: 999 },
    { id: 'b', label: '', prompt: '', weight: 50 },
    { id: 'c', label: '避雷', prompt: '喊麦', weight: -20 }
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].weight, 100);
  assert.equal(list[1].weight, 0);
});

test('归一化：空数组回退到默认', () => {
  assert.equal(normalizePrefs([]).length, 4);
  assert.equal(normalizePrefs(null).length, 4);
});

test('新增与删除：内置项不能删', () => {
  let list = defaultPrefs();
  const added = addPref(list, '场景', '健身时想听节奏强的');
  assert.equal(added.list.length, 5);
  assert.equal(added.pref.builtin, false);

  const removedBuiltin = removePref(added.list, 'genre');
  assert.equal(removedBuiltin.removed, false);

  const removed = removePref(added.list, added.pref.id);
  assert.equal(removed.removed, true);
  assert.equal(removed.list.length, 4);
});

test('新增到上限后拒绝', () => {
  let list = defaultPrefs();
  while (list.length < MAX_PREFS) list = addPref(list, 'x', 'y').list;
  const res = addPref(list, 'overflow', '');
  assert.equal(res.pref, null);
  assert.equal(res.list.length, MAX_PREFS);
});

test('修改提示词与权重', () => {
  const list = updatePref(defaultPrefs(), 'mood', { prompt: '下雨天想听慢歌', weight: 88 });
  const mood = list.find((p) => p.id === 'mood');
  assert.equal(mood.prompt, '下雨天想听慢歌');
  assert.equal(mood.weight, 88);
});

test('画像文本按权重降序', () => {
  const text = prefsToPrompt(defaultPrefs());
  const avoidIndex = text.indexOf('避雷');
  const eraIndex = text.indexOf('年代');
  assert.ok(avoidIndex !== -1 && eraIndex !== -1);
  assert.ok(avoidIndex < eraIndex, '权重高的避雷应排在年代前面');
});

test('避雷词提取', () => {
  const words = avoidTexts(defaultPrefs());
  assert.equal(words.length, 1);
  assert.ok(words[0].includes('喊麦'));
});
