(() => {
  // Capacitor Core init (실제 파일 생성 시 Capacitor 번들 포함)
  const API_BASE = "https://nollae.com/api/vehicle-tracking";
  let tripId = localStorage.getItem('els_active_trip_id') || null;
  let tripStatus = null;
  let isBusy = false;
  let historyData = [];

  // API 호출 규격 (TDD 기반)
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

  // ---------------- UI Functions ----------------
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
      seal_number: document.getElementById("inp-seal")?.value.trim().toUpperCase() || "",
      container_type: document.getElementById("inp-cont-size")?.value || "40FT",
      container_kind: document.getElementById("inp-cont-type")?.value || "DRY"
    };

    const res = await api(`${API_BASE}/trips`, "POST", body);
    if (res.ok) {
      // TDD 결과 반영: res.data.id 또는 res.data.trip.id 대응
      tripId = res.data.id || (res.data.trip && res.data.trip.id);
      localStorage.setItem("els_active_trip_id", tripId);
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
      alert("종료되었습니다.");
      location.reload();
    } else {
      alert("종료 실패");
    }
  };

  window.handlePhotos = async function(event) {
    const id = tripId || localStorage.getItem('els_active_trip_id');
    if (!id) { alert("운행 정보가 없습니다. 운행 시작 후 업로드하세요."); return; }
    
    const files = event.target.files;
    if (!files.length) return;

    for (let file of files) {
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      const res = await api(`${API_BASE}/photos`, "POST", {
        trip_id: id,
        photos: [{ name: file.name, type: "image/jpeg", base64 }]
      });
      if (res.ok) alert("사진 업로드 성공!");
      else alert("업로드 실패: " + JSON.stringify(res.data));
    }
  };

  window.openTripDetail = async function(id) {
    if (!id) return;
    const res = await api(`${API_BASE}/trips/${id}`, "GET");
    if (!res.ok) { alert("상세 조회 실패 (405 해결 필요)"); return; }
    
    const t = res.data;
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `
      <div style="text-align:left; color:#e6edf3; padding:10px;">
        <div id="view-mode">
          <p><strong>컨테이너:</strong> ${t.container_number}</p>
          <p><strong>씰 번호:</strong> ${t.seal_number || '-'}</p>
          <p><strong>규격:</strong> ${t.container_type} / ${t.container_kind}</p>
          <p><strong>상태:</strong> ${t.status === 'driving' ? '운행중' : '종료'}</p>
          <button onclick="window.enableEditMode()" style="width:100%; padding:10px; margin-top:10px; background:#30363d; color:white; border:1px solid #8b949e; border-radius:6px;">정보 수정</button>
          ${t.status === 'driving' ? `<button onclick="window.forceFinish('${t.id}')" style="background:#f85149; color:white; width:100%; padding:10px; border:none; border-radius:6px; margin-top:10px;">강제종료</button>` : ""}
        </div>
        <div id="edit-mode" style="display:none;">
          <input type="text" id="edit-cont" class="inp-main" value="${t.container_number}" style="margin-bottom:10px;">
          <input type="text" id="edit-seal" class="inp-main" value="${t.seal_number || ''}" placeholder="씰 번호" style="margin-bottom:10px;">
          <button onclick="window.saveEdit('${t.id}')" style="width:100%; padding:10px; background:#238636; color:white; border:none; border-radius:6px;">저장</button>
          <button onclick="window.disableEditMode()" style="width:100%; padding:10px; margin-top:5px; background:transparent; color:#8b949e; border:none;">취소</button>
        </div>
      </div>
    `;
    document.getElementById("modal-alert").style.display = "flex";
  };

  window.enableEditMode = () => { document.getElementById("view-mode").style.display = "none"; document.getElementById("edit-mode").style.display = "block"; };
  window.disableEditMode = () => { document.getElementById("view-mode").style.display = "block"; document.getElementById("edit-mode").style.display = "none"; };

  window.saveEdit = async function(id) {
    const container_number = document.getElementById("edit-cont").value;
    const seal_number = document.getElementById("edit-seal").value;
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { container_number, seal_number });
    if (res.ok) { alert("수정 성공"); location.reload(); }
  };

  window.forceFinish = async function(id) {
    if (!confirm("정말 강제 종료하시겠습니까?")) return;
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
    if (res.ok) { alert("종료 성공"); location.reload(); }
  };

  window.requestOverlayPerm = async function() {
    if (typeof Capacitor === 'undefined') return;
    try {
      const Overlay = Capacitor.Plugins.Overlay;
      alert("잠시 후 설정창으로 이동합니다.\n목록에서 '다른 앱 위에 표시'를 찾아 '허용'으로 바꿔주세요.");
      await Overlay.requestPermission();
    } catch (e) { alert("설정창 호출 실패: " + e.message); }
  };

  window.closeModal = () => document.getElementById("modal-alert").style.display = "none";

  // ---------------- Initialization ----------------
  async function init() {
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
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  
  // Capacitor App State Change
  if (typeof Capacitor !== 'undefined') {
    Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) init(); // 다시 돌아올 때 목록 갱신
    });
  }
})();
