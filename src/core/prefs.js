/**
 * 推荐偏好：纯数据变换，不碰 DOM / 网络，方便单测。
 * 结构：[{ id, label, prompt, weight, builtin }]
 *   weight 0~100，表示「这类偏好的重要程度 / 喜欢概率」
 */

export var MAX_PREFS = 12;

function clampWeight(value) {
  var n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanText(text, max) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 默认四类偏好（可改提示词、可调权重，不允许删到空） */
export function defaultPrefs() {
  return [
    {
      id: 'genre',
      label: '曲风与语种',
      prompt: '偏华语流行、独立民谣，也能接受英文慢歌',
      weight: 60,
      builtin: true
    },
    {
      id: 'era',
      label: '年代',
      prompt: '更偏 2010 年之后的歌，好听的老歌也可以',
      weight: 40,
      builtin: true
    },
    {
      id: 'mood',
      label: '情绪',
      prompt: '睡前和通勤时想听安静、治愈的歌',
      weight: 55,
      builtin: true
    },
    {
      id: 'avoid',
      label: '避雷',
      prompt: '不要喊麦、不要土味改编、不要太吵',
      weight: 80,
      builtin: true
    }
  ];
}

export function normalizePrefs(raw) {
  var list = Array.isArray(raw) ? raw : [];
  var out = [];
  var seen = Object.create(null);

  list.slice(0, MAX_PREFS).forEach(function (item, index) {
    if (!item || typeof item !== 'object') return;

    var label = cleanText(item.label, 16);
    var prompt = cleanText(item.prompt, 120);
    if (!label && !prompt) return;

    var id = String(item.id || ('p' + index + '_' + Date.now().toString(36)));
    if (seen[id]) id = id + '_' + index;
    seen[id] = true;

    out.push({
      id: id,
      label: label || '偏好',
      prompt: prompt,
      weight: clampWeight(item.weight),
      builtin: !!item.builtin
    });
  });

  // 一条都没有时给回默认，避免推荐页空白
  return out.length ? out : defaultPrefs();
}

export function addPref(list, label, prompt) {
  var arr = Array.isArray(list) ? list.slice() : [];
  if (arr.length >= MAX_PREFS) return { list: arr, pref: null, reason: 'limit' };

  var pref = {
    id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    label: cleanText(label, 16) || '新偏好',
    prompt: cleanText(prompt, 120),
    weight: 50,
    builtin: false
  };
  arr.push(pref);
  return { list: arr, pref: pref };
}

export function removePref(list, id) {
  var arr = Array.isArray(list) ? list.slice() : [];
  var target = null;
  arr.forEach(function (p) { if (p && p.id === id) target = p; });
  if (target && target.builtin) return { list: arr, removed: false, reason: 'builtin' };

  var next = arr.filter(function (p) { return !p || p.id !== id; });
  if (!next.length) return { list: next, removed: false, reason: 'empty' };
  return { list: next, removed: true };
}

export function updatePref(list, id, patch) {
  return (Array.isArray(list) ? list : []).map(function (p) {
    if (!p || p.id !== id) return p;
    var next = Object.assign({}, p);
    if (patch && typeof patch.label === 'string') next.label = cleanText(patch.label, 16) || p.label;
    if (patch && typeof patch.prompt === 'string') next.prompt = cleanText(patch.prompt, 120);
    if (patch && patch.weight != null) next.weight = clampWeight(patch.weight);
    return next;
  });
}

/** 把偏好压成给模型看的一段话（weight 高的排前面） */
export function prefsToPrompt(list) {
  var arr = (Array.isArray(list) ? list : []).slice();
  arr.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
  return arr.map(function (p) {
    return '- ' + p.label + '（重要度 ' + p.weight + '/100）：' + (p.prompt || '无特别要求');
  }).join('\n');
}

/** 避雷项的提示词，用来过滤推荐结果 */
export function avoidTexts(list) {
  return (Array.isArray(list) ? list : [])
    .filter(function (p) { return p && p.label === '避雷' && p.prompt; })
    .map(function (p) { return p.prompt; });
}
