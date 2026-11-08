/**
 * 音源体检：逐个请求候选接口，报告 HTTP 状态、CORS 头、耗时、返回结构。
 *   node dev/probe-sources.mjs
 * 公开接口随时会挂，换源前先跑一遍这个。
 */

const KEYWORD = '晴天';
const kw = encodeURIComponent(KEYWORD);
const ORIGIN = 'https://example.com';

const CANDIDATES = [
  {
    id: 'gd-netease',
    note: 'GD 音乐台（当前版本在用）',
    url: `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${kw}&count=2&pages=1`
  },
  {
    id: 'vkeys-netease',
    note: 'vkeys 网易云',
    url: `https://api.vkeys.cn/v2/music/netease?word=${kw}&page=1&num=2`
  },
  {
    id: 'vkeys-tencent',
    note: 'vkeys QQ 音乐',
    url: `https://api.vkeys.cn/v2/music/tencent?word=${kw}&page=1&num=2`
  },
  {
    id: 'vkeys-kugou',
    note: 'vkeys 酷狗',
    url: `https://api.vkeys.cn/v2/music/kugou?word=${kw}&page=1&num=2`
  },
  {
    id: 'vkeys-kuwo',
    note: 'vkeys 酷我',
    url: `https://api.vkeys.cn/v2/music/kuwo?word=${kw}&page=1&num=2`
  },
  {
    id: 'qijieya-netease',
    note: '七姐呀 Meting · 网易云',
    url: `https://api.qijieya.cn/meting/?type=search&id=${kw}&server=netease`
  },
  {
    id: 'qijieya-kugou',
    note: '七姐呀 Meting · 酷狗',
    url: `https://api.qijieya.cn/meting/?type=search&id=${kw}&server=kugou`
  },
  {
    id: 'injahow-meting',
    note: 'injahow Meting',
    url: `https://api.injahow.cn/meting/?type=search&id=${kw}`
  },
  {
    id: 'kugou-mobile',
    note: '酷狗移动端搜索',
    url: `https://mobilecdn.kugou.com/api/v3/search/song?keyword=${kw}&page=1&pagesize=2`
  },
  {
    id: 'kuwo-r.s',
    note: '酷我旧版搜索',
    url: `https://search.kuwo.cn/r.s?all=${kw}&ft=music&itemset=web_2013&client=kt&pn=0&rn=2&rformat=json&encoding=utf8`
  },
  {
    id: 'migu-search',
    note: '咪咕搜索',
    url: `https://music.migu.cn/v3/api/music/search?keyword=${kw}&pageSize=2`
  },
  {
    id: 'audius-hosts',
    note: 'Audius 节点列表（免费全曲，欧美为主）',
    url: 'https://api.audius.co'
  },
  {
    id: 'jamendo',
    note: 'Jamendo（CC 授权免费曲库）',
    url: `https://api.jamendo.com/v3.0/tracks/?client_id=56d30c95&format=json&limit=2&search=${kw}`
  },
  {
    id: 'itunes',
    note: 'iTunes（官方，30 秒试听）',
    url: `https://itunes.apple.com/search?term=${kw}&entity=song&limit=2&country=cn`
  },
  {
    id: 'netease-outer',
    note: '网易云外链音频（只测能否 302 到 mp3）',
    url: 'https://music.163.com/song/media/outer/url?id=186016.mp3'
  }
];

function shape(data) {
  if (Array.isArray(data)) return 'array(' + data.length + ') 首项字段: ' + (data[0] ? Object.keys(data[0]).slice(0, 10).join(',') : '空');
  if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    const inner = data.data || data.songs || data.result || data.results || data.list || data.hosts;
    if (inner) return '对象{' + keys.slice(0, 6).join(',') + '} 内含 ' + (Array.isArray(inner) ? 'array(' + inner.length + ')' : typeof inner);
    return '对象{' + keys.slice(0, 8).join(',') + '}';
  }
  return String(data).slice(0, 60);
}

async function probe(item) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(item.url, {
      headers: { Origin: ORIGIN, 'User-Agent': 'Mozilla/5.0 MusicPlayerProbe' },
      redirect: 'manual',
      signal: controller.signal
    });
    const ms = Date.now() - started;
    const acao = res.headers.get('access-control-allow-origin') || '(无 CORS 头)';
    const type = res.headers.get('content-type') || '';
    let body = '';
    try { body = await res.text(); } catch (e) { body = ''; }

    let detail = '';
    if (res.status >= 300 && res.status < 400) {
      detail = '重定向 → ' + (res.headers.get('location') || '').slice(0, 90);
    } else {
      try {
        const data = JSON.parse(body);
        detail = shape(data);
      } catch (err) {
        detail = '非 JSON: ' + body.replace(/\s+/g, ' ').slice(0, 80);
      }
    }

    const ok = res.status === 200 && acao !== '(无 CORS 头)';
    return { id: item.id, note: item.note, ok, status: res.status, ms, acao, type, detail };
  } catch (err) {
    return {
      id: item.id,
      note: item.note,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      acao: '-',
      type: '-',
      detail: '请求失败: ' + err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const item of CANDIDATES) {
  const r = await probe(item);
  results.push(r);
  const flag = r.ok ? '✅' : '❌';
  console.log(`${flag} ${r.id.padEnd(16)} ${String(r.status).padEnd(4)} ${String(r.ms + 'ms').padEnd(7)} CORS=${r.acao}`);
  console.log(`   ${r.note}`);
  console.log(`   ${r.detail}`);
}

console.log('\n可用（200 + 有 CORS 头）：');
const usable = results.filter((r) => r.ok).map((r) => r.id);
console.log(usable.length ? usable.join(', ') : '（无）');
