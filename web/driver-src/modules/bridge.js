/**
 * bridge.js ??Capacitor ?뚮윭洹몄씤 釉뚮┸吏, smartFetch, remoteLog
 */
import { Store, BASE_URL } from './store.js?v=4919';

// ??? remoteLog ????????????????????????????????????????????????????
export async function remoteLog(msg, tag = 'JS') {
  if (!msg) return;
  try {
    // [TDD] 濡쒖뺄 濡쒓렇 罹≫븨 (釉뚮씪?곗? 硫붾え由???＜ 諛⑹?)
    const logHistory = Store.get('logHistory') || [];
    if (logHistory.length > 50) logHistory.shift();

    // KST ?쒓컙 ?щ㎎ (ISO 8601 + 9?쒓컙)
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000))
      .toISOString().replace('Z', '+09:00');

    logHistory.push(`[${kst}] [${tag}] ${msg}`);
    Store.set('logHistory', logHistory);

    fetch(BASE_URL + '/api/debug/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg, device: 'Mobile', tag }),
    }).catch(() => { });
  } catch { }
}

// ??? Capacitor ?뚮윭洹몄씤 ?ы띁 ?????????????????????????????????????
export function getPlugin(name) {
  try {
    const plugins = window.Capacitor?.Plugins;
    if (!plugins) {
      console.warn('Capacitor.Plugins not available yet.');
      return null;
    }

    // 1. ?대? ?깅줉???뚮윭洹몄씤 ?뺤씤
    let found = plugins[name]
      || plugins[name.toLowerCase()]
      || plugins[name.toUpperCase()]
      || plugins[name + 'Plugin'];

    // 2. Capacitor 4+ 諛⑹떇: 紐낆떆???깅줉 ?쒕룄 (?ㅼ씠?곕툕 釉뚮┸吏 媛뺤젣 ?곌껐)
    if (!found && window.Capacitor?.registerPlugin) {
      try {
        found = window.Capacitor.registerPlugin(name);
        console.log(`Plugin ${name} registered manually via registerPlugin()`);
      } catch (e) {
        console.warn(`Manual registration for ${name} failed`, e);
      }
    }

    if (!found) {
      console.group('Plugin Search Failed: ' + name);
      console.log('Available Plugins:', Object.keys(plugins).join(', '));
      console.groupEnd();
      remoteLog(
        `Plugin Search Failed: ${name} (Available: ${Object.keys(plugins).join(', ')})`,
        'JS_BRIDGE_ERR'
      );
    }
    return found || null;
  } catch { return null; }
}

// ??? ?뚮윭洹몄씤 ?묎렐???????????????????????????????????????????????
export const Overlay   = () => getPlugin('Overlay');
export const Emergency = () => getPlugin('Emergency');
export const CapHttp   = () => getPlugin('CapacitorHttp');

// ??? smartFetch ???????????????????????????????????????????????????
// Capacitor ?ㅼ씠?곕툕 ?섍꼍?먯꽌??CapacitorHttp瑜??곗꽑 ?ъ슜 (CORS ?고쉶)
export async function smartFetch(url, options = {}) {
  const http = CapHttp();
  const isNative = window.Capacitor?.isNativePlatform();

  if (http && isNative) {
    try {
      // ?대?吏 ??諛붿씠?덈━ ?곗씠???붿껌 ?먮퀎 (?명솚?깆쓣 ?꾪빐 dataType??泥댄겕)
      const resType = options.responseType || options.dataType;
      const isBinary = resType === 'blob' || resType === 'arraybuffer';
      
      const res = await http.request({
        url,
        method: options.method || 'GET',
        headers: { 
          'Content-Type': 'application/json', 
          ...(options.headers || {}) 
        },
        // CapacitorHttp??dataType???꾨땶 responseType???ъ슜?⑸땲??
        responseType: isBinary ? 'blob' : (resType || 'json'),
        data: options.body
          ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
          : undefined,
      });

      return {
        ok:     res.status < 400,
        status: res.status,
        json:   async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
        // 諛붿씠?덈━ ?곗씠??吏?먯쓣 ?꾪빐 blob() 異붽?
        blob:   async () => {
          if (isBinary && typeof res.data === 'string') {
            // CapacitorHttp??responseType: 'blob'????base64 ?몄퐫?⑸맂 臾몄옄?댁쓣 諛섑솚?⑸땲??
            const byteCharacters = atob(res.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            // ?ㅻ뜑 ?ㅼ쓽 ??뚮Ц??李⑥씠 諛⑹뼱瑜??꾪빐 臾댁떆 寃??            const headers = res.headers || {};
            const contentTypeKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
            const contentType = contentTypeKey ? headers[contentTypeKey] : 'image/jpeg';
            return new Blob([byteArray], { type: contentType });
          }
          throw new Error('Fallback to standard fetch for non-native blob');
        }
      };
    } catch (e) {
      console.error('smartFetch CapHttp error', e);
    }
  }

  // 釉뚮씪?곗? ?고???fallback
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
    blob: () => response.blob(),
  };
}

