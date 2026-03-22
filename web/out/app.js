(() => {
  // ELS Solution Optimized JS
  const API_BASE = "https://nollae.com/api/vehicle-tracking";
  let tripId = localStorage.getItem('els_active_trip_id') || null;
  let tripStatus = localStorage.getItem('els_active_trip_status') || null;
  let timerInterval = null;
  let elapsedSeconds = 0;
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

  // ---------------- Tmap 스타일 오버레이 제어 ----------------
  window.showOverlay = async function() {
    if (typeof Capacitor === 'undefined' || !tripId || tripStatus !== 'driving') return;
    try {
      await Capacitor.Plugins.Overlay.showOverlay({
        timer: formatTime(elapsedSeconds),
        container: document.getElementById('inp-container')?.value || localStorage.getItem('els_last_container') || '-',
        tripId: tripId,
        status: tripStatus
      });
    } catch (e) {}
  };

  window.hideOverlay = async function() {
    if (typeof Capacitor === 'undefined') return;
    try { await Capacitor.Plugins.Overlay.hideOverlay(); } catch (e) {}
  };

  // ---------------- 운행 로직 ----------------
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
      tripId = res.data.id || (res.data.trip && res.data.trip.id);
      tripStatus = "driving";
      localStorage.setItem("els_active_trip_id", tripId);
      localStorage.setItem("els_active_trip_status", tripStatus);
      localStorage.setItem("els_last_container", container);
      startTimer();
      alert("운행이 시작되었습니다.");
      location.reload();
    } else {
      alert("시작 실패: " + (res.data?.error || "서버 오류"));
    }
    isBusy = false;
  };

  window.stopTrip = async function() {
    const id = tripId || localStorage.getItem('els_active_trip_id');
    if (!id) return;
    if (!confirm("운행을 종료할까요?")) return;
    
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
    if (res.ok) {
      localStorage.removeItem("els_active_trip_id");
      localStorage.removeItem("els_active_trip_status");
      tripId = null;
      tripStatus = null;
      clearInterval(timerInterval);
      await window.hideOverlay();
      alert("종료되었습니다.");
      location.reload();
    }
  };

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (tripStatus === 'driving') {
        elapsedSeconds++;
        const str = formatTime(elapsedSeconds);
        const d = document.getElementById('trip-timer-display');
        if(d) d.textContent = str;
        // 5초마다 오버레이 정보 갱신
        if (elapsedSeconds % 5 === 0) {
          if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.Overlay) {
            Capacitor.Plugins.Overlay.updateOverlay({ timer: str, tripId, status: tripStatus }).catch(()=>{});
          }
        }
      }
    }, 1000);
  }

  function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor(sec % 3600 / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  // ---------------- 초기화 및 이벤트 바인딩 ----------------
  async function init() {
    if (typeof Capacitor !== 'undefined') {
      const { App } = Capacitor.Plugins;
      // 앱 상태 감지 (Tmap 스타일 핵심)
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && tripStatus === 'driving') window.showOverlay();
        else if (isActive) window.hideOverlay();
      });
    }

    const phone = localStorage.getItem("els_phone");
    if (phone) {
      const res = await api(`${API_BASE}/trips?mode=my&phone=${phone}`, "GET");
      if (res.ok) {
        const list = document.getElementById("history-list");
        if (list) {
          list.innerHTML = res.data.trips.map(t => `
            <div onclick="window.openTripDetail('${t.id}')" style="padding:15px; border-bottom:1px solid #30363d; cursor:pointer;">
              <div style="display:flex; justify-content:space-between;">
                <div style="font-weight:bold; font-size:16px;">${t.container_number || '미입력'}</div>
                <div style="background:${t.status==='driving'?'#238636':'#8b949e'}; font-size:11px; padding:2px 6px; border-radius:4px;">${t.status==='driving'?'운행중':'종료'}</div>
              </div>
              <div style="font-size:12px; color:#8b949e; margin-top:5px;">${new Date(t.started_at).toLocaleString()} | ${t.vehicle_number}</div>
            </div>
          `).join('');
        }
        
        // 현재 운행 중인게 있다면 타이머 재시작
        const active = res.data.trips.find(t => t.status === 'driving');
        if (active) {
          tripId = active.id;
          tripStatus = 'driving';
          const start = new Date(active.started_at).getTime();
          elapsedSeconds = Math.floor((Date.now() - start) / 1000);
          startTimer();
        }
      }
    }
  }

  // 전역 노출 및 초기화
  window.startTrip = startTrip;
  window.stopTrip = stopTrip;
  window.openTripDetail = async function(id) {
    const res = await api(`${API_BASE}/trips/${id}`, "GET");
    if (!res.ok) return;
    const t = res.data;
    document.getElementById("modal-body").innerHTML = `
      <div style="text-align:left; color:#e6edf3; padding:10px;">
        <p><strong>컨테이너:</strong> ${t.container_number}</p>
        <p><strong>차량:</strong> ${t.vehicle_number}</p>
        <p><strong>상태:</strong> ${t.status === 'driving' ? '운행중' : '종료'}</p>
        ${t.status === 'driving' ? `<button onclick="window.stopTrip()" style="background:#f85149; color:white; width:100%; padding:10px; border:none; border-radius:6px; margin-top:10px;">운행종료</button>` : ""}
      </div>
    `;
    document.getElementById("modal-alert").style.display = "flex";
  };
  window.closeModal = () => document.getElementById("modal-alert").style.display = "none";
  window.handlePhotos = async function(event) {
    if (!tripId) { alert("운행 정보가 없습니다."); return; }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const res = await api(`${API_BASE}/photos`, "POST", { trip_id: tripId, photos: [{ name: file.name, type: "image/jpeg", base64 }] });
      if (res.ok) alert("사진 업로드 성공!");
      else alert("실패: " + JSON.stringify(res.data));
    };
    reader.readAsDataURL(file);
  };

  document.addEventListener("DOMContentLoaded", init);
})();
