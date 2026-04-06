# 🗺️ ELS Driver Map Engine V2 업그레이드 계획서 (v4.8.0 프로젝트)

> **🚀 목표**: 정적 지도(Static Maps)의 한계를 넘어, 네이버 동적 지도 SDK(v3)를 도입하여 마커 드리프트 및 레이아웃 불안정성(고무줄 현상)을 근본적으로 해결하고 네이티브 수준의 사용자 경험을 제공함.

---

## 🔗 1. 핵심 참조 (Reference)
- **네이버 클라우드 Maps API 개요**: [guide.ncloud-docs.com](https://guide.ncloud-docs.com/docs/application-maps-overview)
- **Maps JavaScript API v3 기술문서**: [navermaps.github.io/maps.js.ncp/](https://navermaps.github.io/maps.js.ncp/)
- **웹뷰(WebView) 연동 가이드**: 안드로이드 WebView 내에서 `setDomStorageEnabled(true)` 및 스크립트 로드 필수 확인.

---

## ⚠️ 2. 현재 문제점 분석 (As-Is)
1. **마커 드리프트 (Marker Drift)**:
   - 정적 지도 이미지 위에 별도의 DOM 요소로 마커를 얹는 방식.
   - 지도 이미지 드래그(`translate3d`)와 마커의 좌표 계산이 실시간으로 동기화되지 않아 지도를 움직이면 마커가 떠다님.
2. **고무줄 현상 (Rubber-band Layout)**:
   - 하단 차량 목록 패널이 나타날 때 지도 컨테이너의 높이(`height`)를 직접 줄임.
   - 지도 엔진이 리사이즈 이벤트를 감지하고 이미지를 다시 요청하는 과정에서 지도가 늘어났다 줄어드는 시각적 불쾌감 발생.
3. **인터랙션 부재**:
   - 마커 클릭 시 단순 경로 표시만 가능하며, 자연스러운 `PanTo`나 `Zoom` 연동이 부족함.

---

## 🏗️ 3. 개선 아키텍처 (To-Be: Dynamic SDK)

### 3-1. 핵심 엔진 교체
- **Static API → JavaScript SDK v3**:
  - `<script src=".../maps.js?ncpClientId=YOUR_ID"></script>` 로드.
  - `naver.maps.Map` 객체를 통한 네이ATIVE 드래그/줌 지원.
  - `naver.maps.Marker`, `naver.maps.Polyline` 객체를 사용하여 지도 엔진 내부에서 마커 관리 (드리프트 원천 봉쇄).

### 3-2. UI 구조 개편 (Overlay-First)
- **Map Container**: 화면 전체(`100vh`)를 차지하며 고정.
- **Floating Panels (Z-Index)**:
  - 하단 차량 리스트 및 상세 정보창은 지도를 밀어내는 방식이 아닌, 지도 위에 떠 있는 **오버레이(Overlay)** 레이어로 구현.
  - `position: absolute; bottom: 0; left: 0; width: 100%;` 활용.
  - 슬라이드 업/다운 애니메이션 시 지도 레이아웃은 전혀 변하지 않음.

---

## 🛠️ 4. 세부 구현 전략

### 4-1. 마커 및 인터랙션 로직
- **운행 중인 차량**: 밝은 색상 마커 + 차량 번호 라벨 상시 노출.
- **운행 종료 차량**: 무채색(Gray) 또는 아이콘 축소, 클러스터링(필요 시) 적용.
- **클릭 이벤트**:
  - 마커 클릭 시 해당 차량을 중심으로 `map.setCenter()` 및 `map.setZoom(15)` 수행.
  - 하단 오버레이가 "상세 정보창"으로 전환되며 요약 정보 표시.

### 4-2. 경로(Trace) 시각화
- `naver.maps.Polyline`을 사용하여 GPS 이로를 부드러운 곡선(또는 직선 연결)으로 표시.
- 경로 로드 시 `map.fitBounds(polyline.getBounds())`를 호출하여 최적의 뷰포트 자동 설정.

### 4-3. 성능 최적화
- **30초 간격 폴링(Polling)**: `smartFetch`로 차량 위치 데이터를 가져와 `marker.setPosition()`만 갱신.
- **메모리 관리**: `closeMap` 시 지도 인스턴스 및 이벤트 리스너 명시적 제거 (`map.destroy()`).

---

## 📅 5. 단계별 실행 계획 (Roadmap)
1. **[Phase 1] SDK 통합**: `index.html`에 SDK 삽입 및 `ncpClientId` 인증 테스트.
2. **[Phase 2] 엔진 교체**: `modules/map.js` 전체 재작성 (네이티브 Marker/Polyline 기반).
3. **[Phase 3] 레이아웃 리팩토링**: `screen-map` 내부의 패널들을 `relative/absolute` 구조로 변경하여 고무줄 현상 제거.
4. **[Phase 4] 검증**: 갤럭시 S25 등 실기기에서 드래그 시 마커 고정 여부 최종 확인.

---
*기록일: 2026-04-06 (by Antigravity v4.8.0 Design Draft)*
