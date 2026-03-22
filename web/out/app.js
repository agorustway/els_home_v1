/* ELS 운송관리 v3.4.0 - GPS 관제 + 오버레이/PIP 이중 */
(() => {
  const getDynamicCapacitor = () => window.Capacitor || {};
  const getDynamicPlugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};

  const getOverlay = () => {
    const Cap = getDynamicCapacitor();
    const Plugins = getDynamicPlugins();
    if (Cap.registerPlugin) return Cap.registerPlugin('Overlay');
    if (Plugins.Overlay) return Plugins.Overlay;
    if (Cap.toNative) {
      return {
        checkPermission: () => new Promise(r => { const c='c'+Date.now(); Cap.Callbacks=Cap.Callbacks||{}; Cap.Callbacks[c]=d=>r(d); Cap.toNative('Overlay','checkPermission',{},c); }),
        requestPermission: () => new Promise(r => { const c='r'+Date.now(); Cap.Callbacks=Cap.Callbacks||{}; Cap.Callbacks[c]=d=>r(d); Cap.toNative('Overlay','requestPermission',{},c); }),
        showOverlay: (o) => { Cap.toNative('Overlay','showOverlay',o||{},'s'+Date.now()); },
        hideOverlay: () => { Cap.toNative('Overlay','hideOverlay',{},'h'+Date.now()); },
        updateOverlay: (o) => { Cap.toNative('Overlay','updateOverlay',o||{},'u'+Date.now()); }
      };
    }
    return null;
  };

  // ── 안드로이드 하드웨어 뒤로가기 버튼 처리 ──
  async function initBackButton(){
    const Cap = getDynamicCapacitor();
    const Plugins = getDynamicPlugins();
    
    // Capacitor App 플러그인 확인 및 리스너 등록
    const App = Plugins.App;
    if(App && App.addListener){
      App.addListener('backButton', ({canGoBack}) => {
        const modalPhoto = document.getElementById('modal-photo');
        const modalHistory = document.getElementById('modal-history');
        const modalAlert = document.getElementById('modal-alert');

        if(modalPhoto && modalPhoto.style.display === 'flex'){
          modalPhoto.style.display = 'none';
          haptic();
        } else if(modalHistory && modalHistory.style.display === 'flex'){
          closeHistoryModal();
          haptic();
        } else if(modalAlert && modalAlert.style.display === 'flex'){
          closeModal();
          haptic();
        } else {
          // 홈 탭이 아니면 홈으로, 홈이면 앱 종료 확인
          const activeTabBtn = document.querySelector('.nav-btn.active');
          const isHome = activeTabBtn && (activeTabBtn.textContent.includes('운행') || activeTabBtn.getAttribute('onclick')?.includes('home'));
          
          if(isHome){
            if(confirm('앱을 종료하시겠습니까?')) exitApp();
          } else {
            switchTab('home');
            haptic();
          }
        }
      });
      console.log('뒤로가기 버튼 리스너 등록 완료');
    } else {
      console.warn('App 플러그인을 찾을 수 없어 뒤로가기 버튼이 작동하지 않을 수 있습니다.');
    }
  }

  async function waitForBridge(attempts=0){
    if(window.Capacitor && window.Capacitor.Plugins) return true;
    if(attempts > 5) return false;
    await new Promise(r=>setTimeout(r,300));
    return waitForBridge(attempts+1);
  }
  const API_BASE = 'https://www.nollae.com/api/vehicle-tracking';

  // ── 상태 ──
  let tripId=null, lastTripId=null, tripStatus=null;
  let timerInterval=null, elapsedSeconds=0, gpsWatchId=null;
  let photos=[], isOnline=true, isSubmitting=false;
  let historyData=[], selectedTripId=null, isPipMode=false;
  let historyPhotos=[];
  let hasOverlayPerm=false; // 오버레이 권한 여부
  let overlayTimerInterval=null; // 오버레이 타이머 업데이트

  // ── GPS 수집 ──
  let gpsTrackingId=null; // watchPosition ID for tracking
  let lastSendTime=0; // 마지막 서버 전송 시각
  let lastSpeed=0; // 마지막 측정 속도 (m/s)
  let stoppedSince=0; // 정차 시작 시각
  const GPS_FAST_INTERVAL = 30000; // ≥10km/h → 30초
  const GPS_SLOW_INTERVAL = 60000; // <10km/h → 60초
  const GPS_STOP_INTERVAL = 120000; // 정차 3분+ → 2분
  const GPS_STOPPED_THRESHOLD = 180000; // 3분

  // ── 네트워크 ──
  async function safeJson(r){try{return typeof r.json==='function'?await r.json():r.data||r;}catch(e){return r;}}
  async function smartPost(u,p){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});return{ok:r.status>=200&&r.status<300,status:r.status,data:await safeJson(r)};}
  async function smartPatch(u,p){const r=await fetch(u,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});return{ok:r.status>=200&&r.status<300,status:r.status,data:await safeJson(r)};}

  // ── 초기화 ──
  async function initApp(){
    console.log('ELS v3.6.1 Init');
    await waitForBridge();
    
    window.onPipModeChanged=function(isInPip){
      isPipMode=isInPip;
      const overlay=document.getElementById('pip-overlay');
      if(overlay)overlay.style.display=isInPip?'flex':'none';
      if(!isInPip)updateTripUI();
    };

    // 컨테이너 입력창 실시간 포맷팅 및 검증 연결
    const inpContainer = document.getElementById('inp-container');
    if(inpContainer){
      inpContainer.oninput = function(){
        this.value = this.value.toUpperCase().replace(/\s/g, ''); // 대문자 + 공백제거
        const isValid = validateContainerNumber(this.value);
        this.style.borderColor = (this.value.length >= 11 && !isValid) ? '#f85149' : '';
        // 간단한 팁 메시지 표시용
        let tip = document.getElementById('cont-tip');
        if(!tip){
          tip = document.createElement('div'); tip.id='cont-tip'; tip.style.fontSize='0.7rem'; tip.style.marginTop='2px';
          this.parentNode.appendChild(tip);
        }
        if(this.value.length >= 11){
          tip.textContent = isValid ? '✅ 유효한 컨테이너 번호' : '❌ 유효하지 않은 번호 (규칙 미달)';
          tip.style.color = isValid ? '#3fb950' : '#f85149';
        } else {
          tip.textContent = '';
        }
      };
    }
    window.addEventListener('online',()=>{isOnline=true;updateOfflineBar();});
    window.addEventListener('offline',()=>{isOnline=false;updateOfflineBar();});

    const B=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('click',fn);};
    B('perm-location',requestLocationPerm);B('perm-camera',requestCameraPerm);
    B('perm-photo',requestPhotoPerm);B('perm-notify',requestNotifyPerm);B('perm-phone',requestPhonePerm);
    B('perm-overlay',requestOverlayPerm);
    B('btn-finish-perms',finishPermissions);B('btn-check-phone',checkPhone);B('btn-save-profile',saveProfile);
    B('btn-start',startTrip);B('btn-pause',pauseTrip);B('btn-resume',resumeTrip);B('btn-stop',stopTrip);
    B('btn-update-profile',updateProfile);
    B('set-perm-location',requestLocationPerm);B('set-perm-camera',requestCameraPerm);
    B('set-perm-photo',requestPhotoPerm);B('set-perm-notify',requestNotifyPerm);B('set-perm-phone',requestPhonePerm);
    B('set-perm-overlay',requestOverlayPerm);
    B('btn-reset-app',resetApp);B('btn-modal-close',closeModal);B('btn-exit-app',exitApp);

    // 오버레이 권한 초기 체크
    checkOverlayPerm();

    // 홈 버튼(앱 최소화) 감지 — Capacitor App 플러그인
    const Plugins = getDynamicPlugins();
    if(Plugins.App){
      Plugins.App.addListener('appStateChange',function(state){
        if(!state.isActive && (tripStatus==='driving'||tripStatus==='paused')){
          // 앱 백그라운드로 → 오버레이 또는 PIP
          if(hasOverlayPerm && getOverlay()){
            showFloatingWidget();
          }
          // PIP는 MainActivity.onUserLeaveHint에서 자동 진입
        } else if(state.isActive){
          // 앱 포그라운드 복귀 → 오버레이 숨기기
          hideFloatingWidget();
        }
      });
    }

    const mO=document.getElementById('modal-alert');if(mO)mO.addEventListener('click',closeModal);
    const mB=document.querySelector('#modal-alert .modal-box');if(mB)mB.addEventListener('click',e=>e.stopPropagation());

    if(localStorage.getItem('els_setup_done') === 'true'){
      showScreen('screen-main');
      startGPS();
      loadSavedProfile();
      checkActiveTrip();
    } else {
      showScreen('screen-permissions');
    }
    initBackButton();
  }

  // ── 순차적 권한 설정 흐름 (Onboarding) ──
  async function checkPermissionsFlow(){
    const p = ['perm-location','perm-camera','perm-photo','perm-notify','perm-phone','perm-overlay'];
    for(const id of p){
       // 각 권한 항목 클릭 유도 또는 상태 체크 로직 (여기서는 UI 표시 위주)
       console.log('Permission Check:', id);
    }
  }

  function updatePipDisplay(){
    const ps=document.getElementById('pip-status'),pt=document.getElementById('pip-timer'),pg=document.getElementById('pip-gps');
    if(ps){ps.textContent=tripStatus==='driving'?'● 운행중':(tripStatus==='paused'?'■ 일시정지':'○ 대기');ps.style.color=tripStatus==='driving'?'#3fb950':(tripStatus==='paused'?'#d29922':'#7d8590');}
    if(pt)pt.textContent=formatTime(elapsedSeconds);
    if(pg){const g=document.getElementById('gps-indicator');const on=g&&g.className==='gps-on';pg.textContent=on?'GPS ●':'GPS ○';pg.style.color=on?'#3fb950':'#f85149';}
  }

  function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.style.display='none');const el=document.getElementById(id);if(el)el.style.display='block';}
  function showModal(t,m){document.getElementById('modal-title').textContent=t;document.getElementById('modal-body').textContent=m;document.getElementById('modal-alert').style.display='flex';}
  function closeModal(){document.getElementById('modal-alert').style.display='none';}
  function updateOfflineBar(){const b=document.getElementById('offline-bar');if(b)b.style.display=isOnline?'none':'block';}
  function haptic(s){try{const Plugins=getDynamicPlugins();if(Plugins.Haptics)Plugins.Haptics.impact({style:s||'Medium'});}catch(e){}}

  async function requestLocationPerm(){
    haptic();
    try{
      await new Promise((r,j)=>{
        navigator.geolocation.getCurrentPosition(
          ()=>r(true),
          (e)=>{ if(e.code===1) j(e); else r(true); }, // code 1 is PERMISSION_DENIED. Other errors mean permitted but no signal
          {enableHighAccuracy:true,timeout:10000}
        );
      });
      markPermGranted('perm-location');
      document.getElementById('gps-indicator').className='gps-on';
    }catch(e){
      alert('위치 권한을 허용해 주세요. (앱 설정에서 권한 허용)');
    }
  }
  async function requestCameraPerm(){haptic();try{const s=await navigator.mediaDevices.getUserMedia({video:true});s.getTracks().forEach(t=>t.stop());markPermGranted('perm-camera');}catch(e){alert('카메라 권한 허용 필요');}}
  async function requestPhotoPerm(){haptic();markPermGranted('perm-photo');showModal('알림','사진/동영상 권한은 앱 설치 시 자동 요청됩니다.');}
  async function requestNotifyPerm(){haptic();try{if('Notification'in window){const r=await Notification.requestPermission();if(r==='granted')markPermGranted('perm-notify');else showModal('알림','알림 권한을 허용해 주세요.');}else markPermGranted('perm-notify');}catch(e){markPermGranted('perm-notify');}}
  async function requestPhonePerm(){haptic();markPermGranted('perm-phone');showModal('알림','전화 권한은 앱 설치 시 자동 요청됩니다.');}

  // 오버레이 권한 (TMAP 방식 플로팅)
  async function checkOverlayPerm(){
    const O = getOverlay();
    if(!O)return;
    try{const r=await O.checkPermission();hasOverlayPerm=r.granted;if(hasOverlayPerm)markPermGranted('perm-overlay');}catch(e){}
  }
  async function requestOverlayPerm(){
    haptic();
    const O = getOverlay();
    if(!O){showModal('알림','이 기능은 안드로이드 앱에서만 사용 가능합니다.');return;}
    try{
      // OverlayPlugin.requestPermission → 설정 화면 열기 → 사용자가 돌아오면 결과 리턴
      const result=await O.requestPermission();
      console.log('오버레이 권한 결과:',result);
      if(result.granted){
        hasOverlayPerm=true;
        markPermGranted('perm-overlay');
        haptic('Heavy');
        showModal('성공','오버레이 권한이 허용되었습니다!\n최고화 시 TMAP처럼 플로팅 위젯이 표시됩니다.');
      }else{
        hasOverlayPerm=false;
        showModal('설정 안내','"다른 앱 위에 표시" 권한을 켜 주세요.\n만약 설정 화면이 열리지 않으면 [휴대폰 설정 > 애플리케이션 > ELS Driver > 다른 앱 위에 표시]에서 직접 켜주시면 됩니다.');
      }
    }catch(e){
      console.error('오버레이 권한 요청 오류:',e);
      showModal('오류','설정 화면을 자동으로 열 수 없습니다.\n[휴대폰 설정 > 애플리케이션 > ELS Driver > 다른 앱 위에 표시]에서 직접 권한을 켜주세요.');
    }
  }

  // 플로팅 위젯 표시/숨기기
  function showFloatingWidget(){
    const O = getOverlay();
    if(!O||!hasOverlayPerm)return;
    try{
      O.showOverlay({
        timer:formatTime(elapsedSeconds),
        container:document.getElementById('inp-container')?.value||'-',
        status:tripStatus||'driving',
        tripId:tripId||''
      });
      // 오버레이 타이머 업데이트
      clearInterval(overlayTimerInterval);
      overlayTimerInterval=setInterval(()=>{
        if(!tripStatus)return;
        try{O.updateOverlay({timer:formatTime(elapsedSeconds),status:tripStatus,tripId:tripId||''});}catch(e){}
      },1000);
    }catch(e){console.error('플로팅 위젯 표시 오류:',e);}
  }
  function hideFloatingWidget(){
    clearInterval(overlayTimerInterval);
    const O = getOverlay();
    if(!O)return;
    try{O.hideOverlay();}catch(e){}
  }

  function markPermGranted(id){
    // 온보딩 권한 아이템 업데이트
    const it=document.getElementById(id);
    if(it){const d=it.querySelector('.perm-dot');if(d){d.classList.remove('dot-red');d.classList.add('dot-green');}const a=it.querySelector('.perm-arrow');if(a)a.textContent='✓';}
    // 설정 탭 권한 아이템도 동기화 (set-perm-location ↔ perm-location)
    const setId = 'set-' + id; // e.g. set-perm-location
    const sit=document.getElementById(setId);
    if(sit){const sd=sit.querySelector('.perm-dot');if(sd){sd.classList.remove('dot-red');sd.classList.add('dot-green');}const sa=sit.querySelector('.perm-arrow');if(sa)sa.textContent='✓';}
  }

  function finishPermissions(){
    haptic('Heavy');
    if(localStorage.getItem('els_setup_done') === 'true'){
      showScreen('screen-main');
    } else {
      showScreen('screen-profile');
    }
  }

  // ═══ 프로필 ═══
  async function checkPhone(){
    if(!isOnline){showModal('알림','인터넷 필요');return;}
    const ph=document.getElementById('inp-phone').value.trim();if(ph.length<10){showModal('오류','올바른 전화번호');return;}
    try{const r=await fetch(`https://www.nollae.com/api/driver-contacts/search?phone=${encodeURIComponent(ph)}`);const d=await safeJson(r);
    if(r.ok&&d&&d.item){
      const it = d.item;
      if(it.name) document.getElementById('inp-name').value=it.name;
      // 매칭 우선순위: business_number -> vehicle_number
      const vNum = it.business_number || it.vehicle_number || '';
      if(vNum) document.getElementById('inp-vehicle').value=vNum;
      // 매칭 우선순위: driver_id -> vehicle_id -> id
      const vId = it.driver_id || it.vehicle_id || it.id || '';
      if(vId) document.getElementById('inp-id').value=vId;
      haptic('Heavy'); showModal('조회 성공',`${it.name} 기사님 정보 로드`);
    } else showModal('결과','등록 정보 없음');}catch(e){showModal('통신 오류',e.message+'\n'+JSON.stringify(e));}
  }
  async function saveProfile(){
    const n=document.getElementById('inp-name').value.trim(),p=document.getElementById('inp-phone').value.trim(),v=document.getElementById('inp-vehicle').value.trim(),i=document.getElementById('inp-id').value.trim().toUpperCase();
    if(!n||!p||!v||!i){showModal('입력 필요','모든 항목 입력');return;}
    if(isOnline){try{await smartPost(`${API_BASE}/drivers`,{name:n,phone:p,vehicle_number:v,vehicle_id:i});}catch(e){}}
    localStorage.setItem('els_name',n);localStorage.setItem('els_phone',p);localStorage.setItem('els_vehicle',v);localStorage.setItem('els_id',i);localStorage.setItem('els_setup_done','true');
    haptic('Heavy');loadSavedProfile();showScreen('screen-main');startGPS();
  }
  function loadSavedProfile(){
    const n=localStorage.getItem('els_name')||'',p=localStorage.getItem('els_phone')||'',v=localStorage.getItem('els_vehicle')||'',i=localStorage.getItem('els_id')||'';
    const dn=document.getElementById('disp-name');if(dn)dn.textContent=n;const dv=document.getElementById('disp-vehicle');if(dv)dv.textContent=v;const di=document.getElementById('disp-id');if(di)di.textContent=i;
    const sn=document.getElementById('set-name');if(sn){sn.value=n;document.getElementById('set-phone').value=p;document.getElementById('set-vehicle').value=v;document.getElementById('set-id').value=i;}
  }
  async function updateProfile(){
    const n=document.getElementById('set-name').value.trim(),p=document.getElementById('set-phone').value.trim(),v=document.getElementById('set-vehicle').value.trim(),i=document.getElementById('set-id').value.trim().toUpperCase();
    if(!n||!p||!v||!i){showModal('입력 필요','모든 항목 필요');return;}
    if(isOnline){try{await smartPost(`${API_BASE}/drivers`,{name:n,phone:p,vehicle_number:v,vehicle_id:i});}catch(e){}}
    localStorage.setItem('els_name',n);localStorage.setItem('els_phone',p);localStorage.setItem('els_vehicle',v);localStorage.setItem('els_id',i);
    loadSavedProfile();haptic();showModal('완료','프로필 저장');
  }
  function resetApp(){if(confirm('모든 데이터 삭제?')){localStorage.clear();location.reload();}}
  function exitApp(){
    if(tripStatus==='driving'||tripStatus==='paused'){showModal('경고','운행 중 종료 불가. 먼저 운행을 종료해 주세요.');return;}
    if(!confirm('앱을 종료합니까?'))return;
    try{const Plugins=getDynamicPlugins();if(Plugins.App&&Plugins.App.exitApp)Plugins.App.exitApp();else window.close();}catch(e){window.close();}
  }

  // ═══ GPS ═══
  function startGPS(){
    if(!navigator.geolocation)return;
    gpsWatchId=navigator.geolocation.watchPosition(
      ()=>{
        const gi=document.getElementById('gps-indicator');
        if(gi){ gi.className='gps-on'; if(gi.textContent==='GPS'||gi.textContent==='GPS오류') gi.textContent='GPS수신중'; }
      },
      ()=>{const gi=document.getElementById('gps-indicator');if(gi){gi.className='gps-off';gi.textContent='GPS오류';}},
      {enableHighAccuracy:true,maximumAge:5000}
    );
  }


  // ═══ GPS 관제 수집 ═══
  function startGPSTracking(){
    stopGPSTracking();
    lastSendTime=0;stoppedSince=0;
    gpsTrackingId=navigator.geolocation.watchPosition(onGPSPosition,onGPSError,{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
    console.log('GPS 관제 수집 시작');
  }

  function stopGPSTracking(){
    if(gpsTrackingId!==null){navigator.geolocation.clearWatch(gpsTrackingId);gpsTrackingId=null;}
    console.log('GPS 관제 수집 종료');
  }

  function onGPSPosition(pos){
    if(tripStatus!=='driving')return; // 일시정지 중에는 수집 안함

    const speedMs=pos.coords.speed||0;
    const speedKmh=speedMs*3.6;
    lastSpeed=speedKmh;
    const now=Date.now();

    // 정차 감지
    if(speedKmh<1){
      if(!stoppedSince)stoppedSince=now;
    }else{
      stoppedSince=0;
    }

    // 수집 간격 결정
    let interval=GPS_FAST_INTERVAL; // 기본 30초
    if(speedKmh<10)interval=GPS_SLOW_INTERVAL; // <10km/h → 60초
    if(stoppedSince&&(now-stoppedSince)>=GPS_STOPPED_THRESHOLD)interval=GPS_STOP_INTERVAL; // 정차 3분+ → 120초

    // 간격 체크
    if(now-lastSendTime<interval)return;
    lastSendTime=now;

    // 서버로 위치 전송
    sendLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy,speedKmh);
    
    // GPS 상태 텍스트 업데이트
    updateGPSStatusText(speedKmh, interval);
  }

  function updateGPSStatusText(speed, interval){
    const gi = document.getElementById('gps-indicator');
    if(!gi) return;
    let mode = interval >= 120000 ? '2분(정차)' : (interval >= 60000 ? '1분(서행)' : '30초(주행)');
    gi.textContent = `GPS정상(${mode})`;
    gi.className = 'gps-on';
    
    // 배너 텍스트도 상세화
    const bs = document.getElementById('banner-status');
    if(bs && tripStatus === 'driving'){
       bs.textContent = `● 운행중 (수집:${mode})`;
    }
  }

  function onGPSError(err){
    console.warn('GPS 오류:',err.message);
  }

  async function sendLocation(lat,lng,accuracy,speed){
    if(!tripId||!isOnline)return;
    try{
      await smartPost(`${API_BASE}/location`,{trip_id:tripId,lat,lng,accuracy:Math.round(accuracy),speed:Math.round(speed)});
    }catch(e){console.error('위치 전송 실패:',e);}
  }

  // 일시정지 시: 마지막 위치 마킹 후 수집 정지
  async function sendPauseLocation(){
    if(!tripId||!isOnline||!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(async(pos)=>{
      await smartPost(`${API_BASE}/location`,{trip_id:tripId,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy),speed:0,method:'PAUSE_MARK'});
    },()=>{},{enableHighAccuracy:true,timeout:5000});
  }

  // 종료 시: 마지막 위치 마킹 후 수집 종료
  async function sendStopLocation(tid){
    if(!tid||!isOnline||!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(async(pos)=>{
      await smartPost(`${API_BASE}/location`,{trip_id:tid,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy),speed:0,method:'STOP_MARK'});
    },()=>{},{enableHighAccuracy:true,timeout:5000});
  }

  // ═══ 컨테이너 번호 ISO 6346 검증 (MOD 11) ═══
  function validateContainerNumber(num){
    if(!num || num.length !== 11) return false;
    const charCode = (c) => {
      const v = "0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ".indexOf(c);
      return v === -1 ? 0 : v;
    };
    let sum = 0;
    for(let i=0; i<10; i++){
      let val = charCode(num[i]);
      sum += val * Math.pow(2, i);
    }
    const checkDigit = (sum % 11) % 10;
    return checkDigit === parseInt(num[10]);
  }

  // ═══ 운송 ═══
  async function startTrip(){
    if(!isOnline){showModal('오프라인','인터넷 필요');return;}if(isSubmitting)return;
    
    // [변경] 컨테이너 번호 추출 (없을 수도 있음)
    const c=document.getElementById('inp-container').value.replace(/\s/g, '').toUpperCase();
    const vNum = localStorage.getItem('els_vehicle') || '';
    let cSize = (document.getElementById('inp-cont-size')||{}).value||'40FT';
    let cKind = (document.getElementById('inp-cont-type')||{}).value||'DRY';
    let memo = (document.getElementById('inp-memo')||{}).value||'';

    // 차량 정보가 없으면 컨테이너 번호라도 필수
    if(!vNum && !c){
      showModal('입력 필요','차량 정보가 없으므로 컨테이너 번호를 입력해야 합니다.');
      return;
    }

    // 컨테이너 번호가 있지만 유효하지 않은 경우만 경고 (강제 시작 가능)
    if(c && !validateContainerNumber(c)){
      if(!confirm('유효하지 않은 컨테이너 번호 형식입니다.\n나중에 수정하시겠습니까?')) return;
    }
    isSubmitting=true;const btn=document.getElementById('btn-start');btn.disabled=true;btn.textContent='처리 중...';
    try{
      const memo=(document.getElementById('inp-memo')||{}).value||'';
      const r=await smartPost(`${API_BASE}/trips`,{
        vehicle_number:localStorage.getItem('els_vehicle')||'',
        vehicle_id:localStorage.getItem('els_id')||'',
        driver_name:localStorage.getItem('els_name')||'',
        driver_phone:localStorage.getItem('els_phone')||'',
        container_number:c,
        seal_number:document.getElementById('inp-seal').value.trim().toUpperCase(),
        container_type:(document.getElementById('inp-cont-size')||{}).value||'40FT',
        container_kind:(document.getElementById('inp-cont-type')||{}).value||'DRY',
        special_notes:memo.trim()
      });
      if(r.ok){
        tripId=r.data.id||r.data.trip_id;lastTripId=tripId;tripStatus=r.data.status||'driving';elapsedSeconds=0;
        haptic('Heavy');updateTripUI();startTimer();startGPSTracking();uploadPendingPhotos();
      }else throw new Error(r.data?.error||'서버 오류('+r.status+')');
    }catch(e){showModal('오류','운송 시작 실패: '+e.message);}
    finally{isSubmitting=false;btn.disabled=false;btn.textContent='운송 시작 (START)';}
  }

  async function pauseTrip(){
    haptic();tripStatus='paused';updateTripUI();
    // GPS: 마지막 위치 마킹 후 수집 정지 (관제 웹: 노란색 아이콘)
    await sendPauseLocation();
    stopGPSTracking();
    if(isOnline&&tripId){try{await smartPatch(`${API_BASE}/trips/${tripId}`,{action:'pause'});}catch(e){}}
  }

  async function resumeTrip(){
    haptic();tripStatus='driving';updateTripUI();
    // GPS: 수집 재개 (관제 웹: 초록색 아이콘)
    startGPSTracking();
    if(isOnline&&tripId){try{await smartPatch(`${API_BASE}/trips/${tripId}`,{action:'resume'});}catch(e){}}
  }

  async function stopTrip(){
    if(!tripId||isSubmitting){return;}
    if(!confirm('운송을 종료하시겠습니까?'))return;
    isSubmitting=true;
    try{
      haptic('Heavy');const cid=tripId;
      await sendStopLocation(cid);
      stopGPSTracking();
      if(isOnline){try{const r=await smartPatch(`${API_BASE}/trips/${cid}`,{action:'complete'});if(!r.ok)showModal('경고','서버 종료 처리 실패');}catch(e){showModal('경고','통신 실패');}}
      lastTripId=cid;tripId=null;tripStatus=null;clearInterval(timerInterval);timerInterval=null;elapsedSeconds=0;
      photos=[]; renderPhotos();
      document.getElementById('inp-container').value='';
      document.getElementById('inp-seal').value='';
      document.getElementById('inp-memo').value='';
      updateTripUI();
      showModal('완료','운송이 종료되었습니다. 수고하셨습니다.');
    }finally{isSubmitting=false;}
  }

  // 강제 데이터 초기화 (버튼용)
  function resetTripData(){
    if(!confirm('진행 중인 모든 입력을 초기화할까요?\n(운행 상태는 변하지 않습니다)'))return;
    photos=[]; renderPhotos();
    document.getElementById('inp-container').value='';
    document.getElementById('inp-seal').value='';
    document.getElementById('inp-memo').value='';
    showModal('초기화','사진 및 입력 정보가 초기화되었습니다.');
  }

  function updateTripUI(){
    const a=tripStatus==='driving'||tripStatus==='paused',d=tripStatus==='driving';
    const bn=document.getElementById('active-banner');bn.style.display=a?'block':'none';
    const bs=document.getElementById('banner-status');
    const gi=document.getElementById('gps-indicator');

    if(d){
      bs.textContent='● 운행중 (수집대기)';
      bs.style.color='#3fb950';
      if(gi) gi.textContent = 'GPS수집중';
    } else if(tripStatus === 'paused'){
      bs.textContent='■ 일시정지 (휴식상태)';
      bs.style.color='#d29922';
      if(gi) { gi.textContent = '휴식상태'; gi.className = 'gps-paused'; }
    } else {
      if(gi) { gi.textContent = 'GPS'; gi.className = 'gps-off'; }
    }

    document.getElementById('screen-main').classList.toggle('trip-active',a);
    document.getElementById('btn-start').style.display=a?'none':'block';
    document.getElementById('trip-controls').style.display=a?'block':'none';
    document.getElementById('btn-pause').style.display=d?'block':'none';
    document.getElementById('btn-resume').style.display=(!d&&a)?'block':'none';
    const ic=document.getElementById('card-input');
    // [변경] 운행 중에도 수정 가능하도록 pointerEvents 차단 해제, 대신 opacity로만 상태 표시
    if(ic){ic.style.opacity='1';ic.style.pointerEvents='auto';}
    if(isPipMode)updatePipDisplay();
  }

  function startTimer(){clearInterval(timerInterval);timerInterval=setInterval(()=>{if(tripStatus==='driving')elapsedSeconds++;const s=formatTime(elapsedSeconds);const td=document.getElementById('trip-timer-display');if(td)td.textContent=s;if(isPipMode){const pt=document.getElementById('pip-timer');if(pt)pt.textContent=s;}},1000);}
  function formatTime(s){return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor((s%3600)/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}

  // ═══ 사진 ═══
  async function handlePhotos(event){
    const files=event.target.files;if(!files.length)return;
    for(const file of files){if(photos.length>=10)break;
      try{const resized=await resizeImage(file,1200,0.7);const prev=URL.createObjectURL(resized);
        photos.push({file:resized,previewUrl:prev,uploaded:false,key:null});renderPhotos();
        const uid=tripId||lastTripId;if(uid&&isOnline)await uploadSinglePhoto(photos.length-1,uid);
      }catch(e){showModal('사진 처리 제한','이미지를 불러올수 없습니다.\n'+e.message);}}
    event.target.value='';
  }
  async function uploadSinglePhoto(idx,uid){
    try{
      const p=photos[idx];if(!p||!p.file||p.uploaded)return;
      const formData = new FormData();
      formData.append('trip_id', uid);
      formData.append('photos', p.file);
      
      console.log(`[DEBUG] 업로드 시작: trip_id=${uid}, file=${p.file.name}`);
      const res=await fetch(`${API_BASE}/photos`,{method:'POST',body:formData});
      const d=await safeJson(res);
      
      console.log(`[DEBUG] 서버 응답 상태: ${res.status}`);
      if(res.ok){
        photos[idx].uploaded=true;
        if(d.photos&&d.photos.length>0) photos[idx].key=d.photos[d.photos.length-1].key;
        renderPhotos();
      }else{
        const errDetail = d?.error || JSON.stringify(d) || '상세내용 없음';
        showModal('업로드 실패', `상태: ${res.status}\n오류: ${errDetail}`);
      }
    }catch(e){
      console.error('[DEBUG] 업로드 예외:', e);
      showModal('통신/JS 오류', `${e.name}: ${e.message}\n${e.stack?.split('\n')[0]}`);
    }
  }
  async function uploadPendingPhotos(){const uid=tripId||lastTripId;if(!uid||!isOnline)return;for(let i=0;i<photos.length;i++){if(!photos[i].uploaded)await uploadSinglePhoto(i,uid);}}
  function resizeImage(f,mx,q){return new Promise((r,j)=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;if(w>mx||h>mx){if(w>h){h=Math.round(h*mx/w);w=mx;}else{w=Math.round(w*mx/h);h=mx;}}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(b=>r(new File([b],f.name||'photo.jpg',{type:'image/jpeg'})),'image/jpeg',q);};img.onerror=()=>j(new Error('지원하지 않는 형식이거나 권한 오류입니다.'));img.src=URL.createObjectURL(f);});}
  function encodeFileToBase64(f){return new Promise((r,j)=>{const rd=new FileReader();rd.readAsDataURL(f);rd.onload=()=>r(rd.result.split(',')[1]);rd.onerror=e=>j(e);});}
  function renderPhotos(){
    const g=document.getElementById('photo-grid');g.innerHTML='';
    photos.forEach((p,i)=>{const w=document.createElement('div');w.className='photo-wrapper';const img=document.createElement('img');
      const src=p.key?`${API_BASE}/photos/view?key=${encodeURIComponent(p.key)}`:p.previewUrl;
      img.src=src; img.onclick=()=>zoomImage(src); w.appendChild(img);
      if(p.uploaded){const b=document.createElement('div');b.className='photo-badge';b.textContent='✓';w.appendChild(b);}
      const d=document.createElement('button');d.className='photo-del';d.textContent='✕';d.onclick=()=>deletePhoto(i);w.appendChild(d);g.appendChild(w);});
    document.getElementById('photo-add-label').style.display=photos.length>=10?'none':'flex';
  }
  let zoomScale=1, zoomStartX=0, zoomStartY=0, zoomBaseDistance=0, zoomBaseScale=1, zoomCurX=0, zoomCurY=0;
  function zoomImage(src){
    const m=document.getElementById('modal-photo'),img=document.getElementById('zoom-img'),box=document.getElementById('zoom-container');
    if(!m||!img)return;
    img.src=src; zoomScale=1; zoomCurX=0; zoomCurY=0; updateZoomTransform();
    m.style.display='flex';
    
    // 터치/마우스 핸들러
    const start=(e)=>{
      const t=e.touches;
      if(t && t.length===2){
        zoomBaseDistance=Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
        zoomBaseScale=zoomScale;
      } else {
        const point=t?t[0]:e;
        zoomStartX=point.clientX-zoomCurX; zoomStartY=point.clientY-zoomCurY;
      }
    };
    const move=(e)=>{
      e.preventDefault();
      const t=e.touches;
      if(t && t.length===2){
        const dist=Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
        zoomScale=Math.max(1, zoomBaseScale * (dist/zoomBaseDistance));
      } else {
        const point=t?t[0]:e;
        zoomCurX=point.clientX-zoomStartX; zoomCurY=point.clientY-zoomStartY;
      }
      updateZoomTransform();
    };
    box.onmousedown=start; box.ontouchstart=start;
    window.onmousemove=e=>{if(box.onmousedown)move(e)}; window.ontouchmove=move;
    window.onmouseup=()=>{box.onmousedown=null;};
  }
  function updateZoomTransform(){ const i=document.getElementById('zoom-img'); if(i)i.style.transform=`translate(${zoomCurX}px, ${zoomCurY}px) scale(${zoomScale})`; }
  async function deletePhoto(idx){const p=photos[idx];if(p.key){try{await fetch(`${API_BASE}/photos/delete?key=${encodeURIComponent(p.key)}`,{method:'DELETE'});}catch(e){}}photos.splice(idx,1);renderPhotos();}

  // ═══ 기록 사진 ═══
  async function handleHistoryPhotos(event){
    if(!selectedTripId){showModal('오류','기록 선택 필요');return;}if(!isOnline){showModal('오프라인','인터넷 필요');return;}
    const files=event.target.files;if(!files.length)return;
    for(const file of files){try{const resized=await resizeImage(file,1200,0.7);
      const formData = new FormData();
      formData.append('trip_id', selectedTripId);
      formData.append('photos', resized);
      
      const res=await fetch(`${API_BASE}/photos`,{method:'POST',body:formData});
      const d=await safeJson(res);
      if(res.ok&&d.photos&&d.photos.length>0){historyPhotos.push({key:d.photos[d.photos.length-1].key,url:d.photos[d.photos.length-1].url});renderHistoryPhotos();}
      else showModal('업로드 실패',(d?.error||res.status)+'');
    }catch(e){showModal('업로드 오류',e.message);}}event.target.value='';
  }
  function renderHistoryPhotos(){
    const g=document.getElementById('h-photo-grid');g.innerHTML='';const cnt=document.getElementById('h-photo-count');if(cnt)cnt.textContent=historyPhotos.length;
    historyPhotos.forEach((p,i)=>{
      const w=document.createElement('div');w.className='photo-wrapper';
      const img=document.createElement('img');
      // [중요] 기록 탭에서도 무조건 Proxy API (?key=) 주소로 보여줌
      const src=p.key ? `${API_BASE}/photos/view?key=${encodeURIComponent(p.key)}` : p.url;
      console.log(`[DEBUG-HIST] 렌더링 사진(${i}): key=${p.key}, final_src=${src}`);
      img.src=src; 
      img.onclick=()=>zoomImage(src);
      img.onerror=function(){
        console.error(`[DEBUG-HIST] 사진 로드 에러: ${src}`);
        this.style.background='#1c2128';
      };
      w.appendChild(img);
      const d=document.createElement('button');d.className='photo-del';d.textContent='✕';d.onclick=()=>deleteHistoryPhoto(i);
      w.appendChild(d);g.appendChild(w);
    });
  }
  async function deleteHistoryPhoto(idx){const p=historyPhotos[idx];if(p.key){try{await fetch(`${API_BASE}/photos/delete?key=${encodeURIComponent(p.key)}`,{method:'DELETE'});}catch(e){}}historyPhotos.splice(idx,1);renderHistoryPhotos();}

  // ═══ 탭 ═══
  function switchTab(t){haptic('Light');document.getElementById('main-content').style.display=t==='home'?'block':'none';document.getElementById('tab-history').style.display=t==='history'?'block':'none';document.getElementById('tab-settings').style.display=t==='settings'?'block':'none';document.querySelectorAll('.nav-btn').forEach((b,i)=>b.classList.toggle('active',['home','history','settings'][i]===t));if(t==='history')loadHistory();if(t==='settings')loadSavedProfile();}

  // ═══ 기록 ═══
  async function loadHistory(){
    const mi=document.getElementById('history-month');if(!mi.value){const n=new Date();mi.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
    const ph=localStorage.getItem('els_phone')||'',ve=localStorage.getItem('els_vehicle')||'';
    const list=document.getElementById('history-list');list.innerHTML='<div style="text-align:center;padding:20px;color:#7d8590;">불러오는 중...</div>';
    if(!isOnline){list.innerHTML='<div style="text-align:center;padding:20px;color:#7d8590;">인터넷 필요</div>';return;}
    try{const params=new URLSearchParams({mode:'my',month:mi.value});if(ph)params.append('phone',ph);if(ve)params.append('vehicle_number',ve);
      const r=await fetch(`${API_BASE}/trips?${params}`);if(r.ok){const d=await safeJson(r);const trips=d.trips||d;historyData=trips;list.innerHTML='';
        if(!trips.length){list.innerHTML='<div style="text-align:center;padding:20px;color:#7d8590;">기록 없음</div>';return;}
        trips.forEach(t=>{const date=new Date(t.started_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
          const sl=t.status==='driving'?'운행중':(t.status==='paused'?'일시정지':'종료');
          const bc=t.status==='driving'?'badge-driving':(t.status==='paused'?'badge-paused':'badge-finished');
          const it=document.createElement('div');it.className='history-item';it.onclick=()=>showHistoryDetail(t.id);
          it.innerHTML=`<div class="hist-header"><span class="hist-date">${date}</span><span class="badge ${bc}">${sl}</span></div><div class="hist-title">${t.container_number||'미입력'} (${t.container_type||'-'})</div><div class="hist-sub">${t.vehicle_number} | ${t.driver_name}</div>`;
          list.appendChild(it);});}
      else list.innerHTML='<div style="color:#f85149;">불러오기 실패</div>';
    }catch(e){list.innerHTML='<div style="color:#f85149;">통신 오류</div>';}
  }

  function showHistoryDetail(id){
    const trip=historyData.find(t=>t.id===id);if(!trip)return;selectedTripId=id;
    document.getElementById('edit-container').value=trip.container_number||'';document.getElementById('edit-seal').value=trip.seal_number||'';
    document.getElementById('edit-cont-size').value=trip.container_type||'40FT';document.getElementById('edit-cont-type').value=trip.container_kind||'DRY';
    document.getElementById('edit-notes').value=trip.special_notes||'';
    const se=document.getElementById('h-status');
    if(trip.status==='driving'){se.textContent='● 운행중';se.style.color='#3fb950';}
    else if(trip.status==='paused'){se.textContent='■ 일시정지';se.style.color='#d29922';}
    else{se.textContent='○ 종료';se.style.color='#7d8590';}
    document.getElementById('h-time-info').textContent='시작: '+new Date(trip.started_at).toLocaleString('ko-KR')+' | 종료: '+(trip.completed_at?new Date(trip.completed_at).toLocaleString('ko-KR'):'-');
    document.getElementById('btn-force-stop').style.display=trip.status!=='completed'?'block':'none';
    historyPhotos=(trip.photos||[]).map(p=>({key:p.key||'',url:p.url||''}));renderHistoryPhotos();
    document.getElementById('modal-history').style.display='flex';
  }
  function closeHistoryModal(){document.getElementById('modal-history').style.display='none';}
  async function saveHistoryEdit(){
    if(!selectedTripId)return;
    try{
      // [변경] 45FT 직접 지원 (DB 잠금 해제 완료)
      const r=await smartPatch(`${API_BASE}/trips/${selectedTripId}`,{
        container_number:document.getElementById('edit-container').value.trim().toUpperCase(),
        seal_number:document.getElementById('edit-seal').value.trim().toUpperCase(),
        container_type: document.getElementById('edit-cont-size').value,
        container_kind:document.getElementById('edit-cont-type').value,
        special_notes: document.getElementById('edit-notes').value.trim(),
        photos: historyPhotos
      });
      if(r.ok){
        haptic('Heavy');
        showModal('저장','기록 수정 완료');
        closeHistoryModal();
        loadHistory();
      }else{
        showModal('오류','수정 실패: '+(r.data?.error||r.status));
      }
    }catch(e){
      showModal('오류',e.message);
    }
  }
  async function forceStopTrip(){
    if(!selectedTripId||!confirm('강제 종료?'))return;
    try{const r=await smartPatch(`${API_BASE}/trips/${selectedTripId}`,{action:'complete'});
    if(r.ok){showModal('성공','종료 처리 완료');closeHistoryModal();loadHistory();if(selectedTripId===tripId){tripId=null;tripStatus=null;clearInterval(timerInterval);stopGPSTracking();updateTripUI();}}
    else showModal('오류','종료 실패');}catch(e){showModal('오류','통신 실패');}
  }

  async function checkActiveTrip(){
    if(!isOnline)return;const ph=localStorage.getItem('els_phone')||'',ve=localStorage.getItem('els_vehicle')||'';if(!ph&&!ve)return;
    try{const params=new URLSearchParams({mode:'my'});if(ph)params.append('phone',ph);if(ve)params.append('vehicle_number',ve);
    const r=await fetch(`${API_BASE}/trips?${params}`);if(r.ok){const d=await safeJson(r);const trips=d.trips||d;
    const ac=trips.find(t=>t.status==='driving'||t.status==='paused');
    if(ac&&ac.id){tripId=ac.id;lastTripId=ac.id;tripStatus=ac.status||'driving';elapsedSeconds=Math.floor((Date.now()-new Date(ac.started_at).getTime())/1000);updateTripUI();startTimer();
    if(tripStatus==='driving')startGPSTracking();
    const ic=document.getElementById('inp-container');if(ic)ic.value=ac.container_number||'';const is2=document.getElementById('inp-seal');if(is2)is2.value=ac.seal_number||'';}}}catch(e){}
  }

  // 전역
  window.startTrip=startTrip;window.pauseTrip=pauseTrip;window.resumeTrip=resumeTrip;window.stopTrip=stopTrip;
  window.handlePhotos=handlePhotos;window.handleHistoryPhotos=handleHistoryPhotos;
  window.switchTab=switchTab;window.loadHistory=loadHistory;window.showHistoryDetail=showHistoryDetail;
  window.closeHistoryModal=closeHistoryModal;window.saveHistoryEdit=saveHistoryEdit;window.forceStopTrip=forceStopTrip;window.closeModal=closeModal;window.exitApp=exitApp;
  window.resetTripData=resetTripData;window.showScreen=showScreen;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp);else initApp();
})();