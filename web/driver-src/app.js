/**
 * ELS Driver App ??紐⑤뱢 ?뷀듃由??ъ씤?? * ES Modules 諛⑹떇?쇰줈 媛?湲곕뒫 紐⑤뱢??import?섏뿬 window.App 議곕┰
 */
import { AppConfig } from './modules/store.js?v=486';
import { remoteLog } from './modules/bridge.js?v=486';
import { showToast, formatDate, escHtml } from './modules/utils.js?v=486';
import { showScreen } from './modules/nav.js?v=486';

// 沅뚰븳
import {
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,
} from './modules/permissions.js?v=486';

// ?꾨줈??import {
  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
} from './modules/profile.js?v=486';

// ?댄뻾 + ?ㅻ쾭?덉씠
import {
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist,
  startOverlayService, updateOverlayStatus, stopOverlayService,
} from './modules/trip.js?v=486';

// GPS
import {
  startGPS, stopGPS, onGpsUpdate, updateTripStatusLine,
  startRealtimeMode, stopRealtimeMode,
  gpsWatchId, lastGpsTimestamp,
} from './modules/gps.js?v=486';

// 怨듭?
import { loadNotices, filterNotice, openNotice, closeNoticeDetail } from './modules/notice.js?v=486';

// ?ъ쭊
import {
  addPhoto, onFileSelected, renderPhotoThumbs, uploadPendingPhotos,
  openPhotoViewer, openLogPhoto, closePhotoViewer, prevPhoto, nextPhoto,
  deleteCurrentPhoto, initPinchZoom,
} from './modules/photos.js?v=486';

// ?쇱?
import {
  loadLogs, openLog, onLogFieldChange, saveLogEdit, deleteLog,
  forceCompleteLog, closeLogDetail, addLogPhoto, onLogFileSelected,
} from './modules/log.js?v=486';

// 湲닿툒?뚮┝
import { startEmergencyPoll, pollEmergency, closeEmergency } from './modules/emergency.js?v=486';

// ?낅뜲?댄듃
import { checkUpdate } from './modules/update.js?v=486';

// 吏??import {
  openMap, closeMap, refreshMapData, centerMyLocation,
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute,
} from './modules/map.js?v=486';

// 珥덇린??import { init, showMain, openSettings, switchTab, exitApp } from './modules/init.js?v=486';

// ??? window.App 議곕┰ ?????????????????????????????????????????????
// index.html??紐⑤뱺 onclick="App.xxx()" ?몄텧???⑥씪 吏꾩엯??window.App = {
  // 踰꾩쟾 (?ㅼ씠?곕툕 ?묎렐??
  get _version()    { return AppConfig.APP_VERSION; },
  get _buildCode()  { return AppConfig.BUILD_CODE; },

  // GPS ?곹깭 ?몄텧 (init.js??appStateChange ?몃뱾?ъ슜)
  get _lastGpsTs()  { return lastGpsTimestamp; },
  get _gpsWatchId() { return gpsWatchId; },

  // ?좏떥
  showToast, formatDate, escHtml, remoteLog,

  // ?ㅻ퉬
  showScreen, showMain, openSettings, switchTab,

  // 沅뚰븳
  requestPerm, requestAllPerms, updatePermStatuses, manualRefreshPerms,
  finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
  showTerms, closeTerms,

  // ?꾨줈??  saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,

  // ?댄뻾
  onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
  openChecklist, closeChecklist, saveChecklist,

  // GPS / ?ㅼ떆媛?  startRealtimeMode, stopRealtimeMode, updateTripStatusLine,
  pollEmergency,

  // 怨듭?
  filterNotice, openNotice, closeNoticeDetail,

  // ?ъ쭊
  addPhoto, onFileSelected, renderPhotoThumbs, uploadPendingPhotos,
  openPhotoViewer, openLogPhoto, closePhotoViewer,
  prevPhoto, nextPhoto, deleteCurrentPhoto,

  // ?쇱?
  loadLogs, openLog, onLogFieldChange, saveLogEdit, deleteLog,
  forceCompleteLog, closeLogDetail, addLogPhoto, onLogFileSelected,

  // 湲닿툒?뚮┝
  closeEmergency,

  // ?낅뜲?댄듃
  checkUpdate,

  // 吏??  openMap, closeMap, refreshMapData, centerMyLocation,
  toggleMapPanel, toggleMapTripList, showTripRouteOnMap, clearMapRoute,

  // ??醫낅즺
  exitApp,

  // ?ㅻ줈媛湲?(?ㅼ씠?곕툕 釉뚮┸吏??
  handleBackButton: () => window.handleBackButton?.() ?? false,
};

// ??? ???쒖옉 ?????????????????????????????????????????????????????
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); initPinchZoom(); });
} else {
  init();
  initPinchZoom();
}
