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
      const timerStr = document.getElementById("trip-timer-display")?.textContent || "00:00:00";
      pipBox.innerHTML = '<div id="pip-status">' + (tripStatus === 'driving' ? '운행 중' : '일시정지') + '</div>' +
                         '<div id="pip-timer">' + timerStr + '</div>' +
                         '<div id="pip-gps">' + gpsStatus + '</div>';
      body.classList.add("pip-active");
    } else {
      body.classList.remove("pip-active");
      if (pipBox) pipBox.remove();
    }
  };

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
    const res = await api(API_BASE + "/trips", "POST", body);
    if (res.ok) {
      localStorage.setItem("els_active_trip_id", res.data.id);
      localStorage.setItem("els_active_trip_status", "driving");
      alert("운행 시작!"); location.reload();
    } else {
      alert("오류: " + JSON.stringify(res.data));
    }
    isBusy = false;
  };

  window.stopTrip = async function() {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id || !confirm("종료하시겠습니까?")) return;
    await api(API_BASE + "/trips/" + id, "PATCH", { action: "complete" });
    localStorage.removeItem("els_active_trip_id");
    localStorage.removeItem("els_active_trip_status");
    alert("운행 종료되었습니다."); location.reload();
  };

  window.handlePhotos = async function(event) {
    const id = localStorage.getItem('els_active_trip_id');
    if (!id) { alert("운행 정보가 없습니다."); return; }
    const files = event.target.files;
    for (let file of files) {
      const base64 = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      const res = await api(API_BASE + "/photos", "POST", { trip_id: id, photos: [{ name: file.name, type: "image/jpeg", base64 }] });
      if (res.ok) alert("사진 업로드 성공");
      else alert("실패: " + JSON.stringify(res.data));
    }
  };

  window.openTripDetail = async function(id) {
    const res = await api(API_BASE + "/trips/" + id, "GET");
    if (!res.ok) return;
    const t = res.data;
    document.getElementById("modal-body").innerHTML = 
      '<div style="text-align:left; color:white; padding:10px;">' +
        '<p>번호: ' + t.container_number + '</p>' +
        '<p>상태: ' + t.status + '</p>' +
        '<button onclick="window.stopTrip()" style="width:100%; padding:10px; background:red; color:white; border:none; border-radius:6px; margin-top:10px;">즉시 종료</button>' +
      '</div>';
    document.getElementById("modal-alert").style.display = "flex";
  };

  window.closeModal = () => document.getElementById("modal-alert").style.display = "none";

  document.addEventListener("DOMContentLoaded", () => {
    const phone = localStorage.getItem("els_phone");
    if (phone) {
      api(API_BASE + "/trips?mode=my&phone=" + phone, "GET").then(res => {
        if (res.ok) {
          const list = document.getElementById("history-list");
          if (list) {
            list.innerHTML = res.data.trips.map(t => 
              '<div onclick="window.openTripDetail(\'' + t.id + '\')" style="padding:15px; border-bottom:1px solid #333;">' +
                '<div style="display:flex; justify-content:space-between;">' +
                  '<strong>' + (t.container_number || '-') + '</strong>' +
                  '<span style="color:' + (t.status==='driving'?'#238636':'#8b949e') + '">' + (t.status==='driving'?'운행 중':'종료') + '</span>' +
                '</div>' +
              '</div>'
            ).join('');
          }
        }
      });
    }
  });
})();