/**
 * 「一起听」的会话级开关。
 * 单独一个模块，避免 chatLink 与 listenPanel 互相 import 形成环。
 */

var map = Object.create(null);

export function hydrate(raw) {
  map = Object.create(null);
  if (!raw || typeof raw !== 'object') return;
  Object.keys(raw).forEach(function (key) {
    if (raw[key] === false) map[key] = false;
  });
}

/** on=false 表示这个会话已结束一起听 */
export function setState(conversationId, on) {
  if (!conversationId) return;
  if (on) delete map[conversationId];
  else map[conversationId] = false;
}

/** 全局开关开着、且这个会话没被结束，才算开启 */
export function isOn(conversationId, globalOn) {
  if (!globalOn) return false;
  if (!conversationId) return true;
  return map[conversationId] !== false;
}

/** 只持久化被关闭的会话 */
export function toJSON() {
  var out = {};
  Object.keys(map).forEach(function (key) {
    if (map[key] === false) out[key] = false;
  });
  return out;
}
