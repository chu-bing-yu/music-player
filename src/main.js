import { createApp } from './app/container.js';
import { ensureStyle, removeStyleIfUnused } from './ui/style.js';
import {
  MESSAGE_TYPE, mountCard, updateCard, unmountCard, onCardAction, openPlusAction
} from './chat/card.js';
import { chatContextProvider, chatTools } from './chat/chatLink.js';
import { startCommandBridge } from './chat/commandBridge.js';

var app = null;

async function mount(container, roche) {
  ensureStyle();
  container.classList.add('mp-host');
  app = await createApp({ container: container, roche: roche, version: __VERSION__ });
}

async function unmount(container) {
  if (app) {
    app.destroy();
    app = null;
  }
  container.replaceChildren();
  container.classList.remove('mp-host');
  container.removeAttribute('data-theme');
  removeStyleIfUnused();
}

var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';

window.RochePlugin.register({
  id: 'music-player',
  name: '音乐播放器',
  version: __VERSION__,
  description: '多音源搜歌、播放、歌单与收藏，可在聊天里发起一起听。',

  apps: [
    {
      id: 'music-player-home',
      name: '音乐',
      icon: 'music',
      iconImage: '',
      // 边听歌边聊天：允许最小化成全局悬浮按钮
      minimize: {
        mode: 'button',
        scope: 'global',
        iconSvg: PLUS_ICON,
        width: 300,
        height: 220
      },
      mount: mount,
      unmount: unmount
    }
  ],

  chat: {
    scope: { conversationTypes: ['direct', 'group'] },

    // 每轮注入「当前在听什么」+ 可用动作；设置里关掉一起听后返回 null，不注入
    contextProvider: chatContextProvider,

    // 模型可直接调用的音乐工具（点歌 / 切歌 / 暂停 / 查状态 / 收藏）
    tools: chatTools,

    messageTypes: [
      {
        id: MESSAGE_TYPE,
        name: '一起听',
        scope: { conversationTypes: ['direct', 'group'] },
        mount: mountCard,
        update: updateCard,
        unmount: unmountCard,
        onAction: onCardAction
      }
    ],

    plusActions: [
      {
        id: 'mp-listen',
        label: '一起听',
        iconSvg: PLUS_ICON,
        scope: { conversationTypes: ['direct', 'group'] },
        open: openPlusAction
      }
    ]
  }
});

// 标记通道的轮询器默认不启动：后台轮询会干扰原生播放（表现为「队列里有歌却放不出来」）。
// 设置里把「指令通道」切到「标记」时才启用。
if (typeof window !== 'undefined') {
  window.__mpStartCommandBridge = startCommandBridge;
}
