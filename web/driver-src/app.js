/**
 * ELS Driver App — 모듈 엔트리 포인트
 * ES Modules 방식으로 각 기능 모듈을 import하여 window.App 조립
 */
import { AppConfig } from './modules/store.js?v=490';
import { remoteLog } from './modules/bridge.js?v=490';
import { showToast, formatDate, escHtml } from './modules/utils.js?v=490';
import { showScreen } from './modules/nav.js?v=490';

// 권한
import {
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,
} from './modules/permissions.js?v=490';

// 프로필
import {
  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
} from './modules/profile.js?v=490';

// 운행 + 오버레이
import {
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist,
  startOverlayService, updateOverlayStatus, stopOverlayService,
} from './modules/trip.js?v=490';

// GPS
import {
  startGPS, stopGPS, onGpsUpdate, updateTripStatusLine,
  startRealtimeMode, stopRealtimeMode,
  gpsWatchId, lastGpsTimestamp,
} from './modules/gps.js?v=490';

// 공지
import { loadNotices, filterNotice, openNotice, closeNoticeDetail } from './modules/notice.js?v=490';

// 사진
import {
  addPhoto, onFileSelected, renderPhotoThumbs, uploadPendingPhotos,
  openPhotoViewer, openLogPhoto, closePhotoViewer, prevPhoto, nextPhoto,
  deleteCurrentPhoto, initPinchZoom,
} from './modules/photos.js?v=490';

// 일지
import {
  loadLogs, openLog, onLogFieldChange, saveLogEdit, deleteLog,
  forceCompleteLog, closeLogDetail, addLogPhoto, onLogFileSelected,
} from './modules/log.js?v=490';

// 긴급알림
import { startEmergencyPoll, pollEmergency, closeEmergency } from './modules/emergency.js?v=490';

// 업데이트
import { checkUpdate } from './modules/update.js?v=490';

// 지도
import {
  openMap, closeMap, refreshMapData, centerMyLocation,
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute,
} from './modules/map.js?v=490';

// 초기화
import { init, showMain, openSettings, switchTab, exitApp } from './modules/init.js?v=490';

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

  // 네비
  showScreen, showMain, openSettings, switchTab,

  // 권한
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,

  // 프로필
  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,

  // 운행
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist,

  // GPS / 실시간
  startRealtimeMode, stopRealtimeMode, updateTripStatusLine,
  pollEmergency,

  // 공지
  filterNotice, openNotice, closeNoticeDetail,

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
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute,

  // 앱 종료
  exitApp,

  // 네이티브 뒤로가기 (네이티브 브릿지용)
  handleBackButton: () => window.handleBackButton?.() ?? false,
};

// ─── 앱 시작 ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); initPinchZoom(); });
} else {
  init();
  initPinchZoom();
}
