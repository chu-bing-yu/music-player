import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativePlatformLike } from '../src/services/nativeAudio.js';

test('有 isNativePlatform：按它说的算', () => {
  assert.equal(isNativePlatformLike({ isNativePlatform: () => true }), true);
  assert.equal(isNativePlatformLike({ isNativePlatform: () => false }), false);
});

test('没有 Capacitor：不是原生', () => {
  assert.equal(isNativePlatformLike(null), false);
  assert.equal(isNativePlatformLike(undefined), false);
});

test('老宿主没有 isNativePlatform：按旧行为当原生', () => {
  assert.equal(isNativePlatformLike({ Plugins: {} }), true);
});

test('isNativePlatform 抛错时不崩，当作不是原生', () => {
  assert.equal(isNativePlatformLike({ isNativePlatform: () => { throw new Error('boom'); } }), false);
});

test('isNativePlatform 不是函数（字符串/布尔）时回退旧行为', () => {
  assert.equal(isNativePlatformLike({ isNativePlatform: 'yes' }), true);
  assert.equal(isNativePlatformLike({ isNativePlatform: false }), true);
});
