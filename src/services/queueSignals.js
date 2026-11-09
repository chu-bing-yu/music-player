/**
 * 聊天侧 ↔ App 侧的队列信号。
 *
 * 背景：聊天回调里的 roche.storage 与 App 侧可能是两份作用域，所以聊天点歌时
 * 同时写 localStorage 镜像（mp:mirror:mp:queue）并打一个「原生队列需要重建」标记。
 * App 侧原来只在**首次挂载**时读这个标记，App 已开着的时候状态栏就永远锁在那一首上。
 *
 * 这里把 key 和读写收在一处，App 定时器与聊天侧共用，避免再次两边各写各的。
 */

export var QUEUE_MIRROR_KEY = 'mp:mirror:mp:queue';
export var REBUILD_FLAG = 'mp:needRebuild';

function ls() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (err) {
    return null;
  }
}

/** 聊天侧：写完队列后调用，告诉 App「原生只拿到了一首，找机会重建窗口」 */
export function markRebuildNeeded() {
  var store = ls();
  if (!store) return;
  try {
    store.setItem(REBUILD_FLAG, '1');
  } catch (err) { /* 忽略 */ }
}

export function isRebuildNeeded() {
  var store = ls();
  if (!store) return false;
  try {
    return store.getItem(REBUILD_FLAG) === '1';
  } catch (err) {
    return false;
  }
}

export function clearRebuildNeeded() {
  var store = ls();
  if (!store) return;
  try {
    store.removeItem(REBUILD_FLAG);
  } catch (err) { /* 忽略 */ }
}

/** 聊天侧：读 App 队列镜像（{ tracks, order, pos, ... }） */
export function readQueueMirror() {
  var store = ls();
  if (!store) return null;
  try {
    var text = store.getItem(QUEUE_MIRROR_KEY);
    if (!text) return null;
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.tracks) ? parsed : null;
  } catch (err) {
    return null;
  }
}

export function writeQueueMirror(payload) {
  var store = ls();
  if (!store || !payload) return;
  try {
    store.setItem(QUEUE_MIRROR_KEY, JSON.stringify(payload));
  } catch (err) { /* 忽略 */ }
}
