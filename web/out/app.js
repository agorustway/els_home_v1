(() => {
  const API_BASE = "https://nollae.com/api/vehicle-tracking";
  let tripId = localStorage.getItem('els_active_trip_id');
  let tripStatus = localStorage.getItem('els_active_trip_status');
  let elapsedSeconds = 0;
  let timerInterval = null;
  let isBusy = false;

  async function api(url, method, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      const data = await res.json();
      return { ok: res.status < 300, status: res.status, data };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---------------- PIP UI 제어 (안드로이드 16 최적화) ----------------
  window.onPipModeChanged = function(isInPip) {
    const body = document.body;
    let pipBox = document.getElementById("pip-container");
    
    if (isInPip) {
      if (!pipBox) {
        pipBox = document.createElement("div");
        pipBox.id = "pip-container";
        document.body.appendChild(pipBox);
      }
      const gpsStatus = document.getElementById("gps-indicator")?.classList.contains("gps-on") ? "GPS ON" : "GPS OFF";
      pipBox.innerHTML = `
        <div id="pip-status">${tripStatus === 'driving' ? '운행 중' : '일시정지'}</div>
        <div id="pip-timer">${document.getElementById("trip-timer-display")?.textContent || "00:00:00"}</div>
        <div id="pip-gps">${gpsStatus}</div>
      `;
      body.classList.add("pip-active");
    } else {
      body.classList.remove("pip-active");
      if (pipBox) pipBox.innerHTML = "";
    }
  };

  // ---------------- 운행 시작 (중복 차단 강화) ----------------
  window.startTrip = async function() {
    if (isBusy) return;
    const container = document.getElementById("inp-container")?.value.trim().toUpperCase();
    if (!container) { alert("컨테이너 번호를 입력하세요."); return; }
    
    isBusy = true;
    const body = {
      driver_name: localStorage.getItem("els_name"),
      driver_phone: localStorage.getItem("els_phone"),
      vehicle_number: localStorage.getItem("els_vehicle"),
      container_number: container,
      status: "driving"
    };

    const res = await api(`${API_BASE}/trips`, "POST", body);
    if (res.ok) {
      const tid = res.data.id;
      localStorage.setItem("els_active_trip_id", tid);
      localStorage.setItem("els_active_trip_status", "driving");
      alert("운행 시작!");
      location.reload();
    } else {
      alert("오류: " + (res.data?.error || "서버 응답 없음"));
    }
    isBusy = false;
  };

  // ---------------- 운행 종료 (UI 즉시 갱신) ----------------
  window.stopTrip = async function() {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id) return;
    if (!confirm("운행을 종료하시겠습니까?")) return;
    
    // UI 우선 갱신 (사용자 경험 중시)
    localStorage.removeItem("els_active_trip_id");
    localStorage.removeItem("els_active_trip_status");
    
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
    if (res.ok) {
      alert("운행이 종료되었습니다.");
      location.reload();
    } else {
      alert("서버 종료 처리 실패 (로컬은 정리됨)");
      location.reload();
    }
  };

  // ---------------- 사진 업로드 (이미지 압축 보강) ----------------
  window.handlePhotos = async function(event) {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id) { alert("운행 ID가 없습니다."); return; }
    
    const files = event.target.files;
    if (!files.length) return;

    for (let file of files) {
      const resized = await resizeImage(file, 1000, 0.6); // 1000px로 축소하여 S3 부담 완화
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(resized);
      });

      const res = await api(`${API_BASE}/photos`, "POST", {
        trip_id: id,
        photos: [{ name: file.name, type: "image/jpeg", base64 }]
      });
      if (res.ok) alert("사진 업로드 성공");
      else alert("실패: " + JSON.stringify(res.data));
    }
  };

  async function resizeImage(file, maxSize, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxSize) { h *= maxSize / w; w = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => resolve(new File([b], file.name, {type:'image/jpeg'})), 'image/jpeg', quality);
      };
    });
  }

  // ---------------- 초기화 ----------------
  async function init() {
    const phone = localStorage.getItem("els_phone");
    if (!phone) return;
    const res = await api(`${API_BASE}/trips?mode=my&phone=${phone}`, "GET");
    if (res.ok) {
      const list = document.getElementById("history-list");
      if (list) {
        list.innerHTML = res.data.trips.map(t => `
          <div onclick="window.openTripDetail('${t.id}')" style="padding:15px; border-bottom:1px solid #333;">
            <div style="display:flex; justify-content:space-between;">
              <strong>${t.container_number || '-'}</strong>
              <span style="color:${t.status==='driving'?'#238636':'#8b949e'}">${t.status==='driving'?'운행 중':'종료'}</span>
            </div>
            <div style="font-size:12px; color:#666;">${new Date(t.started_at).toLocaleString()}</div>
          </div>
        `).join('');
      }
    }
  }

  window.openTripDetail = async function(id) {
    const res = await api(`${API_BASE}/trips/${id}`, "GET");
    if (!res.ok) return;
    const t = res.data;
    document.getElementById("modal-body").innerHTML = `
      <div style="text-align:left; padding:10px;">
        <p>컨테이너: ${t.container_number}</p>
        <p>상태: ${t.status}</p>
        <button onclick="window.stopTrip()" style="width:100%; padding:10px; background:red; color:white; border:none; border-radius:6px;">즉시 종료</button>
      </div>
    `;
    document.getElementById("modal-alert").style.display = "flex";
  };

  document.addEventListener("DOMContentLoaded", init);
})();
