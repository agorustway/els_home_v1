/**
 * bridge.js — Capacitor 플러그인 브릿지, smartFetch, remoteLog
 */
import { Store, BASE_URL } from './store.js?v=497';

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
  if (http && window.Capacitor?.isNativePlatform()) {
    try {
      const res = await http.request({
        url,
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        data: options.body
          ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
          : undefined,
      });
      return {
        ok:   res.status < 400,
        status: res.status,
        json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
      };
    } catch (e) {
      console.error('smartFetch CapHttp error', e);
    }
  }
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}
