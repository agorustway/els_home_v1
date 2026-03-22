(() => {
  // Capacitor Core init (생략 - 실제 파일엔 포함)
  var API_BASE = "https://nollae.com/api/vehicle-tracking";
var tripId = localStorage.getItem('els_active_trip_id') || null;
var tripStatus = null;
var timerInterval = null;
var elapsedSeconds = 0;
var gpsWatchId = null;
var photos = [];
var isOnline = navigator.onLine;
var isBusy = false;
var historyData = [];

async function safeJson(res) {
  try {
    if (res && typeof res.json === "function") return await res.json();
    return res.data || res;
  } catch (e) { return res; }
}

async function apiCall(url, method, payload) {
  if (isBusy && method === 'POST') return { ok: false, status: 0, data: { error: "처리 중..." } };
  if (method === 'POST') isBusy = true;
  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : null
    });
    const data = await safeJson(res);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
  } catch (e) { throw e; } finally { if (method === 'POST') isBusy = false; }
}

// ---------------- UI Helpers ----------------
function showModal(title, msg) {
  const m = document.getElementById("modal-alert");
  if(!m) return;
  document.getElementById("modal-title").textContent = title;
  const body = document.getElementById("modal-body");
  if (msg.includes("<button") || msg.includes("<div") || msg.includes("<input")) {
      body.innerHTML = msg;
  } else {
      body.textContent = msg;
  }
  m.style.display = "flex";
}
function closeModal() {
  const m = document.getElementById("modal-alert");
  if(m) m.style.display = "none";
}
function haptic(style) {
  try { if(typeof Haptics !== 'undefined') Haptics.impact({ style: style || "Medium" }); } catch (e) {}
}
function formatTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor(sec % 3600 / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const el = document.getElementById(id);
  if(el) el.style.display = 'block';
}

// ---------------- Core Logic ----------------

async function startTrip() {
  if (isBusy || !isOnline) return;
  const container = document.getElementById("inp-container")?.value.trim().toUpperCase() || "";
  if (!container) { showModal("알림", "컨테이너 번호를 입력해 주세요."); return; }
  
  haptic("Heavy");
  const body = {
    driver_name: localStorage.getItem("els_name") || "",
    driver_phone: localStorage.getItem("els_phone") || "",
    vehicle_number: localStorage.getItem("els_vehicle") || "",
    container_number: container,
    seal_number: document.getElementById("inp-seal")?.value.trim().toUpperCase() || "",
    container_type: document.getElementById("inp-cont-size")?.value || "40FT",
    container_kind: document.getElementById("inp-cont-type")?.value || "DRY"
  };

  try {
    const res = await apiCall(`${API_BASE}/trips`, "POST", body);
    const data = res.data;
    const tid = data.id || (data.trip && data.trip.id) || data.trip_id;
    
    if (tid) {
      tripId = tid;
      localStorage.setItem("els_active_trip_id", tripId);
      tripStatus = "driving";
      updateTripUI();
      startTimer();
      showOverlay();
    } else {
      showModal("오류", "운행 정보를 받지 못했습니다. (ID 누락)");
    }
  } catch (e) { showModal("오류", "통신 실패: " + e.message); }
}

async function stopTrip() {
  if (isBusy) return;
  if (!confirm("운행을 종료하시겠습니까?")) return;
  haptic("Heavy");
  
  const idToStop = tripId || localStorage.getItem("els_active_trip_id");
  if (!idToStop) {
    showModal("오류", "종료할 운행 정보가 없습니다.");
    return;
  }

  try {
    const res = await apiCall(`${API_BASE}/trips/${idToStop}`, "PATCH", { action: "complete" });
    if (res.ok) {
      tripStatus = null;
      tripId = null;
      localStorage.removeItem("els_active_trip_id");
      clearInterval(timerInterval);
      updateTripUI();
      hideOverlay();
      showModal("운송 완료", "운행이 정상적으로 종료되었습니다.");
      loadHistory();
    } else {
      showModal("오류", "종료 실패: " + (res.data.error || res.status));
    }
  } catch (e) { showModal("오류", "통신 실패: " + e.message); }
}

