/**
 * 宿主适配层：全项目唯一允许出现 roche.* 的文件。
 * 业务层只看 host.caps.xxx 与这里返回的归一化结果，不直接碰宿主对象。
 */

function isFn(obj, name) {
  return !!(obj && typeof obj[name] === 'function');
}

function warn(label, err) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[music-player] ' + label, err);
  }
}

export function createHost(roche) {
  var raw = roche || {};
  var memory = Object.create(null);

  var caps = {
    storage: isFn(raw.storage, 'get') && isFn(raw.storage, 'set'),
    storageDelete: isFn(raw.storage, 'delete'),
    uiToast: isFn(raw.ui, 'toast'),
    uiConfirm: isFn(raw.ui, 'confirm'),
    uiCloseApp: isFn(raw.ui, 'closeApp'),
    openApp: isFn(raw.ui, 'openApp'),
    minimizeApp: isFn(raw.ui, 'minimizeApp'),
    restoreApp: isFn(raw.ui, 'restoreApp'),
    createCard: isFn(raw.chat, 'createCard'),
    updateCard: isFn(raw.chat, 'updateCard'),
    sendMessage: isFn(raw.chat, 'sendMessage'),
    dispatchCardAction: isFn(raw.chat, 'dispatchCardAction')
  };

  /**
   * localStorage 镜像：宿主 storage 在「App 作用域」和「聊天回调作用域」可能是两份，
   * 聊天侧写的队列 App 读不到。localStorage 同源共享，所以双写一份兜底。
   */
  function mirrorGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var text = localStorage.getItem('mp:mirror:' + key);
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  function mirrorSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('mp:mirror:' + key, JSON.stringify(value));
    } catch (err) { /* 配额满就算了 */ }
  }

  var storage = {
    async get(key, fallback) {
      try {
        if (caps.storage) {
          var value = await raw.storage.get(key);
          if (value !== undefined && value !== null) {
            memory[key] = value;
            mirrorSet(key, value);
            return value;
          }
        }
      } catch (err) {
        warn('storage.get ' + key, err);
      }
      if (key in memory) return memory[key];

      // 宿主读不到时再看镜像（跨作用域写入的数据落在这里）
      var mirrored = mirrorGet(key);
      if (mirrored !== null) {
        memory[key] = mirrored;
        return mirrored;
      }
      return fallback;
    },
    async set(key, value) {
      memory[key] = value;
      mirrorSet(key, value);
      try {
        if (caps.storage) await raw.storage.set(key, value);
        return true;
      } catch (err) {
        warn('storage.set ' + key, err);
        return false;
      }
    },
    async delete(key) {
      delete memory[key];
      try {
        if (caps.storageDelete) await raw.storage.delete(key);
        return true;
      } catch (err) {
        warn('storage.delete ' + key, err);
        return false;
      }
    }
  };

  var ui = {
    toast(message) {
      if (caps.uiToast) {
        try { raw.ui.toast(String(message)); } catch (err) { warn('ui.toast', err); }
      }
    },
    async confirm(options) {
      if (!caps.uiConfirm) return true;
      try {
        return !!(await raw.ui.confirm(options || {}));
      } catch (err) {
        warn('ui.confirm', err);
        return false;
      }
    },
    openApp(appId) {
      if (caps.openApp) {
        try { raw.ui.openApp(appId); } catch (err) { warn('ui.openApp', err); }
      }
    },
    closeApp() {
      if (caps.uiCloseApp) {
        try { raw.ui.closeApp(); } catch (err) { warn('ui.closeApp', err); }
      }
    },
    minimizeApp() {
      if (caps.minimizeApp) {
        try { raw.ui.minimizeApp(); } catch (err) { warn('ui.minimizeApp', err); }
      }
    },
    restoreApp() {
      if (caps.restoreApp) {
        try { raw.ui.restoreApp(); } catch (err) { warn('ui.restoreApp', err); }
      }
    }
  };

  /** 卡片能力：宿主没有时统一返回 {ok:false}，UI 侧据此提示「宿主版本不支持」 */
  var chat = {
    async createCard(payload) {
      if (!caps.createCard) return { ok: false, reason: 'no_api' };
      try {
        await raw.chat.createCard(payload);
        return { ok: true };
      } catch (err) {
        warn('chat.createCard', err);
        return { ok: false, reason: 'error', error: err };
      }
    },
    async updateCard(payload) {
      if (!caps.updateCard) return { ok: false, reason: 'no_api' };
      try {
        await raw.chat.updateCard(payload);
        return { ok: true };
      } catch (err) {
        warn('chat.updateCard', err);
        return { ok: false, reason: 'error', error: err };
      }
    },
    async sendMessage(payload) {
      if (!caps.sendMessage) return { ok: false, reason: 'no_api' };
      try {
        await raw.chat.sendMessage(payload);
        return { ok: true };
      } catch (err) {
        warn('chat.sendMessage', err);
        return { ok: false, reason: 'error', error: err };
      }
    },
    async dispatchCardAction(payload) {
      if (!caps.dispatchCardAction) return { ok: false, reason: 'no_api' };
      try {
        await raw.chat.dispatchCardAction(payload);
        return { ok: true };
      } catch (err) {
        warn('chat.dispatchCardAction', err);
        return { ok: false, reason: 'error', error: err };
      }
    }
  };

  return { caps: caps, raw: raw, storage: storage, ui: ui, chat: chat };
}
