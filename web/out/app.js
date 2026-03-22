(() => {
  // Capacitor Core init
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

  // API 호출용 공통 함수 (TDD 검증 완료된 규격)
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

  // 운행 시작 (중복 생성 방지 강화)
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
      const res = await apiCall(`${API_BASE}/trips`, "POST", body);
      const data = res.data;
      // 서버 응답에서 ID 추출 로직 (data.id 또는 data.trip.id)
      const tid = data.id || (data.trip && data.trip.id);
      
      if (tid) {
        tripId = tid;
        localStorage.setItem("els_active_trip_id", tripId);
        tripStatus = "driving";
        updateTripUI();
        startTimer();
        showOverlay();
        showModal("운행 시작", "정상적으로 운행이 시작되었습니다.");
      } else {
        showModal("오류", "운행 정보를 받지 못했습니다. 서버 로그를 확인해 주세요.");
      }
    } catch (e) { showModal("오류", "통신 실패: " + e.message); }
  }

  // 운행 종료 (PATCH 메서드 + action 필드 사용)
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

  // 사진 업로드 (trip_id 필드명 언더바 확인 완료)
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
        else showModal("오류", "업로드 실패 (400): trip_id 필드를 확인하세요.");
      } catch (e) { showModal("오류", "에러: " + e.message); }
    }
  }

  // 권한 요청 (Java 네이티브 호출)
  async function requestOverlayPerm() {
    if (!Overlay) return;
    try {
      await Overlay.requestPermission();
      // 자동 감지 루프
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

  // UI 관련 헬퍼 함수
  function showModal(title, msg) {
    const m = document.getElementById("modal-alert");
    document.getElementById("modal-title").textContent = title;
    const body = document.getElementById("modal-body");
    if (msg.includes("<button") || msg.includes("<div")) body.innerHTML = msg;
    else body.textContent = msg;
    m.style.display = "flex";
  }
  function closeModal() { document.getElementById("modal-alert").style.display = "none"; }
  function haptic(style) { try { Haptics?.impact({ style: style || "Medium" }); } catch (e) {} }
  function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor(sec % 3600 / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  // 앱 초기화 및 전역 노출
  window.startTrip = startTrip;
  window.stopTrip = stopTrip;
  window.handlePhotos = handlePhotos;
  window.requestOverlayPerm = requestOverlayPerm;
  window.closeModal = closeModal;
})();