async function handlePhotos(event) {
  if (!tripId) tripId = localStorage.getItem("els_active_trip_id");
  if (!tripId) { showModal("알림", "운행 정보가 없습니다. 운행 시작 후 등록해 주세요."); return; }
  
  const files = event.target.files;
  if (!files.length) return;
  
  for (const file of files) {
    try {
      const base64 = await encodeFileToBase64(await resizeImage(file, 1200, 0.7));
      const res = await apiCall(`${API_BASE}/photos`, "POST", {
        trip_id: tripId, 
        photos: [{ name: file.name, type: "image/jpeg", base64 }]
      });
      if (res.ok) showModal("성공", "사진이 업로드되었습니다.");
      else showModal("오류", "업로드 실패: " + (res.data.error || res.status));
    } catch (e) { showModal("오류", "에러: " + e.message); }
  }
}

// ---------------- Permissions ----------------
async function requestOverlayPerm() {
  if (typeof Overlay === 'undefined' || !Overlay) return;
  haptic();
  try {
    await Overlay.requestPermission();
    let checks = 0;
    const intv = setInterval(async () => {
      checks++;
      const check = await Overlay.checkPermission();
      if (check.granted) {
        clearInterval(intv);
        const dot = document.querySelector('#perm-overlay .perm-dot');
        if(dot) { dot.classList.remove('dot-red'); dot.classList.add('dot-green'); }
        showModal("알림", "다른 앱 위에 표시 권한이 허용되었습니다.");
      }
      if (checks > 30) clearInterval(intv);
    }, 2000);
  } catch (e) { if(Overlay) Overlay.openAppSettings(); }
}

async function requestCameraPerm() {
  haptic();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    const dot = document.querySelector('#perm-camera .perm-dot');
    if(dot) { dot.classList.remove('dot-red'); dot.classList.add('dot-green'); }
  } catch(e) {
    if (typeof Overlay !== 'undefined' && Overlay) Overlay.openAppSettings();
  }
}

async function requestLocationPerm() {
  haptic();
  try {
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
    });
    const dot = document.querySelector('#perm-location .perm-dot');
    if(dot) { dot.classList.remove('dot-red'); dot.classList.add('dot-green'); }
  } catch(e) {
    if (typeof Overlay !== 'undefined' && Overlay) Overlay.openLocationSettings();
  }
}

function finishPermissions() {
    haptic('Heavy');
    showScreen('screen-profile');
}

// ---------------- History & Edit ----------------
async function loadHistory() {
  const monthInput = document.getElementById('history-month');
  if (!monthInput || !monthInput.value) return;
  
  const phone = localStorage.getItem('els_phone') || '';
  const vehicle = localStorage.getItem('els_vehicle') || '';
  const list = document.getElementById('history-list');
  if(!list) return;

  try {
    const params = new URLSearchParams({ mode: 'my', month: monthInput.value });
    if (phone) params.append('phone', phone);
    if (vehicle) params.append('vehicle_number', vehicle);

    const res = await fetch(`${API_BASE}/trips?${params}`);
    if (res.ok) {
      const data = await safeJson(res);
      historyData = data.trips || data;
      
      if (historyData.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px;">기록이 없습니다.</div>';
        return;
      }

      list.innerHTML = historyData.map(t => {
        const date = new Date(t.started_at).toLocaleString('ko-KR');
        const statusStr = t.status === 'driving' ? '운행중' : '종료';
        const badgeColor = t.status === 'driving' ? '#238636' : '#8b949e';
        return `
          <div class="history-item" onclick="openTripDetail('${t.id || t.trip_id}')" style="padding:15px; border-bottom:1px solid #30363d; cursor:pointer;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
              <span style="font-size:12px; color:#8b949e;">${date}</span>
              <span style="background:${badgeColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${statusStr}</span>
            </div>
            <div style="font-size:16px; font-weight:bold; color:#e6edf3;">${t.container_number || '미입력'} (${t.container_type || '-'})</div>
            <div style="font-size:12px; color:#8b949e;">${t.vehicle_number}</div>
          </div>
        `;
      }).join('');
    }
  } catch (e) {}
}

