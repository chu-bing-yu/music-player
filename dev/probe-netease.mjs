/** 探测部署好的网易云 API 服务：可用性 / CORS / 扫码登录 / 搜索 / 播放地址 */
const BASE = 'https://api-enhanced-steel-mu.vercel.app';

async function probe(label, path) {
  const url = BASE + path;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { Origin: 'https://example.com', 'User-Agent': 'Mozilla/5.0' } });
    const acao = res.headers.get('access-control-allow-origin') || '-';
    const acc = res.headers.get('access-control-allow-credentials') || '-';
    const text = await res.text();
    let brief = text.replace(/\s+/g, ' ').slice(0, 220);
    try {
      const json = JSON.parse(text);
      const inner = json.data || json.result || json;
      brief = JSON.stringify(inner).slice(0, 220);
    } catch (e) { /* 原文 */ }
    console.log(`${res.status} CORS=${acao} cred=${acc} ${label} (${Date.now() - started}ms)`);
    console.log('   ' + brief + '\n');
    return text;
  } catch (err) {
    console.log(`✗ ${label} 失败: ${err.message}\n`);
    return '';
  }
}

const keyRaw = await probe('qr key', '/login/qr/key?timestamp=' + Date.now());
let unikey = '';
try { unikey = JSON.parse(keyRaw).data.unikey; } catch (e) {}
if (unikey) {
  await probe('qr create', '/login/qr/create?key=' + unikey + '&qrimg=true');
  await probe('qr check', '/login/qr/check?key=' + unikey + '&timestamp=' + Date.now());
}

await probe('search', '/search?keywords=' + encodeURIComponent('晴天') + '&type=1&limit=2');
await probe('song url', '/song/url/v1?id=186016&level=standard');
await probe('lyric', '/lyric?id=186016');
await probe('login status', '/login/status?timestamp=' + Date.now());
