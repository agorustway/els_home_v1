/**
 * update.js — 앱 업데이트 확인
 */
import { State, AppConfig, VERSION_URL } from './store.js?v=496';
import { smartFetch } from './bridge.js?v=496';
import { showToast } from './utils.js?v=496';

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
      if (!auto) showToast('이미 최신 버전입니다 (' + AppConfig.APP_VERSION + ')');
      return;
    }

    // 운행 중이면 유예 처리
    const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
    if (auto && isActive) {
      State.pendingUpdate = true;
      console.log('업데이트 유예: 운행 중 팝업 차단. 운행 종료 후 알림 예정.');
      return;
    }

    const msg = `새로운 버전(${data.latestVersion})이 출시되었습니다.\n\n[변경내용]\n${data.changeLog}\n\n지금 설치하시겠습니까? (미설치 시 일부 기능이 제한될 수 있습니다.)`;
    if (confirm(msg)) {
      if (window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: data.downloadUrl });
      } else {
        window.open(data.downloadUrl, '_blank');
      }
    } else if (auto) {
      showToast('원활한 환경을 위해 최신 버전으로 업데이트 해 주세요.', 5000);
    }
  } catch (e) {
    if (!auto) console.error('업데이트 확인 실패', e);
  }
}