window.openTripDetail = async function(id) {
  if (!id) return;
  haptic();
  showModal("상세 조회", "불러오는 중...");
  try {
    const res = await fetch(`${API_BASE}/trips/${id}`);
    const trip = await safeJson(res);
    
    const html = `
      <div id="trip-detail-content" style="text-align:left; padding:10px; width:100%;">
        <div id="detail-view">
          <p><strong>컨테이너:</strong> ${trip.container_number || '-'}</p>
          <p><strong>씰 번호:</strong> ${trip.seal_number || '-'}</p>
          <p><strong>차량:</strong> ${trip.vehicle_number}</p>
          <p><strong>상태:</strong> ${trip.status === "driving" ? "운행중" : "종료"}</p>
          <hr style="border:0; border-top:1px solid #30363d; margin:15px 0;">
          <div style="display:flex; gap:10px;">
            <button onclick="closeModal()" class="btn-sub" style="flex:1;">닫기</button>
            <button onclick="enableEditMode()" class="btn-main" style="flex:1;">정보 수정</button>
          </div>
          ${trip.status === "driving" ? `<button onclick="forceStop('${trip.id}')" class="btn-main" style="background:#f85149; width:100%; margin-top:10px;">운행 강제종료</button>` : ""}
        </div>
        
        <div id="edit-view" style="display:none;">
          <label style="font-size:12px; color:#8b949e; display:block; margin-bottom:5px;">컨테이너 번호</label>
          <input type="text" id="edit-container" class="inp-main" value="${trip.container_number || ''}" style="width:100%; margin-bottom:15px;">
          <label style="font-size:12px; color:#8b949e; display:block; margin-bottom:5px;">씰 번호</label>
          <input type="text" id="edit-seal" class="inp-main" value="${trip.seal_number || ''}" style="width:100%; margin-bottom:15px;">
          <hr style="border:0; border-top:1px solid #30363d; margin:15px 0;">
          <div style="display:flex; gap:10px;">
            <button onclick="disableEditMode()" class="btn-sub" style="flex:1;">취소</button>
            <button onclick="saveTripEdit('${trip.id}')" class="btn-main" style="background:#238636; flex:1;">저장하기</button>
          </div>
        </div>
      </div>
    `;
    showModal("운송 기록 상세", html);
  } catch (e) { showModal("오류", "불러오기 실패"); }
};

window.enableEditMode = () => {
  document.getElementById("detail-view").style.display = "none";
  document.getElementById("edit-view").style.display = "block";
};

window.disableEditMode = () => {
  document.getElementById("detail-view").style.display = "block";
  document.getElementById("edit-view").style.display = "none";
};

window.saveTripEdit = async function(id) {
  const container = document.getElementById("edit-container").value.trim().toUpperCase();
  const seal = document.getElementById("edit-seal").value.trim().toUpperCase();
  
  haptic("Heavy");
  showModal("저장 중", "서버에 반영하고 있습니다...");
  try {
    const res = await apiCall(`${API_BASE}/trips/${id}`, "PATCH", {
      container_number: container,
      seal_number: seal
    });
    if (res.ok) {
      showModal("성공", "정보가 수정되었습니다.");
      loadHistory();
    } else {
      showModal("오류", "수정 실패: " + (res.data.error || res.status));
    }
  } catch (e) { showModal("오류", "통신 실패"); }
};

