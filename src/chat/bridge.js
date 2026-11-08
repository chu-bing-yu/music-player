/**
 * App 与「主聊天」之间的桥：App 挂载时把可执行动作注册进来，
 * 卸载后注销，但会留一份状态快照，
 * 这样聊天里的「一起听」面板在 App 不在前台时仍能显示当前歌和队列。
 */

var api = null;
var snapshot = null;

export function setBridge(next) {
  api = next || null;
}

export function clearBridge() {
  api = null;
}

export function getBridge() {
  return api;
}

/** App 每次状态变化时刷新快照（轻量：只存引用，不深拷贝） */
export function saveSnapshot(data) {
  snapshot = data || null;
}

export function getSnapshot() {
  return snapshot;
}
