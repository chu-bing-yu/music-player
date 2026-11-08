/** 设置：音源、网络、播放、自检、数据 */

import { h, clear } from '../dom.js';
import { pageTitle } from '../components.js';
import { THEMES, ACCENTS, DEFAULT_CHAT_PROMPT, TOOL_CHAT_PROMPT, HYBRID_CHAT_PROMPT } from '../../core/settings.js';
import { qrKey, qrCreate, qrCheck, account as neteaseAccount, isReady as neteaseReady } from '../../services/netease.js';

function field(label, node, desc) {
  var left = h('div', { class: 'mp-field__label' }, [
    h('div', { text: label }),
    desc ? h('div', { class: 'mp-field__desc', text: desc }) : null
  ]);
  return h('div', { class: 'mp-field' }, [left, node]);
}

/** 控件比较宽（三个按钮那种）时用：标题+说明占一行，控件整行放下面 */
function fieldStack(label, node, desc) {
  var left = h('div', { class: 'mp-field__label' }, [
    h('div', { text: label }),
    desc ? h('div', { class: 'mp-field__desc', text: desc }) : null
  ]);
  return h('div', { class: 'mp-field mp-field--stack' }, [left, node]);
}

function switchEl(on, onToggle) {
  var btn = h('button', {
    class: 'mp-switch' + (on ? ' is-on' : ''),
    type: 'button',
    'aria-pressed': on ? 'true' : 'false'
  });
  btn.addEventListener('click', function () { onToggle(!on); });
  return btn;
}