window.forceStop = async function(id) {
  if(!confirm("이 운행을 강제로 종료하시겠습니까?")) return;
  try {
      const res = await apiCall(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
      if(res.ok) {
          showModal("성공", "강제 종료 완료");
          if(tripId === id) { tripId = null; tripStatus = null; updateTripUI(); hideOverlay(); }
          loadHistory();
      }
  } catch(e) {}
};

// ---------------- Helpers & Initialization ----------------

function updateTripUI() {
  const isActive = tripStatus === 'driving' || tripStatus === 'paused';
  const elBanner = document.getElementById('active-banner');
  const elBtnStart = document.getElementById('btn-start');
  const elControls = document.getElementById('trip-controls');
  
  if(elBanner) elBanner.style.display = isActive ? 'block' : 'none';
  if(elBtnStart) elBtnStart.style.display = isActive ? 'none' : 'block';
  if(elControls) elControls.style.display = isActive ? 'block' : 'none';
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (tripStatus === 'driving') {
      elapsedSeconds++;
      const str = formatTime(elapsedSeconds);
      const d = document.getElementById('trip-timer-display');
      if(d) d.textContent = str;
      if (elapsedSeconds % 5 === 0 && typeof Overlay !== 'undefined' && Overlay) {
        Overlay.updateOverlay({ timer: str, tripId, status: tripStatus }).catch(()=>{});
      }
    }
  }, 1000);
}

async function showOverlay() {
  if (typeof Overlay === 'undefined' || !Overlay || tripStatus !== 'driving') return;
  try {
    await Overlay.showOverlay({
      timer: formatTime(elapsedSeconds),
      container: document.getElementById('inp-container')?.value || '-',
      tripId: tripId,
      status: tripStatus
    });
  } catch(e) {}
}

async function hideOverlay() {
  if (typeof Overlay === 'undefined' || !Overlay) return;
  try { await Overlay.hideOverlay(); } catch(e) {}
}

async function checkActiveTrip() {
  const phone = localStorage.getItem('els_phone') || '';
  const vehicle = localStorage.getItem('els_vehicle') || '';
  if (!phone || !vehicle || !isOnline) return;

  try {
    const params = new URLSearchParams({ mode: 'my', phone, vehicle_number: vehicle });
    const res = await fetch(`${API_BASE}/trips?${params}`);
    if (res.ok) {
      const data = await safeJson(res);
      const tripsData = data.trips || data;
      const activeTrip = tripsData.find(t => t.status === 'driving' || t.status === 'paused');

      if (activeTrip && activeTrip.id) {
        tripId = activeTrip.id;
        tripStatus = activeTrip.status || 'driving';
        localStorage.setItem("els_active_trip_id", tripId);
        
        const start = new Date(activeTrip.started_at).getTime();
        elapsedSeconds = Math.floor((Date.now() - start) / 1000);

        updateTripUI();
        startTimer();
      }
    }
  } catch(e) {}
}

function resizeImage(file, maxSize, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => { resolve(new File([blob], file.name, { type: 'image/jpeg' })); }, 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

function encodeFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

async function initApp() {
  console.log("App Initialized. Fix version.");
  
  const bind = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  bind("btn-start", "click", startTrip);
  bind("btn-stop", "click", stopTrip);
  bind("btn-req-over", "click", requestOverlayPerm);
  bind("btn-req-loc", "click", requestLocationPerm);
  bind("perm-camera", "click", requestCameraPerm);
  bind("btn-finish-perms", "click", finishPermissions);
  bind("btn-modal-close", "click", closeModal);
  
  const mBox = document.querySelector('.modal-box');
  if(mBox) mBox.addEventListener('click', e => e.stopPropagation());

  const done = localStorage.getItem("els_setup_done");
  if (done) {
     showScreen("screen-main");
     checkActiveTrip();
  } else {
     showScreen("screen-permissions");
  }
}

document.addEventListener("DOMContentLoaded", initApp);

// Window Exports
window.startTrip = startTrip;
window.stopTrip = stopTrip;
window.handlePhotos = handlePhotos;
window.requestOverlayPerm = requestOverlayPerm;
window.closeModal = closeModal;
window.switchTab = (tab) => {
    document.getElementById('main-content').style.display = tab === 'home' ? 'block' : 'none';
    document.getElementById('tab-history').style.display = tab === 'history' ? 'block' : 'none';
    document.getElementById('tab-settings').style.display = tab === 'settings' ? 'block' : 'none';
    if(tab === 'history') loadHistory();
};
})();
