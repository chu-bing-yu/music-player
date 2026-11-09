import test from 'node:test';
import assert from 'node:assert/strict';
import { isTruncatedPlay, createRetryGate, mediaErrorText } from '../src/services/player.js';

test('截断判定：10 秒的歌播到 2 秒 = 被截断', () => {
  assert.equal(isTruncatedPlay(2, 240), true);
});

test('截断判定：完整播完不算截断', () => {
  assert.equal(isTruncatedPlay(239.6, 240), false);
  assert.equal(isTruncatedPlay(240, 240), false);
});

test('截断判定：真正的小于 10 秒的短音频能正常播完', () => {
  // 8 秒的短音频，播到 7.6 秒结束 → 不算截断
  assert.equal(isTruncatedPlay(7.6, 8), false);
  // 同一首只播到 1 秒 → 算截断
  assert.equal(isTruncatedPlay(1, 8), true);
});

test('截断判定：时长未知时按 10 秒阈值', () => {
  assert.equal(isTruncatedPlay(2, 0), true);
  assert.equal(isTruncatedPlay(12, 0), false);
});

test('截断判定：没播过 / 非法值不算截断', () => {
  assert.equal(isTruncatedPlay(0, 200), false);
  assert.equal(isTruncatedPlay(-1, 200), false);
  assert.equal(isTruncatedPlay(NaN, 200), false);
});

test('重试闸门：800ms 内不重复，最多 5 次', () => {
  const gate = createRetryGate(800, 5);
  assert.equal(gate.allow(1000), true);
  assert.equal(gate.allow(1200), false, '间隔不足');
  assert.equal(gate.allow(1900), true);
  assert.equal(gate.allow(2800), true);
  assert.equal(gate.allow(3700), true);
  assert.equal(gate.allow(4600), true);
  assert.equal(gate.allow(5600), false, '超过 5 次');
  assert.equal(gate.count(), 5);
});

test('重试闸门：reset 后重新计数', () => {
  const gate = createRetryGate(800, 5);
  gate.allow(1000);
  gate.allow(2000);
  assert.equal(gate.count(), 2);
  gate.reset();
  assert.equal(gate.count(), 0);
  assert.equal(gate.allow(5000), true);
});

test('错误码翻译', () => {
  assert.equal(mediaErrorText(2), '网络中断');
  assert.equal(mediaErrorText(3).indexOf('解码失败'), 0);
  assert.ok(mediaErrorText(99).indexOf('未知错误') === 0);
});
