import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, setState, isOn, toJSON } from '../src/chat/listenState.js';

test('默认开启：没记录的会话视为开启', () => {
  hydrate(null);
  assert.equal(isOn('c1', true), true);
  assert.equal(isOn('', true), true);
});

test('结束某个会话后，只有该会话关闭', () => {
  hydrate(null);
  setState('c1', false);
  assert.equal(isOn('c1', true), false);
  assert.equal(isOn('c2', true), true);
});

test('重新进入会把关闭记录清掉', () => {
  hydrate(null);
  setState('c1', false);
  assert.equal(isOn('c1', true), false);
  setState('c1', true);
  assert.equal(isOn('c1', true), true);
});

test('全局开关关掉时，任何会话都不开启', () => {
  hydrate(null);
  assert.equal(isOn('c1', false), false);
});

test('持久化只保留被关闭的会话', () => {
  hydrate({ c1: false });
  setState('c2', false);
  setState('c3', true);
  assert.deepEqual(toJSON(), { c1: false, c2: false });
});
