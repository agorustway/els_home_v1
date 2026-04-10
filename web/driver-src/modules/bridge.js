/**
 * bridge.js — Capacitor 플러그인 브릿지, smartFetch, remoteLog
 */
import { Store, BASE_URL } from './store.js?v=4912';

// ─── remoteLog ────────────────────────────────────────────────────
export async function remoteLog(msg, tag = 'JS') {
  if (!msg) return;
  try {
    // [TDD] 로컬 로그 캡핑 (브라우저 메모리 폭주 방지)
    const logHistory = Store.get('logHistory') || [];
    if (logHistory.length > 50) logHistory.shift();

    // KST 시간 포맷 (ISO 8601 + 9시간)
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

// ─── Capacitor 플러그인 헬퍼 ─────────────────────────────────────
export function getPlugin(name) {
  try {
    const plugins = window.Capacitor?.Plugins;
    if (!plugins) {
      console.warn('Capacitor.Plugins not available yet.');
      return null;
    }

    // 1. 이미 등록된 플러그인 확인
    let found = plugins[name]
      || plugins[name.toLowerCase()]
      || plugins[name.toUpperCase()]
      || plugins[name + 'Plugin'];

    // 2. Capacitor 4+ 방식: 명시적 등록 시도 (네이티브 브릿지 강제 연결)
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

// ─── 플러그인 접근자 ─────────────────────────────────────────────
export const Overlay   = () => getPlugin('Overlay');
export const Emergency = () => getPlugin('Emergency');
export const CapHttp   = () => getPlugin('CapacitorHttp');

// ─── smartFetch ───────────────────────────────────────────────────
// Capacitor 네이티브 환경에서는 CapacitorHttp를 우선 사용 (CORS 우회)
export async function smartFetch(url, options = {}) {
  const http = CapHttp();
  const isNative = window.Capacitor?.isNativePlatform();

  if (http && isNative) {
    try {
      // 이미지 등 바이너리 데이터 요청 판별 (호환성을 위해 dataType도 체크)
      const resType = options.responseType || options.dataType;
      const isBinary = resType === 'blob' || resType === 'arraybuffer';
      
      const res = await http.request({
        url,
        method: options.method || 'GET',
        headers: { 
          'Content-Type': 'application/json', 
          ...(options.headers || {}) 
        },
        // CapacitorHttp는 dataType이 아닌 responseType을 사용합니다.
        responseType: isBinary ? 'blob' : (resType || 'json'),
        data: options.body
          ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
          : undefined,
      });

      return {
        ok:     res.status < 400,
        status: res.status,
        json:   async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
        // 바이너리 데이터 지원을 위해 blob() 추가
        blob:   async () => {
          if (isBinary && typeof res.data === 'string') {
            // CapacitorHttp는 responseType: 'blob'일 때 base64 인코딩된 문자열을 반환합니다.
            const byteCharacters = atob(res.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            // 헤더 키의 대소문자 차이 방어를 위해 무시 검색
            const headers = res.headers || {};
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

  // 브라우저 런타임 fallback
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
