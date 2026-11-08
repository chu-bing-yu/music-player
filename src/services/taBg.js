/**
 * TA 页背景图：每个角色一张。
 *
 * 宿主没有「上传图片转 URL」的能力（只有 ai.generateImage），
 * 所以本地上传只能压成 dataURL 存插件 storage；也支持直接填图片 URL。
 * 单张目标 ≤ 350KB，6 个角色约 2MB，超了宁可报错也不静默撑爆 storage。
 */

var KEY = 'mp:taBg';
var MAX_WIDTH = 900;
var SOFT_SIZE = 350 * 1024;
var HARD_SIZE = 500 * 1024;

function mirrorRead() {
  try {
    if (typeof localStorage === 'undefined') return null;
    var text = localStorage.getItem('mp:mirror:' + KEY);
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return null;
  }
}

function mirrorWrite(map) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('mp:mirror:' + KEY, JSON.stringify(map));
  } catch (err) { /* 配额满就算了 */ }
}

/** 单个背景记录归一化：只认 dataURL 与 http(s) URL */
export function normalizeBg(raw) {
  if (!raw || typeof raw !== 'object') return null;

  var type = raw.type === 'url' ? 'url' : 'data';
  var value = String(raw.value || '').trim();
  if (!value) return null;

  if (type === 'url' && !/^https?:\/\//i.test(value)) return null;
  if (type === 'data' && value.indexOf('data:image/') !== 0) return null;

  return { type: type, value: value, at: Number(raw.at) || 0 };
}

/** 整个 map 归一化 */
export function normalizeBgs(raw) {
  var out = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(function (id) {
    var one = normalizeBg(raw[id]);
    if (id && one) out[id] = one;
  });
  return out;
}

/** 读全部角色的背景（宿主读不到就回落镜像） */
export async function loadBgs(roche) {
  var fromHost = null;
  try {
    if (roche && roche.storage && typeof roche.storage.get === 'function') {
      fromHost = await roche.storage.get(KEY);
    }
  } catch (err) {
    fromHost = null;
  }

  var map = normalizeBgs(fromHost);
  if (!Object.keys(map).length) {
    map = normalizeBgs(mirrorRead());
  }
  return map;
}

async function persist(roche, map) {
  mirrorWrite(map);
  try {
    if (roche && roche.storage && typeof roche.storage.set === 'function') {
      await roche.storage.set(KEY, map);
      return true;
    }
  } catch (err) { /* 写失败由调用方提示 */ }
  return false;
}

/** 保存某角色的背景；上传（data）优先于链接（url） */
export async function saveBg(roche, characterId, bg) {
  var id = String(characterId || '').trim();
  var one = normalizeBg(bg);
  if (!id || !one) return { ok: false, reason: '背景数据不合法' };

  var map = await loadBgs(roche);
  map[id] = one;
  var ok = await persist(roche, map);
  return ok ? { ok: true, bg: one } : { ok: false, reason: '存储写入失败，换个更小的图试试' };
}

export async function clearBg(roche, characterId) {
  var id = String(characterId || '').trim();
  if (!id) return { ok: false, reason: '没有角色' };

  var map = await loadBgs(roche);
  delete map[id];
  await persist(roche, map);
  return { ok: true };
}

/** 从文件读出 Image 对象（不依赖 DOM 之外的 API） */
function readImage(file) {
  return new Promise(function (resolve, reject) {
    var url = null;
    try {
      url = URL.createObjectURL(file);
    } catch (err) {
      reject(new Error('读不到这个文件'));
      return;
    }

    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      try { URL.revokeObjectURL(url); } catch (err) { /* 忽略 */ }
      resolve(img);
    };
    img.onerror = function () {
      try { URL.revokeObjectURL(url); } catch (err) { /* 忽略 */ }
      reject(new Error('这张图解码失败'));
    };
    img.src = url;
  });
}

function drawToDataUrl(img, quality) {
  var width = img.naturalWidth || img.width || MAX_WIDTH;
  var height = img.naturalHeight || img.height || MAX_WIDTH;
  var ratio = Math.min(1, MAX_WIDTH / Math.max(1, width));

  var canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));

  var ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 把用户选的图片压成 dataURL。
 * @returns {{ok:true, dataUrl:string, size:number, width:number} | {ok:false, reason:string}}
 */
export async function compressImage(file) {
  if (!file) return { ok: false, reason: '没有选择图片' };
  if (String(file.type || '').indexOf('image/') !== 0) {
    return { ok: false, reason: '只能选图片文件' };
  }
  if (typeof document === 'undefined' || !document.createElement) {
    return { ok: false, reason: '当前环境不支持压缩' };
  }

  var img = null;
  try {
    img = await readImage(file);
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }

  var qualities = [0.72, 0.55, 0.42];
  var lastSize = 0;

  for (var i = 0; i < qualities.length; i++) {
    var dataUrl = '';
    try {
      dataUrl = drawToDataUrl(img, qualities[i]);
    } catch (err) {
      return { ok: false, reason: '压缩失败，换一张图试试' };
    }
    if (!dataUrl) return { ok: false, reason: '压缩失败，换一张图试试' };

    lastSize = Math.round(dataUrl.length * 0.75); // base64 → 字节近似
    if (lastSize <= SOFT_SIZE) {
      return { ok: true, dataUrl: dataUrl, size: lastSize, width: Math.min(MAX_WIDTH, img.naturalWidth || MAX_WIDTH) };
    }
  }

  if (lastSize > HARD_SIZE) {
    return { ok: false, reason: '这张图太大了（>' + Math.round(HARD_SIZE / 1024) + 'KB），换一张小一点的' };
  }
  return { ok: true, dataUrl: drawToDataUrl(img, 0.3), size: lastSize, width: MAX_WIDTH };
}

export var LIMITS = { MAX_WIDTH: MAX_WIDTH, SOFT_SIZE: SOFT_SIZE, HARD_SIZE: HARD_SIZE };
