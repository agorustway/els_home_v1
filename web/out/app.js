(() => {
  const API_BASE = "https://nollae.com/api/vehicle-tracking";
  let tripId = localStorage.getItem('els_active_trip_id');
  let tripStatus = localStorage.getItem('els_active_trip_status');
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

  // ---------------- 운행 시작 ----------------
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
      const tid = res.data.id || (res.data.trip && res.data.trip.id);
      localStorage.setItem("els_active_trip_id", tid);
      localStorage.setItem("els_active_trip_status", "driving");
      alert("운행이 시작되었습니다. ID: " + tid);
      location.reload();
    } else {
      alert("시작 실패: " + JSON.stringify(res.data));
    }
    isBusy = false;
  };

  // ---------------- 운행 종료 ----------------
  window.stopTrip = async function() {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id) { alert("종료할 운행 ID가 없습니다."); return; }
    if (!confirm("운행을 종료할까요?")) return;
    
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { action: "complete" });
    if (res.ok) {
      localStorage.removeItem("els_active_trip_id");
      localStorage.removeItem("els_active_trip_status");
      alert("정상 종료되었습니다.");
      location.reload();
    } else {
      alert("종료 실패: " + JSON.stringify(res.data));
    }
  };

  // ---------------- 사진 업로드 (동기식) ----------------
  window.handlePhotos = async function(event) {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id) { alert("운행 ID가 로컬에 없습니다. 먼저 운행을 시작하세요."); return; }
    
    const files = event.target.files;
    if (!files.length) return;

    alert(files.length + "장의 사진 업로드를 시작합니다.");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      const res = await api(`${API_BASE}/photos`, "POST", {
        trip_id: id,
        photos: [{ name: file.name, type: "image/jpeg", base64 }]
      });

      if (res.ok) console.log("Upload success:", i);
      else { alert(i + "번째 사진 실패: " + JSON.stringify(res.data)); break; }
    }
    alert("사진 처리가 완료되었습니다.");
  };

  // ---------------- 기록 수정 ----------------
  window.openTripDetail = async function(id) {
    if (!id) return;
    const res = await api(`${API_BASE}/trips/${id}`, "GET");
    if (!res.ok) { alert("조회 실패"); return; }
    
    const t = res.data;
    const modalBody = document.getElementById("modal-body");
    modalBody.innerHTML = `
      <div style="text-align:left; color:#e6edf3; padding:10px;">
        <div id="v-mode">
          <p><strong>컨테이너:</strong> ${t.container_number}</p>
          <p><strong>씰:</strong> ${t.seal_number || '-'}</p>
          <p><strong>상태:</strong> ${t.status}</p>
          <button onclick="window.setEditMode(true)" style="width:100%; padding:10px; background:#30363d; color:white; border-radius:6px; margin-top:10px;">수정하기</button>
          ${t.status === 'driving' ? `<button onclick="window.stopTrip()" style="width:100%; padding:10px; background:#f85149; color:white; border-radius:6px; margin-top:10px;">운행종료</button>` : ""}
        </div>
        <div id="e-mode" style="display:none;">
          <input type="text" id="e-cont" class="inp-main" value="${t.container_number}" style="margin-bottom:10px;">
          <input type="text" id="e-seal" class="inp-main" value="${t.seal_number || ''}" placeholder="씰 번호" style="margin-bottom:10px;">
          <button onclick="window.saveEdit('${t.id}')" style="width:100%; padding:10px; background:#238636; color:white; border-radius:6px;">저장</button>
          <button onclick="window.setEditMode(false)" style="width:100%; padding:10px; background:transparent; color:#8b949e; border:none; margin-top:5px;">취소</button>
        </div>
      </div>
    `;
    document.getElementById("modal-alert").style.display = "flex";
  };

  window.setEditMode = (edit) => {
    document.getElementById("v-mode").style.display = edit ? "none" : "block";
    document.getElementById("e-mode").style.display = edit ? "block" : "none";
  };

  window.saveEdit = async function(id) {
    const container_number = document.getElementById("e-cont").value;
    const seal_number = document.getElementById("e-seal").value;
    const res = await api(`${API_BASE}/trips/${id}`, "PATCH", { container_number, seal_number });
    if (res.ok) { alert("수정 성공"); location.reload(); }
    else { alert("수정 실패: " + JSON.stringify(res.data)); }
  };

  // ---------------- 권한 설정 ----------------
  window.requestOverlayPerm = async function() {
    if (typeof Capacitor === 'undefined') return;
    alert("애플리케이션 정보 창으로 이동합니다.\n'다른 앱 위에 표시'를 찾아 '허용'을 눌러주세요.");
    try {
      await Capacitor.Plugins.Overlay.openAppSettings();
    } catch (e) { alert("오류: " + e.message); }
  };

  window.closeModal = () => document.getElementById("modal-alert").style.display = "none";

  // ---------------- PIP UI 제어 ----------------
  window.onPipModeChanged = function(isInPip) {
    const body = document.body;
    const mainContent = document.getElementById("main-content");
    const nav = document.querySelector(".nav-bar"); // 하단 탭바
    
    if (isInPip) {
      // PIP 모드: 타이머와 컨테이너 번호만 강조
      body.classList.add("pip-active");
      // 기존 모달 등 방해 요소 숨김
      window.closeModal();
    } else {
      // 일반 모드 복귀
      body.classList.remove("pip-active");
    }
  };

  // ---------------- 초기화 ----------------
  async function init() {
    const phone = localStorage.getItem("els_phone");
    if (!phone) return;
    const res = await api(`${API_BASE}/trips?mode=my&phone=${phone}`, "GET");
    if (res.ok) {
      const list = document.getElementById("history-list");
      if (list) {
        list.innerHTML = res.data.trips.map(t => `
          <div onclick="window.openTripDetail('${t.id}')" style="padding:15px; border-bottom:1px solid #30363d; cursor:pointer;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:bold; font-size:16px;">${t.container_number || '미입력'}</div>
              <div style="background:${t.status==='driving'?'#238636':'#8b949e'}; font-size:11px; padding:2px 6px; border-radius:4px;">${t.status==='driving'?'운행중':'종료'}</div>
            </div>
            <div style="font-size:12px; color:#8b949e; margin-top:5px;">${new Date(t.started_at).toLocaleString()}</div>
          </div>
        `).join('');
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
