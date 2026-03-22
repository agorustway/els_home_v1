(() => {
  // Capacitor Native Bridge Bridge
  const API_BASE = "https://nollae.com/api/vehicle-tracking";
  let tripId = localStorage.getItem('els_active_trip_id') || null;
  let tripStatus = null;
  let isBusy = false;

  // ---------------- Core API ----------------
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

  // ---------------- UI Functions (Explicitly Window) ----------------
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
      localStorage.setItem("els_active_trip_id", tripId);
      tripStatus = "driving";
      alert("운행이 시작되었습니다.");
      location.reload(); // UI 초기화를 위해 새로고침 (가장 확실함)
    } else {
      alert("시작 실패: " + (res.data?.error || "서버 오류"));
    }
    isBusy = false;
  };

  window.stopTrip = async function() {
    if (!tripId) return;
    if (!confirm("운행을 종료할까요?")) return;
    
    const res = await api(`${API_BASE}/trips/${tripId}`, "PATCH", { action: "complete" });
    if (res.ok) {
      localStorage.removeItem("els_active_trip_id");
      alert("종료되었습니다.");
      location.reload();
    }
  };

  window.handlePhotos = async function(event) {
    if (!tripId) { alert("운행 ID가 없습니다. 먼저 운행을 시작하세요."); return; }
    const file = event.target.files[0];
    if (!file) return;

    const base64 = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });

    const res = await api(`${API_BASE}/photos`, "POST", {
      trip_id: tripId,
      photos: [{ name: file.name, type: "image/jpeg", base64 }]
    });

    if (res.ok) alert("사진 업로드 성공!");
    else alert("업로드 실패 (400): " + JSON.stringify(res.data));
  };

  window.requestOverlayPerm = async function() {
    if (typeof Capacitor === 'undefined') return;
    try {
      const Overlay = Capacitor.Plugins.Overlay;
      await Overlay.requestPermission();
      alert("설정 창을 열었습니다. 허용 후 앱으로 돌아오세요.");
    } catch (e) { alert("설정 창 호출 실패: " + e.message); }
  };

  window.openTripDetail = async function(id) {
    if (!id) return;
    const res = await api(`${API_BASE}/trips/${id}`, "GET");
    if (!res.ok) { alert("정보 조회 실패"); return; }
    
    const t = res.data;
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `
      <div style="text-align:left; color:#e6edf3;">
        <p><strong>컨테이너:</strong> ${t.container_number}</p>
        <p><strong>차량:</strong> ${t.vehicle_number}</p>
        <p><strong>상태:</strong> ${t.status === 'driving' ? '운행중' : '종료'}</p>
        <button onclick="window.forceFinish('${t.id}')" style="background:#f85149; color:white; width:100%; padding:10px; border:none; border-radius:6px; margin-top:10px;">강제종료</button>
      </div>
    `;
    document.getElementById("modal-alert").style.display = "flex";
  };

  window.forceFinish = async function(id) {
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
    if (res.ok) { alert("강제 종료 성공"); location.reload(); }
  };

  window.closeModal = () => document.getElementById("modal-alert").style.display = "none";

  // ---------------- Init ----------------
  async function init() {
    // 히스토리 로드
    const phone = localStorage.getItem("els_phone");
    if (phone) {
      const res = await api(`${API_BASE}/trips?mode=my&phone=${phone}`, "GET");
      if (res.ok) {
        const list = document.getElementById("history-list");
        if (list) {
          list.innerHTML = res.data.trips.map(t => `
            <div onclick="window.openTripDetail('${t.id}')" style="padding:15px; border-bottom:1px solid #30363d; cursor:pointer;">
              <div style="font-weight:bold;">${t.container_number || '미입력'}</div>
              <div style="font-size:12px; color:#8b949e;">${new Date(t.started_at).toLocaleString()}</div>
            </div>
          `).join('');
        }
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