export function mount(host, ctx) {
  var state = ctx.state;
  var body = h('div', { class: 'mp-body' });
  var statsTimer = null;

  var header = h('div', { class: 'mp-header' }, [
    pageTitle('设置', function () { ctx.exitOrMinimize(); })
  ]);

  function setSource(key, value) {
    var sources = Object.assign({}, state.settings.sources);
    sources[key] = value;
    // 四个源都可以自由开关，全关也能存；搜索时会提示「至少开一个音源」
    ctx.updateSettings({ sources: sources });
    if (!sources.tencent && !sources.itunes && !sources.audius) {
      ctx.toast('都关掉了，搜索会没有结果');
    }
  }

  /* ---------- 网易云扫码登录 ---------- */

  function openQrModal() {
    var settings = state.settings;
    if (!neteaseReady(settings)) {
      ctx.toast('先填网易云 API 地址');
      return;
    }

    var img = h('img', { class: 'mp-qr__img', alt: '二维码' });
    var tip = h('div', { class: 'mp-qr__tip', text: '正在获取二维码…' });
    var mask = h('div', { class: 'mp-modal' });
    var closeBtn = h('button', { class: 'mp-icon-btn', type: 'button', 'aria-label': '关闭' },
      [h('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })]);

    var timer = null;

    function close() {
      if (timer) clearInterval(timer);
      timer = null;
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }

    closeBtn.addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });

    mask.appendChild(h('div', { class: 'mp-modal__panel mp-qr' }, [
      h('div', { class: 'mp-modal__head' }, [
        h('div', { class: 'mp-modal__title', text: '扫码登录网易云' }),
        closeBtn
      ]),
      img,
      tip
    ]));
    document.body.appendChild(mask);

    (async function () {
      try {
        var key = await qrKey(settings);
        var qr = await qrCreate(settings, key);
        if (qr.qrimg) img.src = qr.qrimg;
        else if (qr.qrurl) img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(qr.qrurl);
        tip.textContent = '用网易云音乐 App 扫一扫';

        timer = setInterval(async function () {
          try {
            var res = await qrCheck(settings, key);
            if (res.code === 803) {
              close();
              var profile = null;
              try {
                profile = await neteaseAccount(Object.assign({}, settings, { neteaseCookie: res.cookie }));
              } catch (err) { /* 昵称拿不到不影响登录 */ }
              ctx.updateSettings({
                neteaseCookie: res.cookie,
                neteaseProfile: profile && profile.nickname ? profile.nickname : '已登录'
              });
              ctx.toast('网易云登录成功');
            } else if (res.code === 800) {
              tip.textContent = '二维码已过期，请重新打开';
              if (timer) clearInterval(timer);
              timer = null;
            } else if (res.code === 802) {
              tip.textContent = '已扫码，请在手机上确认';
            }
          } catch (err) {
            tip.textContent = '查询失败：' + (err && err.message ? err.message : '网络错误');
          }
        }, 2500);
      } catch (err) {
        tip.textContent = '获取二维码失败：' + (err && err.message ? err.message : '检查 API 地址');
      }
    })();
  }

  function runSelfTest() {
    ctx.openSheet({
      title: '音源自检',
      items: [{ label: '正在检查…', icon: 'music', hint: '' }]
    });
    ctx.sources.selfTest(state.settings).then(function (results) {
      ctx.openSheet({
        title: '音源自检结果',
        items: results.map(function (r) {
          return {
            label: r.name + ' · ' + (r.ok ? '正常' : '失败'),
            icon: r.ok ? 'check' : 'close',
            hint: r.ok ? r.ms + 'ms' : r.detail.slice(0, 40)
          };
        }).concat([{
          label: '关闭',
          icon: 'close',
          onClick: function () { /* 关掉即可 */ }
        }])
      });
    }).catch(function (err) {
      ctx.toast('自检失败：' + (err && err.message));
    });
  }

  function render() {
    clear(body);
    var s = state.settings;

    /* ---------- 外观 ---------- */

    var themeRow = h('div', { class: 'mp-theme-row' });
    THEMES.forEach(function (t) {
      var btn = h('button', {
        class: 'mp-theme-btn' + (s.theme === t.id ? ' is-active' : ''),
        type: 'button',
        text: t.name
      });
      btn.addEventListener('click', function () { ctx.updateSettings({ theme: t.id }); });
      themeRow.appendChild(btn);
    });

    var dotRow = h('div', { class: 'mp-dots' });
    ACCENTS.forEach(function (a) {
      var dot = h('button', {
        class: 'mp-dot' + (s.accent === a.id ? ' is-active' : ''),
        type: 'button',
        'aria-label': a.name,
        style: 'background:' + a.color
      });
      // 点预设色 = 清掉自选色，否则自选色会一直盖着
      dot.addEventListener('click', function () { ctx.updateSettings({ accent: a.id, accentColor: '' }); });
      dotRow.appendChild(dot);
    });

    var colorInput = h('input', {
      class: 'mp-color',
      type: 'color',
      value: /^#[0-9a-fA-F]{6}$/.test(s.accentColor || '') ? s.accentColor : '#e14b4b'
    });

    // 自定义色也是一个圆点，选中后要有高亮反馈
    var customDot = h('button', {
      class: 'mp-dot mp-dot--custom' + (s.accentColor ? ' is-active' : ''),
      type: 'button',
      'aria-label': '自定义颜色',
      style: 'background:' + (s.accentColor || '#e14b4b')
    });
    customDot.appendChild(colorInput);

    colorInput.addEventListener('input', function () {
      customDot.style.background = colorInput.value;
      ctx.updateSettings({ accent: 'custom', accentColor: colorInput.value });
    });

    var appearanceGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '外观' }),
      field('主题', themeRow, '跟随系统 / 白天白色 / 夜间深色'),
      // TA 页花瓣开关在 TA 页右上角 ⋯ 里，设置页不重复
      field('手写字体', (function () {
        var box = h('div', { class: 'mp-count' });
        var input = h('input', {
          class: 'mp-input mp-count__input',
          type: 'text',
          value: s.taFontUrl || '',
          placeholder: 'https://… .woff2（留空用系统楷体）'
        });
        input.addEventListener('change', function () {
          ctx.updateSettings({ taFontUrl: String(input.value || '').trim() });
        });
        var clear = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '清除' });
        clear.addEventListener('click', function () {
          input.value = '';
          ctx.updateSettings({ taFontUrl: '' });
        });
        box.appendChild(input);
        box.appendChild(clear);
        return box;
      })(), '字体文件建议 woff2 且 <1MB；超过 5MB 容易卡顿甚至闪退'),
      field('主色调', h('div', { class: 'mp-dots' }, [dotRow, customDot]),
        '点色块选预设，点最右边取色器可以完全自定义'),
      field('悬浮窗', switchEl(!!s.floating, function (v) { ctx.updateSettings({ floating: v }); }),
        s.floating
          ? '开：点右上角最小化会缩成悬浮球'
          : '关：点右上角直接退出 App，不显示悬浮球，音乐继续在后台播放'),

    ]);

    // 三种通道各有各的提示词：这里永远编辑「当前通道」那一份
    var mode = s.chatCommandMode || 'hybrid';
    var promptKey = mode === 'mark' ? 'chatPrompt' : (mode === 'tool' ? 'chatPromptTool' : 'chatPromptHybrid');
    var promptDefault = mode === 'mark' ? DEFAULT_CHAT_PROMPT : (mode === 'tool' ? TOOL_CHAT_PROMPT : HYBRID_CHAT_PROMPT);
    var promptValue = s[promptKey] || promptDefault;
    var modeName = mode === 'mark' ? '标记通道' : (mode === 'tool' ? '工具通道' : '混合通道');

    var editPromptBtn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '编辑' });
    editPromptBtn.addEventListener('click', function () {
      var patch = {};
      ctx.openEditor({
        title: modeName + '提示词',
        value: promptValue,
        defaultValue: promptDefault,
        placeholder: '可用占位符：{{title}} {{artist}} {{state}} {{queue}}',
        onSubmit: function (text) {
          var next = {};
          next[promptKey] = text;
          ctx.updateSettings(next);
        },
        onReset: function () {
          var next = {};
          next[promptKey] = promptDefault;
          ctx.updateSettings(next);
        }
      });
    });

    var chatGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '聊天' }),
      field('一起听（主聊天）', switchEl(!!s.chatListen, function (v) { ctx.updateSettings({ chatListen: v }); }),
        '开启后主聊天的模型能看到当前在听什么，并可直接点歌、切歌、暂停'),
      field('角色点歌加入队列', switchEl(!!s.chatAddToQueue, function (v) { ctx.updateSettings({ chatAddToQueue: v }); }),
        '开：只把搜到的第一首加进当前列表；关：直接用它替换列表'),
      fieldStack('指令通道', (function () {
        var row = h('div', { class: 'mp-theme-row' });
        [
          { id: 'hybrid', name: '混合（推荐）' },
          { id: 'mark', name: '标记（最省）' },
          { id: 'tool', name: '工具（最稳）' }
        ].forEach(function (item) {
          var btn = h('button', {
            class: 'mp-theme-btn' + ((s.chatCommandMode || 'hybrid') === item.id ? ' is-active' : ''),
            type: 'button',
            text: item.name
          });
          btn.addEventListener('click', function () { ctx.updateSettings({ chatCommandMode: item.id }); });
          row.appendChild(btn);
        });
        return row;
      })(), '混合：点歌走工具（有卡片），其余用注释指令；标记：全部注释；工具：全部 function calling'),
      // 推荐模式 / 推荐数量 / 只推荐能播放的：都在推荐页「偏好」面板里，设置页不再重复
      field('点卡片播放', switchEl(!!s.cardTapPlay, function (v) { ctx.updateSettings({ cardTapPlay: v }); }),
        s.cardTapPlay
          ? '开：每次点卡片都切回这张卡上的歌'
          : '关：发卡时已经播过，之后再点卡片只显示当前播放状态'),
      field('一起听提示词', editPromptBtn,
        '每轮注入给主聊天的说明；占位符 {{title}} {{artist}} {{state}} {{queue}} 会自动替换')
    ]);

    var sourceGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '音源' }),
      field('音源策略', (function () {
        var row = h('div', { class: 'mp-theme-row' });
        [{ id: 'single', name: '只用主源' }, { id: 'multi', name: '多源混合' }].forEach(function (item) {
          var btn = h('button', {
            class: 'mp-theme-btn' + ((s.sourceMode || 'single') === item.id ? ' is-active' : ''),
            type: 'button',
            text: item.name
          });
          btn.addEventListener('click', function () { ctx.updateSettings({ sourceMode: item.id }); });
          row.appendChild(btn);
        });
        return row;
      })()),
      field('主源', (function () {
        var row = h('div', { class: 'mp-theme-row' });
        [
          { id: 'tencent', name: 'QQ' },
          { id: 'netease', name: '网易云' },
          { id: 'itunes', name: 'iTunes' },
          { id: 'audius', name: 'Audius' }
        ].forEach(function (item) {
          var btn = h('button', {
            class: 'mp-theme-btn' + ((s.primarySource || 'tencent') === item.id ? ' is-active' : ''),
            type: 'button',
            text: item.name
          });
          btn.addEventListener('click', function () { ctx.updateSettings({ primarySource: item.id }); });
          row.appendChild(btn);
        });
        return row;
      })()),
      field('QQ 音乐', switchEl(s.sources.tencent, function (v) { setSource('tencent', v); }),
        '搜索并播放完整歌曲（经公开接口解析）'),
      field('iTunes', switchEl(s.sources.itunes, function (v) { setSource('itunes', v); }),
        '苹果官方接口，只有 30 秒试听'),
      field('免费曲库 Audius', switchEl(s.sources.audius, function (v) { setSource('audius', v); }),
        '无版权/CC 音乐，能完整播放；以欧美电音为主，中文歌很少'),
      field('网易云', switchEl(s.sources.netease, function (v) { setSource('netease', v); }),
        'QQ 放不了时自动找网易云同名歌曲兜底；开了上面的 API 地址还能搜整库')
    ]);

    var prefixInput = h('input', {
      class: 'mp-input',
      type: 'text',
      placeholder: '留空 = 直连',
      value: s.prefix
    });
    prefixInput.addEventListener('change', function () {
      ctx.updateSettings({ prefix: prefixInput.value.trim() });
    });

    var netGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '网络' }),
      field('代理前缀', prefixInput, ''),
      field('音源自检', (function () {
        var btn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '运行' });
        btn.addEventListener('click', runSelfTest);
        return btn;
      })(), '逐个真实请求，告诉你哪个源在这台设备上能用')
    ]);

    var apiInput = h('input', {
      class: 'mp-input',
      type: 'url',
      placeholder: 'https://你的服务地址',
      value: s.neteaseApi || ''
    });
    apiInput.addEventListener('change', function () {
      ctx.updateSettings({ neteaseApi: String(apiInput.value || '').trim() });
    });

    var loginBtn = h('button', {
      class: 'mp-btn mp-btn--ghost',
      type: 'button',
      text: s.neteaseCookie ? '重新登录' : '扫码登录'
    });
    loginBtn.addEventListener('click', openQrModal);

    var neteaseGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '网易云（可选）' }),
      field('API 地址', apiInput, '填你自己部署的 NeteaseCloudMusicApi 地址；留空就只用公开音源'),
      field('账号',
        h('div', { class: 'mp-field__value', text: s.neteaseCookie ? (s.neteaseProfile || '已登录') : '未登录' }),
        s.neteaseCookie ? '登录后可用自己账号的曲库/歌单' : '填好地址后扫码登录'),
      // 排行榜在搜索页底部直接铺开，设置页不再放入口
      field(s.neteaseCookie ? '重新登录' : '扫码登录',
        h('div', { class: 'mp-field__actions' }, [
          loginBtn,
          s.neteaseCookie
            ? (function () {
              var out = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '退出' });
              out.addEventListener('click', function () {
                ctx.updateSettings({ neteaseCookie: '', neteaseProfile: '' });
              });
              return out;
            })()
            : null
        ]),
        '二维码由你部署的服务生成')
    ]);

    var volume = h('input', {
      class: 'mp-slider',
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      value: String(Math.round(s.volume * 100))
    });
    volume.addEventListener('change', function () {
      ctx.setVolume(Number(volume.value) / 100);
    });

    var playGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '播放' }),
      field('播放引擎', h('div', { class: 'mp-field__value', text: ctx.engineLabel() }),
        ctx.isNative()
          ? '原生播放器；状态栏/锁屏的按钮由它负责'
          : '没接上原生播放器，状态栏控制不可用（需要新版宿主）'),
      field('极简模式', switchEl(!!s.nativeMinimal, function (v) { ctx.updateSettings({ nativeMinimal: v }); }),
        '默认开启：插件不轮询、不重建，只把队列交给原生播放器，状态栏控制才稳'),
      field('重建播放会话', (function () {
        var btn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '重建' });
        btn.addEventListener('click', function () { ctx.rebuildSession(); });
        return btn;
      })(), '控制栏按钮点了没反应时按一下：重开原生服务和通知，通常能救活'),
      field('彻底停止', (function () {
        var btn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '停止并清除通知' });
        btn.addEventListener('click', function () { ctx.hardStop(); });
        return btn;
      })(), '不想听的时候按这个：停止播放 + 清空队列 + 状态栏通知一起消失'),
      field(
        '音量',
        ctx.isNative() ? h('div', { class: 'mp-field__value', text: '跟随系统音量' }) : volume,
        ctx.isNative()
          ? '走宿主原生播放器，音量用手机音量键调'
          : '循环模式和随机播放在播放页右下角的按钮里调'
      )
    ]);

    var clearBtn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '清空数据' });
    clearBtn.addEventListener('click', function () { ctx.clearData(); });

    var exitBtn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '退出 App' });
    exitBtn.addEventListener('click', function () { ctx.exitApp(); });

    var dataGroup = h('div', { class: 'mp-group' }, [
      h('div', { class: 'mp-group__title', text: '数据' }),
      field('收藏', h('div', { class: 'mp-field__value', text: state.favorites.length + ' 首' })),
      field('歌单', h('div', { class: 'mp-field__value', text: state.playlists.length + ' 个' })),
      field('搜索历史', h('div', { class: 'mp-field__value', text: state.searches.length + ' 条' })),
      field('退出 App', exitBtn, '回到 Roche，音乐会继续放在后台播放'),
      field('卸载插件会一起清空', clearBtn, '插件数据存在宿主 storage 里，卸载即删除')
    ]);

    var about = h('div', { class: 'mp-about' }, [
      h('div', { text: '音乐播放器 v' + state.version }),
      h('div', { text: '音源来自公开接口，仅供个人学习使用' }),
      h('div', { text: '歌曲版权归各平台与版权方所有' })
    ]);

    body.appendChild(appearanceGroup);
    body.appendChild(chatGroup);
    body.appendChild(sourceGroup);
    body.appendChild(neteaseGroup);
    body.appendChild(netGroup);
    body.appendChild(playGroup);
    body.appendChild(dataGroup);
    body.appendChild(about);
  }

  var view = h('div', { class: 'mp-view' }, [header, body]);
  host.appendChild(view);
  render();

  return {
    refresh: function () {
      var active = document.activeElement;
      if (active && active.tagName === 'INPUT' && view.contains(active)) return;
      // 重渲染会丢滚动位置（表现为「一开开关就跳回顶部」），这里还原
      var scrollTop = body.scrollTop;
      render();
      body.scrollTop = scrollTop;
    },
    destroy: function () {
      if (statsTimer) clearInterval(statsTimer);
      statsTimer = null;
    }
  };
}
