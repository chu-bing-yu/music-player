/**
 * 聊天侧读设置。
 *
 * 宿主 storage 在 App 侧与聊天回调里可能是**两份作用域**：之前队列、TA 数据都栽在这上面
 * （`chatLink` 写 mp:mirror:mp:queue、`taStore` 写 mp:mirror:* 都是同一个坑的补救）。
 * 聊天侧读设置一直只读宿主，于是拿到默认值 —— 表现就是「一起听搜索还是 QQ」「设置里开了
 * 点卡片播放却不生效」。
 *
 * 统一策略：App 保存设置时同步写一份 localStorage 镜像；聊天侧镜像优先、宿主兜底、默认值收尾。
 */

import { normalizeSettings } from '../core/settings.js';

export var SETTINGS_MIRROR_KEY = 'mp:mirror:mp:settings';

function readMirror() {
  try {
    if (typeof localStorage === 'undefined') return null;
    var text = localStorage.getItem(SETTINGS_MIRROR_KEY);
    if (!text) return null;
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null; // 脏数据就当没有
  }
}

/** App 侧每次保存设置后调用；写失败不影响保存 */
export function writeSettingsMirror(settings) {
  if (!settings || typeof settings !== 'object') return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify(settings));
  } catch (err) { /* 配额满就算了 */ }
}

export function clearSettingsMirror() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SETTINGS_MIRROR_KEY);
  } catch (err) { /* 忽略 */ }
}

/**
 * @param {Object|null} roche 宿主 API（聊天回调里可能是精简版，只有 storage）
 * @returns {Promise<Object>} 归一化后的设置
 */
export async function readChatSettings(roche) {
  var mirror = readMirror();

  var fromHost = null;
  try {
    if (roche && roche.storage && typeof roche.storage.get === 'function') {
      fromHost = await roche.storage.get('mp:settings', null);
    }
  } catch (err) {
    fromHost = null;
  }

  var raw = null;
  if (mirror && fromHost && typeof fromHost === 'object') {
    // 两边都有：镜像来自 App 侧（更新），只把镜像缺的键从宿主补上
    raw = Object.assign({}, fromHost, mirror);
  } else {
    raw = mirror || fromHost || null;
  }

  return normalizeSettings(raw);
}
