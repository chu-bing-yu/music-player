/** 统一的 HTTP 请求：超时、可选请求前缀、JSON 容错 */

var TIMEOUT_MS = 8000;

/** 可选请求前缀：留空直连；含 {url} 会替换，否则把编码后的地址接在后面 */
export function applyProxy(url, prefix) {
  var p = String(prefix || '').trim();
  if (!p) return url;
  if (p.indexOf('{url}') !== -1) return p.replace('{url}', encodeURIComponent(url));
  return p + encodeURIComponent(url);
}

async function fetchText(url, prefix) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
  try {
    var res = await fetch(applyProxy(url, prefix), {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchJson(url, prefix) {
  var text = await fetchText(url, prefix);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    // 少数反代会把 JSON 再包一层字符串
    return JSON.parse(JSON.parse(text));
  }
}

export { fetchText };
