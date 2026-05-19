/**
 * ELS Driver App — 모듈 엔트리 포인트
 * ES Modules 방식으로 각 기능 모듈을 import하여 window.App 조립
 */
import { AppConfig } from './modules/store.js?v=5162';
import { remoteLog } from './modules/bridge.js?v=5162';
import { showToast, formatDate, escHtml, loadSafeImage } from './modules/utils.js?v=5162';
import { showScreen } from './modules/nav.js?v=5162';
import { smartFetch } from './modules/bridge.js?v=5162';

// 권한
import {
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,
} from './modules/permissions.js?v=5162';

// 프로필
import {
  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
  onCargoTypeChange, updateCargoProfileUI, checkProfileForm,
} from './modules/profile.js?v=5162';

// 운행 + 오버레이
import {
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist, checkChecklistValid,
  startOverlayService, updateOverlayStatus, stopOverlayService, updateTripCargoUI,
} from './modules/trip.js?v=5162';

// GPS
import {
  startGPS, stopGPS, onGpsUpdate, updateTripStatusLine,
  startRealtimeMode, stopRealtimeMode,
  gpsWatchId, lastGpsTimestamp,
} from './modules/gps.js?v=5162';

// 공지
import { loadNotices, filterNotice, openNotice, closeNoticeDetail, completeSafetyEducation, confirmEducationRead } from './modules/notice.js?v=5162';

// 사진
import {
  addPhoto, onFileSelected, renderPhotoThumbs, uploadPendingPhotos,
  openPhotoViewer, openLogPhoto, closePhotoViewer, prevPhoto, nextPhoto,
  deleteCurrentPhoto, initPinchZoom,
} from './modules/photos.js?v=5162';

// 일지
import {
  loadLogs, openLog, onLogFieldChange, saveLogEdit, deleteLog,
  forceCompleteLog, closeLogDetail, addLogPhoto, onLogFileSelected,
} from './modules/log.js?v=5162';

// 긴급알림
import { startEmergencyPoll, pollEmergency, closeEmergency } from './modules/emergency.js?v=5162';

// 업데이트
import { checkUpdate } from './modules/update.js?v=5162';

// 지도
import {
  openMap, closeMap, refreshMapData, centerMyLocation,
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute, showAllMapVehicles, focusVehicleOnMap
} from './modules/map.js?v=5162';

// 초기화
import { init, showMain, openSettings, switchTab, exitApp } from './modules/init.js?v=5162';

// ─── window.App 조립 ─────────────────────────────────────────────
// index.html의 모든 onclick="App.xxx()" 호출의 단일 진입점
window.App = {
  // 버전 (네이티브 접근용)
  get _version()    { return AppConfig.APP_VERSION; },
  get _buildCode()  { return AppConfig.BUILD_CODE; },

  // GPS 상태 노출 (init.js의 appStateChange 핸들러용)
  get _lastGpsTs()  { return lastGpsTimestamp; },
  get _gpsWatchId() { return gpsWatchId; },

  // 유틸
  showToast, formatDate, escHtml, remoteLog,
  loadSafeImage: (imgEl, url) => loadSafeImage(imgEl, url, smartFetch),

  // 네비
  showScreen, showMain, openSettings, switchTab,

  // 권한
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,

  // 프로필
  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
  onCargoTypeChange, updateCargoProfileUI, checkProfileForm,

  // 운행
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist, checkChecklistValid, updateTripCargoUI,

  // GPS / 실시간
  startRealtimeMode, stopRealtimeMode, updateTripStatusLine,
  pollEmergency,

  // 공지
  filterNotice, openNotice, closeNoticeDetail, completeSafetyEducation, confirmEducationRead,

  // 사진
  addPhoto, onFileSelected, renderPhotoThumbs, uploadPendingPhotos,
  openPhotoViewer, openLogPhoto, closePhotoViewer,
  prevPhoto, nextPhoto, deleteCurrentPhoto,

  // 일지
  loadLogs, openLog, onLogFieldChange, saveLogEdit, deleteLog,
  forceCompleteLog, closeLogDetail, addLogPhoto, onLogFileSelected,

  // 긴급알림
  closeEmergency,

  // 업데이트
  checkUpdate,

  // 지도
  openMap, closeMap, refreshMapData, centerMyLocation,
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute, showAllMapVehicles, focusVehicleOnMap,

  // 앱 종료
  exitApp,

  // 네이티브 뒤로가기 (네이티브 브릿지용)
  handleBackButton: () => window.handleBackButton?.() ?? false,
};

// ─── 앱 시작 ─────────────────────────────────────────────────────
function initAppWithSplash() {
  init();
  initPinchZoom();
  // Splash hide after 1.5s
  setTimeout(() => {
    const splash = document.getElementById('web-splash');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 300);
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppWithSplash);
} else {
  initAppWithSplash();
}
