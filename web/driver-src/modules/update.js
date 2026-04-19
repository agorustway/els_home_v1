/**
 * update.js ?????낅뜲?댄듃 ?뺤씤
 */
import { State, AppConfig, VERSION_URL } from './store.js?v=4919';
import { smartFetch } from './bridge.js?v=4919';
import { showToast } from './utils.js?v=4919';

export async function checkUpdate(auto = false) {
  try {
    const res = await smartFetch(VERSION_URL + '?t=' + Date.now()).catch(() => null);
    if (!res) return;
    const data = await res.json().catch(() => ({}));

    const remoteVersion = (data.latestVersion || '').trim();
    const localVersion  = AppConfig.APP_VERSION.trim();
    const hasUpdate     = data.versionCode > AppConfig.BUILD_CODE
      || (remoteVersion !== localVersion && remoteVersion !== '' && !localVersion.includes(remoteVersion));

    if (!hasUpdate) {
      if (!auto) showToast('?대? 理쒖떊 踰꾩쟾?낅땲??(' + AppConfig.APP_VERSION + ')');
      return;
    }

    // ?댄뻾 以묒씠硫??좎삁 泥섎━
    const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
    if (auto && isActive) {
      State.pendingUpdate = true;
      console.log('?낅뜲?댄듃 ?좎삁: ?댄뻾 以??앹뾽 李⑤떒. ?댄뻾 醫낅즺 ???뚮┝ ?덉젙.');
      return;
    }

    const msg = `?덈줈??踰꾩쟾(${data.latestVersion})??異쒖떆?섏뿀?듬땲??\n\n[蹂寃쎈궡??\n${data.changeLog}\n\n吏湲??ㅼ튂?섏떆寃좎뒿?덇퉴? (誘몄꽕移????쇰? 湲곕뒫???쒗븳?????덉뒿?덈떎.)`;
    if (confirm(msg)) {
      if (window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: data.downloadUrl });
      } else {
        window.open(data.downloadUrl, '_blank');
      }
    } else if (auto) {
      showToast('?먰솢???섍꼍???꾪빐 理쒖떊 踰꾩쟾?쇰줈 ?낅뜲?댄듃 ??二쇱꽭??', 5000);
    }
  } catch (e) {
    if (!auto) console.error('?낅뜲?댄듃 ?뺤씤 ?ㅽ뙣', e);
  }
}

