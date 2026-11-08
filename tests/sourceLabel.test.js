import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLabel, sourceKey, isPreview } from '../src/core/sourceLabel.js';

test('五种源都能正确命名', () => {
  assert.equal(sourceLabel({ source: 'tencent' }), 'QQ 音乐');
  assert.equal(sourceLabel({ source: 'netease' }), '网易云音乐');
  assert.equal(sourceLabel({ source: 'itunes' }), 'iTunes 试听');
  assert.equal(sourceLabel({ source: 'audius' }), 'Audius');
  assert.equal(sourceLabel({ source: 'local' }), '本地');
});

test('qq 别名归一成 tencent', () => {
  assert.equal(sourceKey({ source: 'qq' }), 'tencent');
  assert.equal(sourceLabel({ source: 'qq' }), 'QQ 音乐');
});

test('source 为空时按 id 推断', () => {
  assert.equal(sourceLabel({ id: 'tencent:qq:123' }), 'QQ 音乐');
  assert.equal(sourceLabel({ id: 'netease:netease:456' }), '网易云音乐');
  assert.equal(sourceLabel({ id: 'itunes:itunes:789' }), 'iTunes 试听');
});

test('什么都不认识时给出明确文案而不是瞎猜', () => {
  assert.equal(sourceLabel({}), '未知来源');
  assert.equal(sourceLabel(null), '未知来源');
});

test('iTunes 标记为试听', () => {
  assert.equal(isPreview({ source: 'itunes' }), true);
  assert.equal(isPreview({ source: 'tencent' }), false);
});
