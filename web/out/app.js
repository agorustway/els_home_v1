(() => {
  // Capacitor Core (init_dist)
  var API_BASE = "https://nollae.com/api/vehicle-tracking";
  var tripId = localStorage.getItem("els_active_trip_id") || null;
  var tripStatus = null;
  var timerInterval = null;
  var elapsedSeconds = 0;
  var photos = [];
  var isOnline = navigator.onLine;
  var isBusy = false;

  async function safeJson(res) {
    try {
      if (res && typeof res.json === "function") return await res.json();
      return res.data || res;
    } catch (e) { return res; }
  }

  // POST 요청용
  async function smartPost(url, payload) {
    if (isBusy) return { ok: false, status: 0, data: { error: "처리 중..." } };
    isBusy = true;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await safeJson(res);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
    } catch (e) { throw e; } finally { isBusy = false; }
  }

  // PATCH 요청용 (종료/수정)
  async function smartPatch(url, payload) {
    if (isBusy) return { ok: false, status: 0, data: { error: "처리 중..." } };
    isBusy = true;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await safeJson(res);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
    } catch (e) { throw e; } finally { isBusy = false; }
  }

  async function startTrip() {
    if (isBusy || !isOnline) return;
    const container = document.getElementById("inp-container").value.trim().toUpperCase();
    if (!container) { showModal("알림", "컨테이너 번호를 입력해 주세요."); return; }
    
    haptic("Heavy");
    const body = {
      driver_name: localStorage.getItem("els_name") || "",
      driver_phone: localStorage.getItem("els_phone") || "",
      vehicle_number: localStorage.getItem("els_vehicle") || "",
      container_number: container,
      seal_number: (document.getElementById("inp-seal")?.value || "").trim().toUpperCase(),
      container_type: document.getElementById("inp-cont-size")?.value || "40FT",
      container_kind: document.getElementById("inp-cont-type")?.value || "DRY"
    };

    try {
      const res = await smartPost(`${API_BASE}/trips`, body);
      const data = res.data;
      const tid = data.id || (data.trip && data.trip.id) || data.trip_id;
      
      if (tid) {
        tripId = tid;
        localStorage.setItem("els_active_trip_id", tripId);
        tripStatus = "driving";
        updateTripUI();
        startTimer();
        showOverlay();
        showModal("운행 시작", "정상적으로 운행이 시작되었습니다.");
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
      // PATCH 메서드로 action: complete 전달
      const res = await smartPatch(`${API_BASE}/trips/${idToStop}`, { action: "complete" });
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
    if (!tripId) {
      tripId = localStorage.getItem("els_active_trip_id");
    }
    if (!tripId) { 
      showModal("알림", "운행 정보가 없습니다. 운행 시작 후 등록해 주세요."); 
      return; 
    }
    const files = event.target.files;
    if (!files.length) return;
    
    for (const file of files) {
      try {
        const base64 = await encodeFileToBase64(await resizeImage(file, 1200, 0.7));
        const res = await smartPost(`${API_BASE}/photos`, {
          trip_id: tripId, 
          photos: [{ name: file.name, type: "image/jpeg", base64 }]
        });
        if (res.ok) showModal("성공", "사진이 업로드되었습니다.");
        else showModal("오류", "업로드 실패: " + (res.data.error || res.status));
      } catch (e) { showModal("오류", "에러: " + e.message); }
    }
  }

  async function requestOverlayPerm() {
    if (!Overlay) return;
    try {
      await Overlay.requestPermission();
      const intv = setInterval(async () => {
        const check = await Overlay.checkPermission();
        if (check.granted) {
          clearInterval(intv);
          markPermGranted("perm-overlay");
          showModal("알림", "권한 허용 감지됨!");
        }
      }, 2000);
    } catch (e) { Overlay.openAppSettings(); }
  }

  // UI 관련 필수 함수들
  function showModal(title, msg) {
    document.getElementById("modal-title").textContent = title;
    const body = document.getElementById("modal-body");
    if (msg.includes("<button") || msg.includes("<div")) body.innerHTML = msg;
    else body.textContent = msg;
    document.getElementById("modal-alert").style.display = "flex";
  }
  function closeModal() { document.getElementById("modal-alert").style.display = "none"; }
  function haptic(style) { try { Haptics?.impact({ style: style || "Medium" }); } catch (e) {} }
  function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor(sec % 3600 / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  // 전역 노출
  window.startTrip = startTrip;
  window.stopTrip = stopTrip;
  window.handlePhotos = handlePhotos;
  window.requestOverlayPerm = requestOverlayPerm;
  window.closeModal = closeModal;
})();
