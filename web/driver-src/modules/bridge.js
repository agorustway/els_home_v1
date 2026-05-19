/**
 * bridge.js — Capacitor 플러그인 브릿지, smartFetch, remoteLog
 */
import { Store, BASE_URL } from './store.js?v=5162';

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
      const resType = options.responseType || options.dataType;
      const isBinary = resType === 'blob' || resType === 'arraybuffer';
      
      const res = await http.request({
        url: url,
        method: options.method || 'GET',
        headers: { 
          'Content-Type': 'application/json',
          ...(options.headers || {}) 
        },
        data: options.body 
          ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
          : undefined,
        responseType: isBinary ? 'blob' : 'text'
      });

      console.log(`[smartFetch] Native ${options.method || 'GET'} ${url} -> ${res.status}`);
      
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        headers: res.headers,
        // json() 호출 시 res.data가 객체면 그대로, 문자열이면 파싱, 실패 시 원문 반환
        json: async () => {
          if (typeof res.data === 'object' && res.data !== null) return res.data;
          try {
            return JSON.parse(res.data);
          } catch (e) {
            console.error('[smartFetch] JSON Parse Failed. Raw Data:', res.data);
            if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
              throw new Error(`서버가 JSON 대신 HTML을 반환했습니다. (Status: ${res.status})`);
            }
            return res.data;
          }
        },
        blob: async () => {
          if (isBinary && typeof res.data === 'string') {
            const byteCharacters = atob(res.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const headers = res.headers || {};
            const contentTypeKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
            const contentType = contentTypeKey ? headers[contentTypeKey] : 'image/jpeg';
            return new Blob([byteArray], { type: contentType });
          }
          return res.data;
        },
      };
    } catch (err) {
      console.error('[smartFetch] Native Request Error:', err);
      throw err;
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
    headers: response.headers,
    json: () => response.json(),
    blob: () => response.blob(),
  };
}
