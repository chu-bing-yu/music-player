/** 持久化：只走 roche.storage，键统一 mp: 前缀（卸载插件时宿主会一起清） */

import { normalizeSettings, defaultSettings } from '../core/settings.js';
import { normalizePlaylists } from '../core/playlist.js';
import { normalizeFavorites, normalizeRecent } from '../core/favorites.js';

export var KEYS = {
  settings: 'mp:settings',
  playlists: 'mp:playlists',
  favorites: 'mp:favorites',
  recent: 'mp:recent',
  searches: 'mp:searches',
  comments: 'mp:comments',
  cmd: 'mp:cmd',
  queue: 'mp:queue'
};

var MAX_SEARCHES = 12;

export function createStore(host) {
  async function loadSettings() {
    var raw = await host.storage.get(KEYS.settings, null);
    return raw ? normalizeSettings(raw) : defaultSettings();
  }

  async function saveSettings(settings) {
    var clean = normalizeSettings(settings);
    await host.storage.set(KEYS.settings, clean);
    return clean;
  }

  async function loadPlaylists() {
    return normalizePlaylists(await host.storage.get(KEYS.playlists, []));
  }

  async function savePlaylists(list) {
    var clean = normalizePlaylists(list);
    await host.storage.set(KEYS.playlists, clean);
    return clean;
  }

  async function loadFavorites() {
    return normalizeFavorites(await host.storage.get(KEYS.favorites, []));
  }

  async function saveFavorites(list) {
    var clean = normalizeFavorites(list);
    await host.storage.set(KEYS.favorites, clean);
    return clean;
  }

  async function loadRecent() {
    return normalizeRecent(await host.storage.get(KEYS.recent, []));
  }

  async function saveRecent(list) {
    var clean = normalizeRecent(list);
    await host.storage.set(KEYS.recent, clean);
    return clean;
  }

  /** 搜索历史：最近在前，去重，最多 12 条 */
  async function loadSearches() {
    var raw = await host.storage.get(KEYS.searches, []);
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (item) {
      var text = String(item || '').trim();
      if (!text || out.indexOf(text) !== -1) return;
      out.push(text);
    });
    return out.slice(0, MAX_SEARCHES);
  }

  async function saveSearches(list) {
    var out = [];
    (list || []).forEach(function (item) {
      var text = String(item || '').trim();
      if (!text || out.indexOf(text) !== -1) return;
      out.push(text);
    });
    var clean = out.slice(0, MAX_SEARCHES);
    await host.storage.set(KEYS.searches, clean);
    return clean;
  }

  /** 歌曲短评：{ [trackKey]: { [characterId]: { text, at } } } */
  async function loadComments() {
    var raw = await host.storage.get(KEYS.comments, null);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  async function saveComments(map) {
    var safe = map && typeof map === 'object' ? map : {};
    await host.storage.set(KEYS.comments, safe);
    return safe;
  }

  /** 已执行过的指令去重表（标记通道防重复播放） */
  async function loadCommands() {
    var raw = await host.storage.get(KEYS.cmd, []);
    return Array.isArray(raw) ? raw.slice(-200) : [];
  }

  async function saveCommands(list) {
    var clean = (Array.isArray(list) ? list : []).slice(-200);
    await host.storage.set(KEYS.cmd, clean);
    return clean;
  }

  async function clearAll() {
    await host.storage.delete(KEYS.settings);
    await host.storage.delete(KEYS.playlists);
    await host.storage.delete(KEYS.favorites);
    await host.storage.delete(KEYS.recent);
    await host.storage.delete(KEYS.searches);
    await host.storage.delete(KEYS.queue);
    await host.storage.delete(KEYS.comments);
    await host.storage.delete(KEYS.cmd);
  }

  return {
    loadSettings, saveSettings,
    loadPlaylists, savePlaylists,
    loadFavorites, saveFavorites,
    loadRecent, saveRecent,
    loadSearches, saveSearches,
    loadComments, saveComments,
    loadCommands, saveCommands,
    clearAll
  };
}
