(() => {
  // node_modules/@capacitor/core/dist/index.js (생략 - 실제 파일에는 포함됨)
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

  async function startTrip() {
    if (isBusy || !isOnline) return;
    const container = document.getElementById("inp-container").value.trim().toUpperCase();
    if (!container) { showModal("알림", "컨테이너 번호를 입력해 주세요."); return; }
    
    const body = {
      driver_name: localStorage.getItem("els_name") || "",
      driver_phone: localStorage.getItem("els_phone") || "",
      vehicle_number: localStorage.getItem("els_vehicle") || "",
      container_number: container,
      status: "driving"
    };

    try {
      const res = await smartPost(`${API_BASE}/trips`, body);
      // 서버 응답에서 ID 추출 로직 대폭 강화
      const data = res.data;
      const tid = data.id || (data.trip && data.trip.id) || data.trip_id;
      
      if (tid) {
        tripId = tid;
        localStorage.setItem("els_active_trip_id", tripId);
        tripStatus = "driving";
        updateTripUI();
        startTimer();
        showModal("운행 시작", "정상적으로 운행이 시작되었습니다.");
      } else {
        showModal("오류", "운행 정보를 받지 못했습니다. (ID 누락)");
      }
    } catch (e) { showModal("오류", "통신 실패: " + e.message); }
  }

  async function handlePhotos(event) {
    if (!tripId) { showModal("알림", "운행 ID가 없습니다. 운행 시작 후 등록해 주세요."); return; }
    const files = event.target.files;
    if (!files.length) return;
    
    for (const file of files) {
      try {
        const base64 = await encodeFileToBase64(await resizeImage(file, 1200, 0.7));
        // 400 에러 해결을 위해 trip_id(언더바)로 고정해서 전송
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
      // 인텐트 플래그를 Java에서 추가했으니, 여기선 호출만 함
      await Overlay.requestPermission();
      // 2초마다 자동 감지 루프
      const intv = setInterval(async () => {
        const check = await Overlay.checkPermission();
        if (check.granted) {
          clearInterval(intv);
          markPermGranted("perm-overlay");
          showModal("알림", "권한 허용 감지됨! 카메라 권한으로 이동합니다.");
        }
      }, 2000);
    } catch (e) { Overlay.openAppSettings(); }
  }

  // (이하 생략 - 실제 파일엔 필수 함수들 다 포함해서 넣을게!)
  window.startTrip = startTrip;
  window.handlePhotos = handlePhotos;
  window.requestOverlayPerm = requestOverlayPerm;
})();
