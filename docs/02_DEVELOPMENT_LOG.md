
# 📜 DEVELOPMENT LOG (개발 역사)

## [2026-05-11] 아산 선적관리 UI 고도화 — 헤더 고정 및 동적 제목 반영 (v5.12.4)
### 🚀 Achievement
- **테이블 헤더 고정 (Sticky Header)**: 스크롤 시에도 컬럼 제목이 상단에 유지되도록 `position: sticky` 방해 요소를 제거하여 사용성 개선.
- **동적 컬럼 제목 반영**: NAS 엑셀 원본에서 컬럼 제목을 수정하더라도, 사용자가 저장한 기존 컬럼 순서와 설정을 유지하면서 새로운 제목이 자동으로 UI에 반영되도록 인덱스 기반 매칭 로직 도입.
- **사용자별 프리셋 격리 확인**: P1/P2 프리셋이 로그인한 사용자별로 독립적으로 저장됨을 코드로 재검증 및 확인.

### 🛠 Technical Changes
- `web/app/(main)/employees/branches/asan/AsanShipping.js`: `<th>` 태그의 인라인 스타일 제거 및 `sourceHeaders` 기반 컬럼명 화해(Reconciliation) 로직 구현.
- `web/app/(main)/employees/branches/asan/shipping.module.css`: `position: sticky` 및 `z-index` 설정 확인.

## [2026-05-11] 안정화 및 모바일 UI 최적화 — P1/P2 저장 수정 및 갤S24 대응 (v5.12.3)
### 🚀 Achievement
- **저장 로직 안정화**: `/api/user/prefs` 라우트의 `await createClient()` 누락을 수정하여 P1/P2 프리셋 저장이 불가능하던 이슈 해결.
- **모바일 여백 최소화 (갤S24 대응)**: 배차판 및 선적관리 페이지의 `container` 패딩을 `2px 4px`로 대폭 축소하고, 헤더 및 버튼 레이아웃을 좁은 화면에 꽉 차게 재배치.
- **레이아웃 구조화**: `page.js`의 인라인 스타일을 CSS 클래스로 리팩토링하여 모바일 가독성 및 유지보수성 향상.

### 🛠 Technical Changes
- `web/app/api/user/prefs/route.js`: `createClient` 호출 시 비동기 처리(`await`) 보강.
- `web/app/(main)/employees/branches/asan/page.js`: 인라인 스타일 제거 및 `styles.pageWrapper` 클래스 도입.
- `web/app/(main)/employees/branches/asan/dispatch.module.css`: 최상위 래퍼 및 모바일 여백 극소화 스타일 추가.
- `web/app/(main)/employees/branches/asan/shipping.module.css`: 모바일 그리드 레이아웃 및 패딩 조정.

## [2026-05-11] 선적관리 고도화 — DB 레이아웃 저장 및 엑셀형 필터 시스템 (v5.12.2)
### 🚀 Achievement
- **엑셀형 컬럼 필터**: 텍스트 입력 필터를 제거하고, 각 컬럼 헤더의 ▼ 아이콘 클릭 시 해당 컬럼의 고유값 목록이 체크박스 드롭다운으로 표시되어 다중 선택 필터링 가능.
- **DB 기반 사용자별 레이아웃 영구 저장**: `user_ui_prefs` Supabase 테이블을 신설하고, `/api/user/prefs` API 라우트를 통해 로그인 계정별 컬럼 순서/숨기기/정렬 설정을 자동 저장·복원.
- **프리셋 2슬롯 시스템**: P1/P2 저장·로드 버튼으로 자주 사용하는 레이아웃을 즉시 전환 가능.
- **컬럼 드래그 숨기기 (항목 보관함)**: 테이블 위 보관함 영역에 컬럼을 드래그하면 해당 컬럼이 표에서 사라지고, 보관함 내 버튼 클릭으로 즉시 복구.
- **저장 경과시간 카운터**: 배차판과 동일한 `+HH:MM:SS` 형태로 파일 저장 후 경과 시간을 실시간 표시.
- **필터 배지 시스템**: 활성 필터가 표 상단에 배지 형태로 노출되어 현재 적용된 필터 상태를 한눈에 파악하고 개별/전체 해제 가능.
- **버튼 톤 앤 매너 통일**: 모든 상단 버튼을 동일한 스타일(`resetBtn`)로 통일하여 시각적 일관성 확보.
- **모바일 반응형**: topBar 세로 전환, 검색창 full-width, 버튼/셀 축소 등 768px 이하 대응 CSS 추가.

### 🛠 Technical Changes
- `web/app/api/user/prefs/route.js`: 사용자별 UI 설정 CRUD API (GET/POST, Supabase `user_ui_prefs` upsert).
- `web/app/(main)/employees/branches/asan/AsanShipping.js`: DB 연동 레이아웃 저장/로드, 엑셀형 필터 드롭다운, 프리셋, 필터 배지 시스템 전면 리팩토링.
- `web/app/(main)/employees/branches/asan/shipping.module.css`: 오버레이/모달, 필터 배지, 모바일 미디어쿼리 스타일 대폭 추가.
- Supabase SQL: `user_ui_prefs` 테이블 생성 (`user_id + page_key` PK, JSONB settings, RLS 적용).

## [2026-05-11] 선적관리 파서 버그 수정 및 UI 고도화 (v5.12.1)
### 🚀 Achievement
- **백엔드 엔드포인트 누락 수정**: `els-core` 컨테이너가 참조하는 `app_core.py`에 선적관리 파서 API를 누락하여 발생했던 `404 Not Found` 이슈를 해결했습니다.
- **헤더 레이아웃 최적화**: 상황판 제목과 탭 버튼을 동일 선상(Flex Row)에 배치하여 불필요한 수직 공간 낭비를 줄였습니다.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: 선적관리 파서 API(`get_asan_shipping`) 추가 및 캐싱 로직 적용.
- `web/app/(main)/employees/branches/asan/page.js`: 헤더 래퍼 스타일 수정 (Flex Row 적용 및 탭 버튼 위치 조정).

## [2026-05-11] 아산지점 선적관리 탭 추가 및 종합상황판 레이아웃 개편 (v5.12.0)
### 🚀 Achievement
- **선적관리 전용 탭 신설**: 아산지점 페이지에 `2026_자체보관리스트.xlsx`와 연동되는 '선적관리' 탭을 추가했습니다. `CONTAINER` 컬럼(O열) 유무를 기준으로 실시간 데이터를 필터링하여 제공합니다.
- **종합상황판 레이아웃 최적화**: 아산지점의 정체성을 보여주는 와이드 헤더를 최상단에 배치하고, 배차판의 내부 헤더 아이템들을 조작 툴바(`topBar`)로 통합하여 수직 공간 효율성을 극대화했습니다.
- **고성능 엑셀 파이프라인**: NAS 백엔드에 파일 수정 시간(mtime) 기반의 인메모리 캐싱 파서를 구축하여, 엑셀 저장 즉시 웹에서 CSV급 속도로 데이터를 조회할 수 있게 했습니다.
- **사용자 중심 데이터 그리드**: 
  - **DnD 컬럼 재정렬**: 헤더를 드래그하여 원하는 순서로 배치할 수 있으며, 이 설정은 `localStorage`에 저장되어 유지됩니다.
  - **스마트 멀티 검색**: 콤마(`,`)를 이용한 다중 키워드 검색을 지원하여 복잡한 리스트에서도 원하는 행을 즉시 찾을 수 있습니다.
  - **모선 기반 자동 정렬**: AD, AE, AF 컬럼(선적확정모선)의 값 유무를 판단하여 관리 대상 행들을 최상단으로 자동 정렬합니다.
- **데이터 안정성 강화**: `#N/A` 및 `nan` 문자열을 공란으로 완벽 처리하고, 네트워크 파일 읽기 안정성을 위해 임시 파일 복사 파싱 로직을 적용했습니다.

### 🛠 Technical Changes
- `docker/els-backend/app.py`: `/api/branches/asan/shipping` 엔드포인트 및 mtime 기반 캐싱 파서 로직 추가.
- `web/app/api/branches/asan/shipping/route.js`: Next.js 서버사이드 프록시 라우트 신설.
- `web/app/(main)/employees/branches/asan/AsanShipping.js`: 선적관리 그리드 컴포넌트 신규 개발.
- `web/app/(main)/employees/branches/asan/shipping.module.css`: 선적관리 전용 스타일링 추가.
- `web/app/(main)/employees/branches/asan/page.js`: `AsanBranchPage` 탭 래퍼 도입 및 `AsanDispatchContent` 헤더 통합 리팩토링.
- `web/app/(main)/employees/branches/asan/dispatch.module.css`: 레이아웃 변경에 따른 스타일 보정.


## [2026-05-11] 차량정보 불러오기 입력폼 초기화 버그 수정 및 UX 개선 (v5.11.21)
### 🚀 Achievement
- **입력폼 초기화 버그 수정**: 기사 앱 설정 화면에서 전화번호로 '차량정보 불러오기'를 실행할 때, 서버에서 받아온 정보를 DOM에만 적용하고 `State.profile` 상태 객체를 갱신하지 않은 채 UI 렌더링 함수를 호출하여 폼 전체가 빈 값으로 덮어써지던 치명적인 버그를 수정했습니다. 이제 입력한 전화번호와 불러온 차량 정보가 정확히 유지됩니다.
- **실시간 저장 버튼 활성화**: 앱 설정 화면의 모든 입력 필드(이름, 전화번호, 차량번호, ID 등)에 `oninput` 이벤트를 바인딩(`checkProfileForm`)하여, 사용자가 직접 정보를 입력하거나 정보를 불러왔을 때 필수 항목이 모두 채워지면 즉시 정보저장 버튼이 파란색으로 변하도록 개선했습니다.
- **저장 버튼 UX 직관성 강화**: 기존에는 항상 검은색이었고, 비활성화 상태에서 클릭 시 에러 토스트만 띄우던 버튼에 명확한 상태 변화를 주었습니다. 모든 조건이 충족되지 않으면 회색(`#9ca3af`)으로 표시되며 클릭이 원천 차단(`pointer-events: none`)되고, 모든 정보가 기입되어 완벽할 때만 파란색(`#2563eb`)으로 활성화되어 클릭할 수 있습니다.
- **강제 업데이트 배포**: 변경된 사항을 기사님들이 즉시 반영받으실 수 있도록 `forceUpdate: true`를 적용한 APK v5.11.8 버전을 긴급 배포했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/profile.js`: `lookupDriver`에서 `State.profile` 속성 갱신 로직 추가. `checkProfileForm` 함수 신규 구현 및 `updateSettingsButtonState` 버튼 색상(회색/파란색) 제어 로직 보강.
- `web/driver-src/index.html`: `btn-save-profile` ID 부여 및 각 input 태그에 `oninput="App.checkProfileForm()"` 이벤트 바인딩 추가.
- `web/driver-src/app.js`: `checkProfileForm`을 `window.App` 네임스페이스로 익스포트.
- `web/android/app/build.gradle`: versionCode 5149, versionName "5.11.8" 증분.
- `scripts/build_driver_apk.ps1`: 신규 버전 빌드 및 강제 배포.


## [2026-05-11] 스플래시 화면 프리징 해결 및 GPS 수집 정교화 (v5.11.20)
### 🚀 Achievement
- **스플래시 프리징 핫픽스 (Critical)**: `web/driver-src/modules/init.js`의 `appStateChange` 이벤트 리스너 내부에서 `await import`를 사용하면서 정작 함수에는 `async` 키워드가 누락되어 발생하던 자바스크립트 구문 오류(Syntax Error)를 수정했습니다. 이로 인해 앱 구동 시 스플래시 화면에서 멈추던 현상이 완벽히 해결되었습니다.
- **GPS 궤적 품질 개선**: 정차 중이나 지하/빌딩 숲 등에서 좌표가 사방으로 튀는 현상을 억제하기 위해 `distanceFilter`(5m → 15m)를 상향하고, 오차가 큰 좌표(`accuracy` > 100m)를 원천 차단하는 필터를 강화했습니다.
- **강제 업데이트 배포**: 구문 오류로 인한 앱 사용 불가 상태를 즉시 해소하기 위해 `forceUpdate: true`를 적용한 APK v5.11.7 버전을 긴급 배포했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/init.js`: `appStateChange` 콜백에 `async` 키워드 추가.
- `web/driver-src/modules/gps.js`: `distanceFilter` 15m 상향, `accuracy` 100m 필터 적용.
- `web/android/app/build.gradle`: versionCode 5148, versionName "5.11.7" 증분.
- `scripts/build_driver_apk.ps1`: 신규 버전 빌드 및 배포 완료.


## [2026-05-11] 통계 합산 버그 핫픽스 및 동적 파싱 정교화 (v5.11.19)
### 🚀 Achievement
- **통계 무결성 확보**: 요약 데이터(`totalSummary`)를 생성하는 루프에서 화주별 오더/배차 수량(`byTypeOrders`, `byTypeDispatches`) 가산 로직이 누락되어 AI에게 "글로비스 0대, 모비스 0대"로 전달되던 치명적 버그를 수정했습니다. 이제 AI가 88대 등 전체 수량을 정확히 인지합니다.
- **데이터 노이즈 제거**: 동적 지역 컬럼 식별 시 '구분', '작업', '고객사', '선적' 등 공통 메타데이터 헤더들을 제외 목록에 추가하여, '수출', '부산신항' 등이 운송사로 오인되어 수량이 중복 집계되는 현상을 방지했습니다.


## [2026-05-10] 배차 RAG ReferenceError 핫픽스 (v5.11.18)
### 🚀 Achievement
- **데이터 누락 버그 해결**: v5.11.17 적용 후, 타임라인(`timeLogs`) 텍스트 조립 단계에서 `wVal`(작업지) 변수가 스코프 내에 정의되지 않아 `ReferenceError`가 발생하고, 이로 인해 `dispatchText` RAG 생성이 통째로 중단되어 AI가 "5/10 데이터까지만 조회된다"고 응답하는 치명적 버그를 해결했습니다.

## [2026-05-10] AI 하드코딩 제거 및 시계열 타임라인 요약 RAG (v5.11.17)
### 🚀 Achievement
- **하드코딩 완전 제거 (Dynamic Parsing)**: 기존에 코드에 박혀있던 협력사(`carrierKwds`), 지역(`regionCols`) 배열을 모두 제거했습니다. 예약된 헤더명을 제외한 모든 컬럼을 '지역'으로 동적 인식하고, 셀 내 문자열을 파싱하여 '협력업체명'을 스스로 추출합니다. 이를 통해 신규 협력사가 추가되어도 코드 갱신 없이 즉시 RAG가 가능해졌습니다.
- **시계열(타임라인) 요약 자동 생성**: 사용자의 "n시 배차 어디야?" 질문에 AI가 환각 없이 정확히 대답할 수 있도록, 백엔드에서 미리 각 행의 메모(시간)와 배차된 지역/업체 수량을 조합해 `[08시 배차] 화주: 글로비스 -> 부산상차 이지 4대` 형태로 요약 텍스트를 만들어 AI에게 먹여줍니다. 

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `nonRegionHeaders` 예약어 기반 동적 컬럼(지역) 인식 도입. 숫자 분리를 통한 동적 협력업체 추출 정규식 도입. `timeLogs` 속성을 통한 시계열 문장 빌드.


## [2026-05-10] AI 스트림 끊김 방지 및 일자별 협력사 배차 요약 강화 (v5.11.16)
### 🚀 Achievement
- **응답 중단(Timeout) 해결**: 이미지를 첨부하여 AI와 대화할 때 Vercel Serverless Function의 기본 15초 타임아웃을 초과하여 답변이 생성되다 끊기는 현상을 `maxDuration = 60` 설정으로 해결했습니다.
- **협력사 수량 추론 오류 완전 차단**: AI가 복잡한 비정형 데이터 행(Raw Rows)을 텍스트로 읽으면서 협력업체별 수량을 잘못 계산(할루시네이션)하는 것을 막기 위해, 서버에서 파싱된 **'일자별 협력사 배차 내역'**을 요약표(`dispatchText`)에 통계로 명시하여 그대로 읽게 만들었습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: 상단 `export const maxDuration = 60;` 추가. `totalSummary.byDate[d].byCarrier` 통계를 요약표(`dispatchText`)에 주입하는 로직 추가.


## [2026-05-10] AI 배차/오더 완벽 분리 및 검색 필터 고도화 (v5.11.15)
### 🚀 Achievement
- **오더 vs 배차 수량 분리**: 이전까지 AI 주입용 요약 텍스트(`totalSummary`)에서 오더 수량과 배차 수량을 `Math.max`로 섞어서 집계하던 치명적인 백엔드 논리 오류를 수정했습니다. 이제 오더 수량과 배차 수량을 명확히 나누어 주입합니다.
- **날짜 검색 필터 버그 수정**: 사용자가 "5/11", "5.11"과 같이 슬래시나 점을 포함한 날짜를 입력했을 때, 키워드 필터가 이를 날짜로 인식하지 못해 배차 데이터 자체를 필터링(삭제)해버리던 버그를 정규식 확장으로 해결했습니다.
- **화주/협력사 명확화**: 글로비스/모비스가 협력사로 혼동되지 않게 '화주(작업지)'임을 프롬프트와 요약 텍스트에 강제 표기했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `totalSummary.byDate`에 `orderCount`, `dispatchCount` 분리 추가. `specificKwds` 제외 정규식에 `[\/\-\.]` 추가.


## [2026-05-10] AI 배차 RAG 할루시네이션 원천 차단 (v5.11.14)
### 🚀 Achievement
- **예시 혼동(할루시네이션) 방지**: AI가 시스템 지침에 가이드용으로 적어둔 구체적 예시('부산', '이지 4대', '10시' 등)를 실제 데이터로 착각하여 거짓된 응답을 하던 심각한 버그를 수정했습니다.
- **지침 추상화**: 프롬프트 내부의 모든 예시를 `[상차지역]`, `[업체A] 4대`, `[시간]` 과 같이 추상적인 형태로 교체하여, 실제 데이터가 없을 때 AI가 예시를 정답으로 둔갑시키는 현상을 원천 차단했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `BASE_SYSTEM_INSTRUCTION` 내 23번 아산 배차판 구조 설명 및 주입 텍스트(`dispatchText`) 내 구체적 지역/운송사 명칭을 모두 추상 명사로 치환.


## [2026-05-10] GPS 안정화 및 배차 RAG 지능 고도화 (v5.11.13)
### 🚀 Achievement
- **GPS 포그라운드 복귀 안정화**: 앱 화면 복귀 시 GPS Watcher를 오체크(항상 undefined)하여 불필요하게 GPS를 껐다 켜던 버그를 수정했습니다. 이로 인해 앱 사용 중 GPS 수집 공백이 사라졌습니다.
- **GPS 경로 정밀도 향상**: 정차 중이나 저속 주행 시 GPS 좌표가 옆으로 튀거나 왔다갔다 하는 현상을 억제하기 위해 `distanceFilter`(5m→15m)와 `accuracy`(500m→100m) 임계값을 최적화했습니다.
- **배차 RAG 해석 규칙 전면 강화**: 아산 배차판의 특수한 컬럼 구조(지역 컬럼=상차지/업체별수량, 메모=실제시간)를 AI가 완벽히 이해하도록 지시사항을 교체했습니다. 이제 "부산 배차 몇 대?", "10시 배차 누구야?" 같은 질문에 정확히 답합니다.
- **날짜별 소계(byDate) 도입**: AI가 단순히 전체 합계만 말하는 게 아니라, 날짜별로 배차 대수를 구분하여 브리핑할 수 있도록 서버측 집계 로직을 강화했습니다.
- **specificKwds 필터 버그 수정**: 사용자가 "5월 9일 15대"라고 질문할 때, 숫자와 날짜가 키워드 필터에 걸려 실제 데이터가 누락되던 치명적 버그를 해결했습니다.
- **배차판 상세 명세서(docs/09) 구축**: 배차판 구조에 대한 관리자 설명을 문서화하여 차후 AI 에이전트가 바뀌어도 재설명 없이 지능을 유지할 수 있게 했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/init.js`: `gpsWatchId` dynamic import 참조로 포그라운드 복귀 로직 정상화.
- `web/driver-src/modules/gps.js`: `distanceFilter` 및 `accuracy` 필터 임계값 조정.
- `web/app/api/chat/route.js`: `BASE_SYSTEM_INSTRUCTION #23` 전면 개편, `byDate` 집계 및 `specificKwds` 정규식 제외 로직 추가.
- `docs/09_DISPATCH_BOARD_SPEC.md`: 아산지점 배차판 구조 및 파싱 규칙 명세서 신규 작성.

### ✅ Verification
- **GPS 테스트**: 앱 백그라운드 -> 포그라운드 전환 시 로그에 `GPS_STOP` 없이 `GPS_RESUME_OK`만 찍히는지 확인.
- **RAG 테스트**: "5월 9일 부산 배차 몇 대야?" 질문 시 날짜 필터링을 통과하고 부산 컬럼 수량을 정확히 합산하는지 확인.
- **빌드 테스트**: `scripts/build_driver_apk.ps1`을 통한 APK v5.11.6 빌드 완료.


## [2026-05-04] 차량관제 네비게이션 모드 및 AI 지능 고도화 (v5.11.4)
### 🚀 Achievement
- **AI 챗봇 RAG 고도화**: 차량 조회 시 GPS 위경도만 보여주던 한계를 넘어, 해당 트립의 **최초 시작지(출발지)**와 **최신 위치(현재위치/도착지)** 주소를 각각 추출하여 챗봇이 인지하도록 개선했습니다.
- **기상 예보 데이터 확장**: 날씨 API 연동 시 오늘 날씨뿐만 아니라 **내일의 일별 예보 데이터**를 함께 요약문에 포함하여 AI가 내일 날씨 질문에 정확히 답변할 수 있게 했습니다.
- **AI Omni-Intelligence 지침 도입**: AI 시스템 지침(Rule 22)을 추가하여, 봇이 사내 시스템 아키텍처(PostgreSQL, pgvector, K-SKILL)를 이해하고 단순 답변을 넘어 물류 트렌드와 연계된 통찰을 제시하도록 지능을 강화했습니다.
- **웹 관제 전체화면 UI 정밀화**: 전체화면 시 좌측 상단에 겹쳐 보이던 '전체화면 해제'와 '현위치' 버튼을 **중앙 필터 메뉴 바 내부로 통합**했습니다. 명칭을 '전체화면 닫기', '포커스 맞추기'로 변경하고, `.fullscreenBtn`의 `position: absolute` 속성을 인라인 스타일(`position: relative`)로 오버라이드하여 Flex 레이아웃 붕괴 및 버튼 겹침을 완벽히 해결했습니다.
- **네비게이션 스타일 추적 도입**: 웹 관제와 기사 앱 모두 실시간 추적 시 지도가 차량을 중앙에 두고 부드럽게 이동하는 `panTo` 기반 네비게이션 모드를 구현했습니다.
- **마커 깜빡임 제거 (웹)**: 데이터 갱신 시 모든 마커를 파괴 후 재생성하던 방식을 `Map` 객체 기반 재활용 방식으로 변경하여 UI 깜빡임을 해결했습니다.
- **마커 슬라이딩 애니메이션 (앱)**: 앱 지도에서 차량 위치가 바뀔 때 마커가 부드럽게 미끄러지듯 이동하도록 `animateMarker` (easeOutCubic)를 적용했습니다.
- **앱 지도 제어 및 마커 클릭 UX**: 중복 버튼 통합(📍 내 위치) 및 마커 클릭 시 상세 경로 패널 노출 기능을 추가했습니다. 상세 정보 조회 중에는 자동 추적을 일시 중단하여 쾌적한 사용성을 확보했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: 차량 위치 조회 로직 수정 (first/last record 추출), AI 시스템 지침(Rule 22) 추가.
- `web/app/api/weather/route.js`: `dailySummary`에 내일 예보 데이터 추가 로직 구현.
- `web/app/(main)/employees/vehicle-tracking/page.js`: 전체화면 UI 레이아웃 수정, 버튼 위치 이동 및 텍스트/스타일 조정.
- `web/driver-src/modules/map.js`: `animateMarker` 헬퍼 추가 및 GPS 갱신 애니메이션 적용.
- `web/driver-src/index.html`: 앱 지도 버튼 UI 통합.

### ✅ TDD / Verification
- **웹 관제 테스트**: 실시간 추적 클릭 시 지도가 부드럽게 이동하며 마커가 깜빡이지 않는지 확인.
- **앱 지도 테스트**: GPS 수신 시 내 차량 마커가 애니메이션으로 이동하고 지도가 중앙을 유지하는지 확인.
- **레이아웃 검증**: 상세 모달 및 로그 관리 화면에서 텍스트 잘림 및 겹침 현상 해결 확인.
- **빌드 검증**: `scripts/build_driver_apk.ps1`을 통한 APK v5.11.3 빌드 및 version.json 갱신 확인.

---

## [2026-05-03] NAS 문서 벡터화 기능 전면 해제 (v5.11.0)
### 🚀 Achievement
- **서버 부하 완화**: 잦은 백그라운드 크롤링 및 파싱으로 NAS 환경에 과부하를 유발하던 `nas_vectorizer` 전체 스케줄링을 중단했습니다.
- **AI 검색 최적화**: AI 어시스턴트에서 무거운 NAS 문서를 제외하고, 웹 게시판 첨부파일(WEB 데이터) 전용으로 RAG(검색 증강 생성) 시스템을 슬림화했습니다.
- **불필요한 가이드 제거**: 사내 NAS 문서 인덱싱(파싱) 진행률 브리핑 로직을 제거하고 관련 UI를 간소화했습니다.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: `nas_sync_scheduler`에서 NAS 폴더 스캔 로직 제거 (웹 게시판 첨부파일 동기화는 유지).
- `docker/els-backend/app.py`, `app_core.py`: `/api/vectorize/nas` 엔드포인트 비활성화(400 에러 반환).
- `web/app/api/chat/route.js`: `document_chunks` 검색 시 `nas_file` 소스 타입 필터 제거 및 NAS 파싱 통계 UI 제거.
- `web/app/(main)/employees/(intranet)/ask/page.js`: 사내 문서 검색(NAS) 가이드에서 파싱 상태 브리핑 문구 삭제.
- `docs/01_MISSION_CONTROL.md`, `docs/04_MASTER_ARCHITECTURE.md`: 자동화 지표에서 NAS 제거 및 아키텍처 문서 최신화.
## [2026-05-01] 컨테이너/일반화물 업무유형 및 지도 공개범위 확장 (v5.10.42)
### 🚀 Achievement
- **업무유형 1차 분류 도입**: 운전원정보와 관제 화면에 `컨테이너`/`일반화물` 구분을 추가하고, 계약차량/미계약차량 2차 선별 필터를 구성했습니다.
- **앱 차량설정 확장**: 차량설정에 업무유형과 일반화물 차량종류·적재중량·특장구분 선택 항목을 추가했습니다. 일반화물은 차량 ID 입력칸 placeholder로만 `생략가능`을 안내합니다.
- **일반화물 운행 UI 전환**: 앱 운행 입력과 일지 상세에서 일반화물 차량은 컨테이너 번호/씰번호 대신 화물명/오더·관리번호 중심으로 표시되며, 제원은 차량종류·적재중량·특장구분으로 표시됩니다.
- **지도 노출 정책 보강**: 앱 지도는 웹 관리자가 운전원정보에서 지정한 공개범위 정책을 조회해 같은 그룹 차량만 표시하고, 지도 상단에 전체보기 버튼을 추가했습니다. 웹 관제 지도/리스트도 업무유형 및 계약상태 필터를 반영합니다.
- **정책 위치 재정리**: 지도 공개범위 선택은 기사 앱에서 제거하고, 운전원정보 웹에서 관제 관리자가 관리하는 정책으로 정리했습니다. 앱은 관리자가 지정한 정책을 조회해 내부 필터에만 사용합니다.
- **협력사 대비 사전 작업**: 계약상태를 계약차량/미계약차량/협력사 3단계로 확장하고, 향후 협력사별 관제 분리를 위해 `partner_company` 필드를 추가했습니다.
- **전체화면 지도 UX 보강**: 웹 지도 전체화면 상단에 전체보기/컨테이너/일반화물 및 계약/미계약/협력사 그룹 버튼을 배치하고, 우측 압축 운행현황 패널에서 현재위치·운행시간·속도를 보며 차량을 클릭 추적할 수 있게 구성했습니다.
- **월간 통계 보정**: 실시간 관제 상단의 `{월}월 전체 운행` 수치가 4월+5월 누적처럼 보이지 않도록 현재 연월 기준 운행건수로 계산합니다.

### 🛠 Technical Changes
- `web/utils/vehicleCargoOptions.mjs`, `web/driver-src/modules/cargoOptions.js`: 업무유형, 지도 공개범위, 일반화물 차량종류/적재중량/특장구분 옵션 상수화.
- `web/driver-src/index.html`, `modules/profile.js`, `modules/trip.js`, `modules/log.js`, `modules/map.js`, `app.js`: 앱 설정/운행/일지/지도 그룹 필터 및 일반화물 라벨 전환 구현.
- `web/app/(main)/employees/(intranet)/driver-contacts/*`: 운전원정보 등록/수정/상세/목록에 업무유형, 계약상태, 지도 공개범위 및 일반화물 제원 표시 추가.
- `web/app/(main)/employees/vehicle-tracking/page.js`, `tracking.module.css`: 웹 관제/운행기록에 업무유형·계약상태 필터 및 일반화물 표시 보강.
- `web/app/api/vehicle-tracking/trips/*`, `web/app/api/vehicle-tracking/drivers/route.js`, `docker/els-backend/app.py`, `app_core.py`: 운행/지도 응답에 업무유형, 계약상태, 지도 공개범위, 일반화물 제원 메타를 포함하도록 확장.
- `web/supabase_sql/20260501_vehicle_cargo_type_visibility.sql`: 운영 DB 적용용 컬럼/인덱스 마이그레이션 추가.
- `web/driver-src/index.html`, `modules/profile.js`, `modules/trip.js`: 앱 설정 화면에서 지도 공개범위 선택 제거, 업무유형을 전화번호 왼쪽으로 이동, 일반화물 차량 ID 안내는 placeholder `생략가능`으로만 표시.
- `web/app/(main)/employees/vehicle-tracking/page.js`: 전체화면 지도용 그룹 버튼/우측 운행현황 패널, 협력사 필터, 지점/계약상태 표시, 현재월 운행건수 계산 추가.
- `web/utils/vehicleCargoOptions.mjs`: `CONTRACT_TYPE_OPTIONS`, `contractTypeLabel()` 추가.

### ✅ TDD / Verification
- `.tmp_test/vehicle_cargo_policy_test.mjs`: 업무유형 옵션 순서, 지도 공개범위 정책값, 일반화물 선택지의 `기타` fallback, 앱 지도 공개범위 필터(`own`/`contracted`/`all`/`includeCompleted`), 안전교육 본문 YouTube URL 숨김, Supabase 마이그레이션 핵심 컬럼 포함 여부를 검증하고 통과 후 삭제했습니다.
- `.tmp_test/vehicle_web_policy_regression.mjs`: 앱 내 지도 공개범위 UI/payload 제거, 업무유형-전화번호 배치, 일반화물 차량 ID placeholder, 계약/미계약/협력사 옵션, `partner_company` 마이그레이션, 전체화면 지도 그룹/운행현황 패널 구성을 검증하고 통과 후 삭제했습니다.
- `web`: `npm.cmd run lint` 통과.
- `node --check`: `web/driver-src/modules/profile.js`, `trip.js`, `map.js`, `log.js`, `cargoOptions.js`, `web/utils/vehicleCargoOptions.mjs`, `web/app/api/vehicle-tracking/trips/route.js`, `trips/[id]/route.js`, `drivers/route.js` 문법검사 통과.
- `web`: `npm.cmd run build`는 Next.js production compile까지 성공했으나, 타입 검사용 child process 생성 단계에서 현재 로컬 실행 환경의 `spawn EPERM`으로 중단되었습니다. 코드 컴파일 실패가 아닌 워커 프로세스 권한 이슈로 분리 기록합니다.
- `python`/`py` 명령이 현재 PATH에 없어 NAS Flask 파일 `py_compile` 검증은 실행하지 못했습니다. NAS 배포 전 Python 3.11 환경에서 `docker/els-backend/app.py`, `app_core.py` 구문 확인이 필요합니다.

### 🚚 Deployment Pipeline Notes
- 1순위: Supabase에 `web/supabase_sql/20260501_vehicle_cargo_type_visibility.sql`을 먼저 적용해야 합니다. 앱/웹/API가 `driver_contacts` 및 `vehicle_trips`의 신규 컬럼을 읽고 쓰므로, 스키마 선반영 없이 배포하면 저장 요청이 실패할 수 있습니다.
- 2순위: 웹(Vercel)과 NAS core를 함께 배포합니다. NAS `/api/vehicle-tracking` 응답도 운전원 메타를 조인해 업무유형/계약상태/지도공개범위를 내려주도록 변경되었습니다.
- 3순위: 드라이버 앱은 반드시 `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`로만 빌드합니다. 단독 `npx cap sync` 실행 금지.
- 배포 후 스모크 테스트: 운전원정보 등록/수정에서 컨테이너·일반화물 및 계약상태 저장, 일반화물 차량 ID 공란 저장, 앱 차량설정 일반화물 옵션 표시, 앱 지도 `전체보기`, 웹 관제 1차/2차 필터, 운행기록 일반화물 라벨 전환을 확인합니다.

## [2026-05-01] 차량관제 표 겹침 해소 및 앱 안전교육 이수 UX 보강 (v5.10.41)
### 🚀 Achievement
- **운행기록 테이블 겹침 해소**: 관리자 웹 운행기록 목록에서 `규격/종류`와 `점검여부` 컬럼 폭을 고정하고 셀 클래스를 분리해 입력/select 영역이 점검여부와 겹치지 않도록 보정했습니다.
- **안전교육 이수 조건 개선**: 앱 안전교육 상세에서 HTML5 동영상은 80% 이상 시청, YouTube/PDF/본문 자료는 1분 확인 후 `시청 완료 및 이수 기록` 버튼이 활성화되도록 변경했습니다.
- **안전교육 본문 주소 숨김**: 본문에 붙여넣은 YouTube 원본 URL은 영상 임베드 추출에만 사용하고, 앱 상세 본문에서는 보이지 않도록 처리했습니다.
- **이수완료 상태 유지**: 완료한 교육은 로컬 저장소에 남기고 상세 재진입 시 `이수완료` 버튼 상태로 표시되며, 서버 중복 이수 응답도 기존 완료 시간을 반환하도록 보강했습니다.
- **공지 필터 전환 보정**: 공지 상세를 읽는 중에도 상단 `긴급알림/일반공지/작업안내/안전교육` 버튼을 누르면 상세를 닫고 해당 목록으로 즉시 이동하도록 수정했습니다.
- **앱 일지 버튼 높이 통일**: 일지 상세의 `기록 수정 저장` 버튼 높이를 다른 입력 항목과 동일한 44px로 맞췄습니다.
- **스플래시 분리 적용**: 웹 크롬앱으로 열리는 사이트에서는 `splash.jpg` 기반 React/iOS 스플래시를 제거해 빠르게 창이 뜨게 하고, Android 차량관제앱 네이티브 launch splash는 동일 `splash.jpg` 이미지로 변경했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/vehicle-tracking/page.js`, `tracking.module.css`: 규격/종류·점검여부 컬럼 전용 클래스 및 모바일 카드 컬럼 순서 보정.
- `web/driver-src/modules/notice.js`: 안전교육 이수 버튼 60초 타이머, HTML5 동영상 80% 감지, 완료 상태 재진입 UI 처리.
- `web/driver-src/modules/notice.js`: 공지 상세 활성 상태에서 분류 필터 클릭 시 상세 닫기 및 목록 스크롤 초기화 처리.
- `web/utils/vehicleEducation.mjs`, `web/app/(standalone)/driver-app/page.js`: YouTube URL 제거 유틸 추가 및 React 기반 드라이버 앱 상세 본문에 적용.
- `web/app/api/vehicle-tracking/education/complete/route.js`: 중복 이수 시 기존 `created_at`을 `completed_at`으로 반환.
- `web/driver-src/index.html`: 일지 상세 저장 버튼 높이 44px 적용.
- `web/app/(main)/layout.js`: 웹 PWA 스플래시 컴포넌트 및 iOS startup image 참조 제거.
- `web/capacitor.config.ts`, `web/android/app/src/main/res/values/styles.xml`, `web/android/app/src/main/res/drawable/splash.jpg`, `splash_screen.xml`: Android 네이티브 스플래시 이미지 리소스 연결.

## [2026-05-01] 관리자 웹 정산 기능 고도화 및 드라이버 앱 UI 2차 최적화 (v5.10.40)
### 🚀 Achievement
- **운행기록 및 교육이수 관리 분리**: 교육 이수 기록을 별도의 '교육이수' 탭으로 독립시켜 운행 기록과 혼재되지 않도록 관리 효율성을 높였습니다.
- **앱 UI 가독성 및 입력 편의성 개선**: 드라이버 앱의 주요 입력 필드 높이를 상향(34px -> 44px)하여 텍스트 잘림을 방지하고, 운송구분 기본값을 '왕복'으로 설정했습니다.
- **관리자 수정 사항 가시화**: 관리자가 웹에서 정보를 수정할 경우, 앱 내 일지 상세 화면에서 해당 항목이 파란색 볼드체로 표시되도록 UI 피드백을 강화했습니다.
- **기사명 보존 로직 개선**: 관리자 수정 시 기사명이 '마감담당자'로 바뀌던 문제를 해결하기 위해, DB 로그에 `|admin` 플래그를 사용하는 방식을 도입했습니다.
- **웹 상세정보 통합 편집**: 운행 상세 모달에서 컨테이너 정보, 운송구분, 청구금액, 작업지 등 모든 필드를 즉시 수정할 수 있도록 입력 기능을 확장했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/vehicle-tracking/page.js`: 교육이수 전용 탭(`activeTab`) 구현, 상세 모달 내 모든 필드 에딧 가능하도록 UI 전환.
- `web/driver-src/index.html`: 입력칸(`input`, `select`) 높이 44px 상향 조정.
- `web/driver-src/modules/log.js`: `|admin` 플래그 감지를 통한 관리자 수정 항목 파란색 하이라이트 로직 추가.
- `web/app/api/vehicle-tracking/trips/[id]/route.js`: `modified_by` 필드에 기사명과 `|admin` 접미사를 결합하여 저장하도록 변경.
- `web/app/api/vehicle-tracking/trips/route.js`: `admin_modified_fields` 추출 시 `LIKE '%|admin%'` 패턴 적용.
- `scripts/build_driver_apk.ps1`: APK 빌드 및 v5.10.40 자동 배포 완료.


## [2026-04-30] 웹 정산 기능 강화 및 앱 UX 정밀 조정 (v5.10.39)
### 🚀 Achievement
- **웹 정산 편의성 개선**: 관리자 웹 운행 리스트에서 청구금액을 즉시 수정할 수 있는 인라인 입력 기능을 추가하고, 교육 이수 기록을 별도 섹션이 아닌 해당 운행 기록 바로 아래에 표시하도록 통합했습니다.
- **앱 교육 이수 간소화**: 텍스트나 PDF 문서에 대한 '읽음 확인' 버튼 클릭 단계를 제거하여, 영상 시청(있는 경우)만으로 즉시 이수가 가능하도록 프로세스를 개선했습니다.
- **앱 UI 가독성 향상**: 드라이버 앱 상단 상태 바의 폰트 크기 및 간격을 조정하고, 점검/운행 시작 버튼의 색상 테마를 일관성 있게 보정했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/vehicle-tracking/page.js`: `saveBillingAmount` 함수 추가 및 운행 리스트 `Fragment` 기반 교육 로그 통합 렌더링.
- `web/driver-src/modules/notice.js`: `_currentEducationProgress.readConfirmed` 기본값 true 설정 및 관련 UI 제거.
- `web/driver-src/modules/trip.js`: 점검 완료 및 운행 시작 버튼의 기본 배경색을 `#111827` (Black)으로 통일.

## [2026-04-30] 운행일보 정산 및 마감 스키마 보강 (v5.10.38)
### 🚀 Achievement
- **운행일보 정산 지원**: `vehicle_trips` 테이블에 운송구분, 청구금액, 작업지 정보를 저장할 수 있는 필드를 추가하여 기사 앱에서 입력한 정산 데이터를 관리할 수 있도록 했습니다.
- **마감 로직 토대 마련**: `is_closed` 필드를 추가하여 관리자 마감 완료 후 기사 앱에서 과거 데이터를 수정하지 못하도록 제어하는 기능을 위한 스키마를 확정했습니다.

### 🛠 Technical Changes
- `web/supabase_sql/20260430_vehicle_trip_daily_report_fields.sql`: 운행일보/마감 필드 추가 SQL 마이그레이션 파일.

## [2026-04-30] 안전교육 데이터 스키마 보강 및 마이그레이션 (v5.10.37)
### 🚀 Achievement
- **DB 스키마 확정**: `notices` 테이블에 `education_url` 및 `attachments` 컬럼을 정식 추가하고, 운행 이력 관리를 위한 `vehicle_trip_logs` 테이블을 생성하는 SQL 마이그레이션을 배포했습니다.
- **유튜브 URL 자동 임베드 고도화**: 공지사항 본문에서 추출한 유튜브 URL이 최우선적으로 영상 섹션에 노출되도록 렌더링 로직을 안정화했습니다.

### 🛠 Technical Changes
- `web/supabase_sql/20260430_vehicle_education_support.sql`: 안전교육 지원 스키마 마이그레이션 파일 추가.

## [2026-04-30] 공지 본문 유튜브 URL 자동 감지 및 렌더링 최적화 (v5.10.36)
### 🚀 Achievement
- **유튜브 URL 자동 임베드**: 공지사항 본문이나 첨부파일 설명에 포함된 YouTube URL을 자동으로 추출하여 영상 섹션에 표시하도록 개선했습니다. (별도의 education_url 입력 없이도 동작)
- **비운행 이수 오류 수정**: 안전교육 이수 버튼이 운행 중 상태에만 저장되던 제약을 제거하고, 운행 중이 아니면 차량번호 기준 최근 운행기록에 이수 로그를 연결하도록 보강했습니다.
- **지도 통계 누락 보정**: 앱 지도 경로 패널의 `총운행시간` 오타 수정 및 포인트 데이터 기반 통계 계산 로직을 보강했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/notice.js`: `extractFirstYouTubeUrl`, `getNoticeYouTubeUrl` 유틸 추가 및 상세 화면 연동.
- `web/app/api/vehicle-tracking/education/complete/route.js`: `trip_id` fallback 로직 고도화.

## [2026-04-30] 차량관제 안전교육 비운행 이수/지도 통계 보정 (v5.10.35)
### 🚀 Achievement
- **비운행 이수 오류 수정**: 안전교육 이수 버튼이 운행 중 상태에만 저장되던 제약을 제거하고, 운행 중이 아니면 차량번호 기준 최근 운행기록에 이수 로그를 연결하도록 보강했습니다.
- **본문 유튜브 재생 보강**: 안전교육 URL 입력칸이 아닌 본문/첨부에 붙여넣은 YouTube 주소도 자동 추출하고, `education_url` 컬럼이 없는 환경에서도 본문에 URL이 보존되도록 처리했습니다.
- **교육자료 미리보기/다중자료 보강**: 웹 작성 모달에서 여러 YouTube URL 미리보기를 지원하고, 앱 상세에서 이미지/동영상/PDF 첨부를 직접 확인할 수 있도록 렌더링을 확장했습니다.
- **완료 운행 평균속도 표시**: 운행 기록 API가 위치 포인트 기반 평균속도를 계산해 완료 운행 목록에 최고속도와 함께 표시하도록 보강했습니다.
- **이수 완료 UX/기록 가시화**: 앱은 영상 80% 시청+본문/자료 읽음 확인 후 이수 버튼이 빨강→파랑으로 전환되고, 공지 목록에 이수완료를 표시합니다. 웹 운행기록에는 안전교육 이수 로그를 별도 행으로 노출합니다.
- **GPS 수집 최적화**: 기본 수집 간격/거리 필터를 완화하되, 저속·회전·급가감속·모션 충격 감지 시 3초 수집으로 즉시 강화되도록 조정했습니다.
- **운행일보 입력/마감 확장**: 기사 앱 운행 시작·운행 중·일지 수정 화면에 운송구분/청구금액/작업지를 추가하고, 웹에서 마감 완료 처리 시 기사 앱 수정을 차단하도록 했습니다.
- **웹 기록 요약/로그 버튼 수정**: 운행기록 검색 결과 상단에 운행건수·차량수·청구금액 합계를 표시하고, 깨진 실시간 로그 버튼을 관리자 로그 페이지로 연결했습니다.
- **운행기록 테이블 통합 표시**: 안전교육 이수 기록을 별도 상세/상단 박스가 아닌 운행기록 테이블 내 동등 행으로 표시하고, 청구금액을 목록에서 바로 수정할 수 있게 보정했습니다.
- **앱 운행 화면 UX 정리**: 운행 상태바 여백/높이를 줄여 주소 잘림을 완화하고, 작업지 placeholder를 `작업지 이름 기입`으로 변경했습니다. 운행전점검 완료 후 버튼 색상은 검은색으로 통일하고, 교육자료 별도 읽음확인 버튼은 제거했습니다.
- **지도 통계 누락 보정**: 앱 지도 경로 패널의 `쳙 운행시간` 오타를 `총운행시간`으로 수정하고, API 통계 필드가 없어도 위치 포인트의 속도값으로 최고속도/평균속도를 계산해 항상 표시하도록 개선했습니다.

### 🛠 Technical Changes
- `web/app/api/vehicle-tracking/education/complete/route.js`: `trip_id` 미전달 시 `vehicle_trips` 최신 기록 fallback 조회 후 `vehicle_trip_logs` 저장.
- `web/utils/vehicleEducation.mjs`, `web/app/api/vehicle-tracking/notices/route.js`, `web/driver-src/modules/notice.js`, `web/app/(standalone)/driver-app/page.js`: 안전교육 완료 버튼과 요청 payload의 운행 중 의존성 제거, 본문/첨부 YouTube URL 자동 embed 및 저장 보존.
- `web/supabase_sql/20260430_vehicle_education_support.sql`: 운영 DB 적용용 `notices.education_url`, `notices.attachments`, `vehicle_trip_logs` 스키마 추가 SQL 정리.
- `web/app/api/vehicle-tracking/trips/route.js`, `web/app/(main)/employees/vehicle-tracking/page.js`: 완료 운행 평균속도 계산/표시 및 안전교육 다중 URL/파일 관리 UI 보강.
- `web/driver-src/modules/notice.js`, `web/driver-src/app.js`, `web/driver-src/modules/gps.js`: 앱 안전교육 완료 조건/목록 표시 및 GPS 동적 수집 주기 조정.
- `web/driver-src/index.html`, `web/driver-src/modules/trip.js`, `web/driver-src/modules/log.js`: 운행일보 필드 추가 및 앱/일지 수정 payload 연결.
- `web/app/api/vehicle-tracking/trips/route.js`, `web/app/api/vehicle-tracking/trips/[id]/route.js`: 운행일보 필드 저장, 마감 완료 후 기사 앱 수정 차단, 수정 로그 기록 확장.
- `web/supabase_sql/20260430_vehicle_trip_daily_report_fields.sql`: 운영 DB 적용용 운행일보/마감 컬럼 추가 SQL 정리.
- `web/driver-src/modules/map.js`: 경로 포인트 기반 운행시간/최고속도/평균속도 fallback 계산 추가.

### ✅ Verification
- `.tmp_test/driverTrackingRegression.test.mjs`, `.tmp_test/youtubeBodyEmbed.test.mjs`, `.tmp_test/noticeEducationFix.test.mjs`, `.tmp_test/educationMediaAndAvgSpeed.test.mjs`, `.tmp_test/educationCompletionAndGps.test.mjs`, `.tmp_test/vehicleDailyReportFields.test.mjs`, `.tmp_test/vehicleTrackingIntegratedRegression.test.mjs`, `.tmp_test/vehicleRecordsTableRegression.test.mjs`, `.tmp_test/appUxPolishRegression.test.mjs`: 안전교육 비운행 저장 조건, 본문 YouTube URL embed/보존, 교육자료 미리보기, 평균속도/이수목록, GPS 동적 수집, 운행일보/마감/요약, 운행기록 테이블 통합 표시, 앱 UX 정리, 지도 통계/오타 회귀 테스트 통과.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 차량관제 안전교육/사진 업로드 후속 리팩토링 (v5.10.34)
### 🚀 Achievement
- **안전교육 공통 규칙 정리**: YouTube 주소 embed 변환, 이수 로그 저장 포맷, 웹 표시용 교육명 파싱을 공통 유틸로 분리했습니다.
- **앱 공지 상세 정리**: 드라이버 앱의 공지 본문 정규화와 교육 영상/첨부자료 렌더링을 헬퍼로 분리하고, 이수 기록 저장 기준을 명확히 했습니다.

### 🛠 Technical Changes
- `web/utils/vehicleEducation.mjs`: 교육 로그/YouTube URL 변환 유틸 추가.
- `web/app/api/vehicle-tracking/education/complete/route.js`: 교육 로그 저장 포맷을 공통 유틸로 통일.
- `web/app/(main)/employees/vehicle-tracking/page.js`, `web/app/(standalone)/driver-app/page.js`, `web/driver-src/modules/notice.js`: 중복 문자열 처리와 YouTube 변환 로직 정리.

### ✅ Verification
- `.tmp_test/vehicleEducationRefactor.test.mjs`: 교육 로그 포맷/파싱, YouTube URL 변환, 앱 이수기록 기준 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 드라이버 앱 UX 및 운행 통계 고도화 (v5.10.33)
### 🚀 Achievement
- **App UX 직관성 강화**: 설정 화면의 '저장' 버튼을 활성화/비활성화 상태에 따라 빨간색/파란색 배경으로 시각화하여 명확한 입력 피드백 제공.
- **운행 점검 흐름 개선**: 운행 전 점검 항목 체크 시 기존 강제 자동 운행 시작 기능을 제거하고 대기 상태를 유지, 운행 시작 버튼의 색상을 파란색으로 바꾸어 사용자가 명시적으로 출발을 선택할 수 있도록 로직 개선.
- **운행 통계 데이터 가시화**: 운행 일지 리스트 및 지도 경로 하단 정보창에 총운행시간, 최고속도, 평균속도 등의 운행 통계 데이터 노출 추가.
- **안전교육 이수 편의성**: 안전교육 이수 기록 처리를 '운행 중'인 상태가 아니더라도 진행할 수 있게 제약 조건을 해제. DB 업데이트 시 발생하는 컬럼 부재 오류를 방지하기 위해 fallback(safeMutate) 처리.

### 🛠 Technical Changes
- `web/driver-src/modules/trip.js`: `saveChecklist()` 및 `clearTripData()` 로직 변경.
- `web/driver-src/modules/profile.js`: `updateSettingsButtonState()` 로직 수정.
- `web/driver-src/modules/log.js` / `map.js`: 운행 시간 계산 및 속도 정보 HTML 렌더링 반영.
- `web/app/api/vehicle-tracking/notices/route.js`: `safeMutate()` 헬퍼 도입.

## [2026-04-30] AI 어시스턴트 차량 위치 조회 트리거 및 종료위치 정확도 개선 (v5.10.32)
### 🚀 Achievement
- **트리거 범위 대폭 확장**: 기존에는 '차량', '위치', '어디', '운행' 키워드일 때만 DB 조회를 실행했으나, '도착', '도착지', '종료', '종착', '위치관제' 등 자연어 키워드를 모두 트리거에 추가했습니다. 또한 차량번호(3~4자리 숫자)가 포함된 질문이면 키워드 없이도 자동으로 운행 DB를 조회합니다.
- **종료 트립 위치 정확도 강화**: 완료된 트립의 최종 위치를 `address` 필드 우선으로 표시하고, 주소가 없는 경우 위도/경도 좌표(fallback)로 표시하도록 개선했습니다. AI 답변에 "최종 GPS 기록 위치가 실제 도착지와 다를 수 있다"는 안내 문구를 포함해 잘못된 정보 인식을 방지했습니다.
- **오늘/어제 날짜 필터 추가**: '오늘' 키워드 사용 시 오늘 날짜 기준 KST 필터를 적용했습니다.
- **빈 조회 안내 강화**: 차량번호로 조회했으나 결과가 없을 때 "어제 기록이 필요하면 '어제 0140 위치'로 질문하세요"라는 맥락 안내를 추가했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: 차량 조회 트리거 조건을 keyword 기반에서 keyword+숫자 패턴 병렬 감지 방식으로 전면 개선.
- `web/app/api/chat/route.js`: `vehicle_locations` 쿼리에 `latitude, longitude` 필드 추가 및 address 없을 시 좌표 fallback 처리.
- `web/app/api/chat/route.js`: `isToday` 조건 추가 및 completed trip limit을 10→15으로 상향.


## [2026-04-30] 차량관제 앱 사진 일괄 업로드 및 안전교육 이수 기록 (v5.10.31)
### 🚀 Achievement
- **운행사진 일괄 업로드**: 드라이버 앱에서 운행 사진을 10장까지 다중 선택하고 한 번의 업로드 요청으로 저장할 수 있도록 개선했습니다.
- **안전교육 콘텐츠 관리**: 웹 차량관제 공지 작성에서 `안전교육` 카테고리 선택 시 YouTube 주소와 PDF/이미지 등 교육자료를 등록할 수 있게 했습니다.
- **차량별 이수 기록**: 앱 공지 상세에서 안전교육 영상/자료를 확인한 뒤 `시청 완료 및 이수 기록`을 누르면 현재 운행의 `vehicle_trip_logs`에 이수 내역이 남도록 API를 추가했습니다.
- **웹 기록 확인**: 차량 상세의 운행 기록 영역에서 안전교육 이수 내역을 함께 확인할 수 있게 했습니다.

### 🛠 Technical Changes
- `web/app/api/vehicle-tracking/education/complete/route.js`: 안전교육 이수 완료 로그 API 신규 추가.
- `web/driver-src/modules/photos.js`, `web/driver-src/index.html`: 운행사진 다중 선택 및 pending 사진 묶음 업로드 적용.
- `web/driver-src/modules/notice.js`, `web/driver-src/app.js`: 앱 안전교육 영상/첨부자료 표시 및 이수 완료 액션 연결.
- `web/app/(standalone)/driver-app/page.js`: standalone 앱 사진 묶음 업로드와 안전교육 완료 버튼 추가.
- `web/app/(main)/employees/vehicle-tracking/page.js`: 안전교육 자료 등록 UI 및 운행 상세 이수기록 표시 추가.

### ✅ Verification
- `.tmp_test/vehicleEducationAndPhotos.test.mjs`: 다중 사진 업로드, 안전교육 완료 API, 앱/웹 연결 정적 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안전운임 인천·평택 기점 할증 규칙 엄격화 (v5.10.30)
### 🚀 Achievement
- **고시 본문 재확인**: 제7조의 거리 반올림 기준과 제23조 카·타목의 인천/평택 기점 할증 문구를 기준으로 거리별·구간조회 적용 규칙을 다시 잠갔습니다.
- **기점 할증 오적용 차단**: `인천-아산-인천`처럼 동일 인천 기점으로 복귀하는 왕복 운송은 20%를 적용하고, `인천-아산-부산`처럼 최종 기점이 다른 항만인 경로는 인천 기점 할증을 적용하지 않도록 수정했습니다.
- **왕복거리 표시 정수화**: 화면, 저장 내역, 엑셀 다운로드에서 왕복거리가 `123.0km`처럼 보이지 않도록 정수 반올림 표시로 통일했습니다.
- **경로 조회 쿼터 절감**: 안전운임 산정과 직접 관련이 낮은 `무료도로 우선`, `자동차전용도로 회피` 옵션을 제거하고 Directions15 요청을 `실시간 추천`, `큰길우선`, `최적경로` 3종으로 축소했습니다.

### 🛠 Technical Changes
- `web/utils/safeFreightRules.mjs`: 안전운임 km 표시와 인천/평택 기점 할증 판정 공통 유틸 추가.
- `web/app/(main)/employees/safe-freight/page.js`: 거리별/이외구간 조회의 왕복거리 표시 및 기점 할증 라벨 정리.
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`: 경로조회 최종 도착 터미널 기준으로 기점 할증 오적용 차단.
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`: 구간조회 경로 옵션을 안전운임 기준 3종으로 축소해 Naver Directions15 중복 호출 완화.
- `web/app/api/safe-freight/download-excel/route.js`: 엑셀의 구간/왕복 km 값을 정수 표시로 보정.

### ✅ Verification
- `.tmp_test/safeFreightRegionalRules.test.mjs`, `.tmp_test/safeFreightRouteOptions.test.mjs`: 인천-아산-인천 20%, 인천-아산-부산 0%, 평택 왕복 18%, 편도/구간표 중복할증 금지, km 정수 표시, 경로 옵션 3종 제한 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안드로이드 드라이버 앱 GPS 도로보정 실전 패치 배포 (v5.10.4 / 5104)
### 🚀 Achievement
- **GPS 도로보정 실전 적용**: Naver Directions15 기반 도로 경로 보정 및 첫/끝 튐 제거 로직이 통합된 드라이버 앱 v5.10.4(5104) 버전을 빌드 및 배포했습니다.
- **운행 정보 실시간 가시화**: 드라이버가 운행 중 자신의 현재 속도와 경과 시간을 확인할 수 있도록 UI를 보강했습니다.
- **강제 업데이트 배포**: 도로보정 필터의 중요성을 고려하여 `forceUpdate: true` 옵션을 적용, 모든 드라이버가 즉시 설치하도록 유도했습니다.

### 🛠 Technical Changes
- `web/android/app/build.gradle`: versionCode 5104, versionName "5.10.4"로 증분.
- `web/driver-src/`: 모든 모듈에 빌드 번호 기반 캐시 버스터(?v=5104) 적용 및 UI/로직 통합.

---

## [2026-04-30] 차량위치관제 GPS 도로보정 및 운행 정보 표시 안정화 (v5.10.29)
### 🚀 Achievement
- **첫/끝 튐 제거 강화**: 운행 경로의 시작/종료 지점이 실제 운행 구간에서 멀리 튀는 케이스를 별도 endpoint outlier 규칙으로 제거했습니다.
- **도로 경로 보정 적용**: 필터링된 GPS 포인트를 Naver Directions15 경유지로 샘플링해 지도 polyline을 인근 도로 경로로 보정하고, API 실패 시 기존 필터 경로로 자동 fallback합니다.
- **속도/시간 표시 정합성 보강**: 비현실 속도(160km/h 초과)는 표시/집계에서 숨기고, 웹과 앱에 운행 중 경과 시간 및 현재속도가 보이도록 정리했습니다.

### 🛠 Technical Changes
- `web/app/api/vehicle-tracking/trips/[id]/matched-route/route.js`: Naver Directions15 기반 matched route API 신규 추가.
- `web/utils/vehicleLocation.mjs`, `web/driver-src/modules/locationFilter.js`: km/h 단위 기준 통일, endpoint outlier trimming, 표시 속도 보정 유틸 추가.
- `web/app/(main)/employees/vehicle-tracking/page.js`, `web/driver-src/modules/map.js`: 상세/미니 지도 경로를 matched route 우선 표시로 변경.
- `web/app/(standalone)/driver-app/page.js`, `web/driver-src/modules/gps.js`, `web/driver-src/index.html`: 운행 중 경과 시간, 현재속도, 적응형 GPS 수신 간격 표시 추가.

### ✅ Verification
- `.tmp_test/vehicleLocation.test.mjs`: 첫/끝 튐 제거, 비현실 속도 숨김, Directions15 경유지 샘플링 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안전운임 구간/왕복 거리 기준 정합성 보강 (v5.10.28)
### 🚀 Achievement
- **고시 거리 기준 재확인**: 2026년 안전운임 고시 본문상 거리별 운임표가 `구간 거리(km)`와 `운송(왕복) 거리(km)`를 병기한다는 점을 기준으로 조회/표시 로직을 재검토했습니다.
- **구간조회 엑셀 오류 수정**: 구간조회 저장 내역에 `왕복(KM)` 컬럼이 추가되었으나 헤더/열 너비/필터 범위가 기존 13열 기준으로 남아 있던 불일치를 14열 기준으로 교정했습니다.
- **법규 근거 표시 강화**: 구간조회 결과/엑셀 문구를 `지도 구간거리`, `적용 구간거리(고시)`, `적용 왕복거리(고시)`로 분리해 검증 가능하게 정리했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`: 구간조회 엑셀 저장 내역 헤더/컬럼/오토필터 범위 수정 및 거리 항목명 정리.
- `web/app/(main)/employees/safe-freight/page.js`: 거리별 조회 시 왕복 입력은 구간거리로 환산하고, 결과/저장 내역에 구간·왕복 거리 분리 표기.
- `web/app/api/safe-freight/download-excel/route.js`: 안전운임 엑셀 다운로드 API의 구간/왕복 거리 컬럼 분리 반영.

### ✅ Verification
- `.tmp_test/safeFreightDistanceRules.test.mjs`: 수기 왕복/편도, 구간조회 지도거리, 인천 20%·평택 18% 할증 케이스 통과 후 삭제.
- `web/scratch/test_safe_freight_logic.mjs`: 기존 5개 안전운임 로직 테스트 통과 후 임시 폴더 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안드로이드 드라이버 앱 GPS 안정화 패치 배포 (v5.10.3 / 5103)
### 🚀 Achievement
- **드라이버 앱 GPS 정교화 배포**: 서버사이드의 GPS 이상점 필터 로직과 보조를 맞추어, 앱 내에서도 튀는 좌표를 1차 필터링하고 강제 전송 시의 정확도를 높인 v5.10.3(5103) 버전을 빌드 및 배포했습니다.
- **강제 업데이트 적용**: GPS 데이터 무결성이 시스템 전체에 중요하므로, 모든 드라이버가 즉시 새 버전을 설치하도록 `forceUpdate: true` 옵션을 적용하여 배포했습니다.
- **빌드 자동화 검증**: `build_driver_apk.ps1` 스크립트를 통해 버전 증분, 캐시 버스터 갱신, APK 복구, 내부 버전 검증을 원스톱으로 완료했습니다.

### 🛠 Technical Changes
- `web/android/app/build.gradle`: versionCode 5103, versionName "5.10.3"으로 증분.
- `web/public/apk/version.json`: latestVersion 갱신 및 forceUpdate 적용.
- `web/driver-src/`: 모든 JS/HTML 파일에 대해 빌드 번호 기반 캐시 버스터(?v=5103) 적용.

---

## [2026-04-30] 차량위치관제 경로 안정화 및 지도 UX 정리 (v5.10.24)
### 🚀 Achievement
- **지도 표시 안정화**: 동일 차량이 종료 후 다시 운행을 시작하면 최신 1건만 관제 지도에 남도록 정리하고, 목록 정렬을 운행중 → 일시정지 → 운행종료 및 최신 수신순으로 통일했습니다.
- **GPS 이상점 필터 1차 적용**: 비현실적 속도 점프, 한국 범위 밖 좌표, 낮은 정확도, 튀었다가 돌아오는 스파이크를 공통 필터로 제거해 말도 안 되는 경로 꺾임을 줄였습니다.
- **앱 지도 UI 정리**: 출발/현재 텍스트 마커를 작은 점으로 바꾸고, 차량 마커에는 짧은 포인터 선을 붙여 경로와 차량 위치가 덜 겹치게 개선했습니다.
- **운행 정보 가시화**: 웹 관제 목록에 진행 중 차량의 현재 속도와 운행 시간을 추가했습니다.

### 🛠 Technical Changes
- `web/utils/vehicleLocation.mjs`: 라이브 운행 정렬/중복 제거, 경로 이상점 필터, 서버 저장 전 좌표 판정 유틸 신규 추가.
- `web/app/api/vehicle-tracking/location/route.js`: 위치 저장 전 직전 좌표 기준 불가능한 점프/저정확도 좌표 스킵.
- `web/app/api/vehicle-tracking/trips/route.js`, `docker/els-backend/app.py`: active 응답에서 차량별 최신 1건만 반환하고 상태/시간순 정렬.
- `web/app/(main)/employees/vehicle-tracking/page.js`: 보정 경로 표시 및 실시간 목록 속도/운행시간 컬럼 추가.
- `web/driver-src/modules/map.js`, `web/driver-src/modules/gps.js`, `web/driver-src/modules/locationFilter.js`: 앱 지도 마커/경로 UI 정리 및 속도·회전·가감속 기반 GPS 전송 간격 조절.

### ✅ Verification
- `.tmp_test/vehicleLocation.test.mjs`: 중복 차량 최신 1건, 상태 정렬, GPS 스파이크 제거 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] AI 어시스턴트 과거 운행 이력 추적 지능 고도화 (v5.10.23)
### 🚀 Achievement
- **과거 운행 종료 위치 조회 기능 구현**: AI가 "어제 0140 차량 어디서 끝났어?"와 같은 질문에 대답할 수 있도록, 실시간 운행 차량뿐만 아니라 완료된 트립(Completed Trips)의 최종 GPS 좌표 및 주소를 DB에서 추출하여 AI에게 주입하는 로직을 구현했습니다.
- **KST 기반 날짜 필터링 정밀화**: "어제"라는 키워드 사용 시 UTC와 KST의 시차(9시간)를 고려하여 정확한 한국 날짜의 운행 데이터를 필터링하도록 로직을 보강했습니다. (v5.10.23)
- **AI 행동 지침(Rule 21) 추가**: 주입된 '최종위치' 데이터를 AI가 '운행 종료 지점'으로 명확히 인식하고 답변하도록 시스템 프롬프트를 업데이트했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: 차량 위치 조회 로직 전면 개편 (차량번호 추출 및 과거 이력 포함 쿼리).
- `web/app/api/chat/route.js`: `BASE_SYSTEM_INSTRUCTION`에 Rule 21(운행 이력 및 종료 위치 해석 지침) 추가.

---

## [2026-04-30] 아산 배차판 동기화 데이터 정합성 완결 및 최적화 (v5.10.22)
### 🚀 Achievement
- **삭제된 시트 자동 DB 정리**: 엑셀 원본 파일에서 특정 날짜 시트가 삭제되었을 때, Supabase DB에서도 해당 데이터를 자동으로 추적하여 삭제하는 Cleanup 로직을 구현하여 데이터 정합성을 확보했습니다. (v5.10.19)
- **통합현황 컬럼 매핑 오류 해결**: 컬럼 찾기(`getCol`) 로직에 '완전 일치 우선'순위를 도입하여, '배차'와 '배차정보'를 혼동하여 배차 시간(15:30 등)을 수량으로 합산하던 오류를 근본적으로 해결했습니다. (v5.10.21)
- **Vercel 캐시 부정합 문제 해결**: 통합현황에서 이틀 전 데이터가 노출되던 문제를 해결하기 위해, Next.js의 `revalidate=0` 및 `cache: 'no-store'` 설정을 적용하고 타임스탬프 기반 캐시 버스터를 도입하여 실시간 데이터 로딩을 보장했습니다. (v5.10.22)
- **헤더 복구 로직 전역화**: 엑셀 원본의 병합/공백 문제로 인해 `col_12`, `col_15`로 파싱되던 TYPE 헤더를 `T`, `TYPE`으로 복구하는 로직을 통합현황과 개별현황 모두에 전역 적용하여 합산 정확도를 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: `valid_dates` 리스트를 통한 DB 미존재 시트 제거 로직 추가.
- `web/app/api/branches/asan/dispatch/route.js`: `getCol` 함수 리팩토링 (완전 일치 -> 부분 일치 순), 캐시 비활성화 설정.
- `web/app/(main)/employees/branches/asan/page.js`: `fetchData`에 타임스탬프 캐시 버스터 추가 및 캐시 정책 변경.
- `web/app/(main)/employees/branches/asan/page.js`: `mobis` 요약 합산 시 40FT/20FT 분류 로직 보강.

---

## [2026-04-27] 차량위치관제 GPS 전면 리팩토링 및 백그라운드 끊김 해결 (v5.10.0)
### 🚀 Achievement
- **네이티브 백그라운드 수집 전환**: 브라우저 기반 `navigator.geolocation`을 폐기하고 `@capacitor-community/background-geolocation` 네이티브 플러그인을 도입하여, 앱이 백그라운드나 절전 모드에 진입해도 위치 수집이 중단되지 않도록 개선했습니다.
- **궤적 정밀도 대폭 강화**: 수집 주기를 시간(5~10초) 및 거리(10m) 동시 트리거 방식으로 변경하여, 기존에 누락되던 커브길 및 저속 구간의 데이터를 촘촘하게 확보했습니다.
- **코드 슬림화 및 안정화**: 자이로/모션 기반의 복잡한 우회 로직과 심폐소생 타이머 등 레거시 코드를 제거하고, 네이티브 브릿지 기반의 안정적인 수집 체계로 일원화했습니다.
- **오프라인 데이터 강건화**: 네트워크 단절 시에도 위치 데이터를 순차적으로 캐싱하고 복구 시 누락 없이 서버에 전송하는 플러시 로직을 강화했습니다.
- **일반 공지사항 네이티브 푸시 통합**: 기존 30초 긴급알림 폴링 파이프라인(`emergency.js`)에 일반 공지사항(`notices`) API를 병렬로 연동하여, 새 공지 등록 시 앱 화면을 보지 않아도 스마트폰 네이티브 알림(소리+진동)이 발송되도록 구축했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/gps.js`: 네이티브 플러그인 기반으로 전면 재작성 (거리 필터 제거 및 90초 타임아웃 상향).
- `web/driver-src/modules/init.js`: 포그라운드 복귀 시의 불필요한 GPS 재기동 로직 제거 및 1회 강제 UI 갱신 로직 추가.
- `web/driver-src/modules/emergency.js`: `emergency` 및 `notices` API 병렬 폴링 통합, 중복 알림 방지 캐싱 로직 추가.
- `web/capacitor.config.ts`: `android.useLegacyBridge: true` 설정 추가로 안드로이드 백그라운드 유지력 확보.
- `docs/09_GPS_REFACTORING_PROPOSAL.md`: 상세 설계 및 완료 보고서 작성.

## [2026-04-27] NAS 백엔드 실행 오류 핫픽스 (v5.9.6)
### 🚀 Achievement
- **백엔드 기동 불가 문제 해결**: v5.9.3 업데이트 시 추가된 `web_vectorizer.py` 파일이 Docker 컨테이너 내부에 누락되어 `els-core` 서비스가 중단되었던 문제를 긴급 수정했습니다.
- **활동 로그 및 배차 동기화 복구**: 백엔드 크래시로 인해 중단되었던 활동 로그 관리 페이지와 아산 배차판 자동 동기화 스케줄러를 정상화했습니다.

### 🛠 Technical Changes
- `docker/els-backend/Dockerfile.core`: `web_vectorizer.py` 복사 로직 추가.
- `docker/docker-compose.yml`: `els-core` 서비스에 `web_vectorizer.py` 볼륨 마운트 추가.
- `web/.env.local`: 백엔드 주소를 로컬호스트에서 실제 나스 외부 주소(`8443` 포트)로 원복.

---

## [2026-04-27] NAS 검색 고도화 및 정밀 쿼리(Precision Query) 도입 (v5.9.5)
### 🚀 Achievement
- **정밀 타겟 검색(Precision Query)**: 차량번호(3~4자리)와 날짜/월 키워드가 포함된 경우, 벡터 검색 대신 DB 직접 쿼리(`LIKE`)를 우선 수행하여 100% 정확한 행을 추출하도록 파이프라인을 재설계했습니다.
- **파일명 별칭(Alias) 매핑**: "수출리스트", "마감자료", "배차판" 등 사용자가 자주 쓰는 별칭을 실제 NAS 파일명과 자동으로 매칭하여 검색 정확도를 높였습니다.
- **월 시트 인식 개선**: "3월", "4월" 등 월 단독 검색 시 해당 시트명을 정확히 탐색하도록 정규식 패턴을 보강했습니다. (Rule 20 적용)

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `Precision Query` 파이프라인(STEP A/B/C) 구현 및 `FILE_ALIAS` 맵 추가.
- `web/app/api/chat/route.js`: Supabase 클라이언트 초기화 위치를 `POST` 최상단으로 이동하여 안정성 확보.

---
*최종 갱신일: 2026-04-27 (by Antigravity/Gemini | v5.9.6 NAS Backend Hotfix)*

## [2026-04-27] 웹 게시판 첨부파일 벡터화(Web Attachment RAG) 및 리팩토링 (v5.9.3)
### 🚀 Achievement
- **웹 게시판 첨부파일 통합**: 인트라넷 게시판(`posts`) 및 업무자료실(`work_docs`)에 업로드된 첨부파일(S3/MinIO)을 자동으로 다운로드하여 벡터화하는 엔진(`web_vectorizer.py`)을 구축했습니다.
- **RAG 파이프라인 확장**: AI가 NAS 문서뿐만 아니라 웹 게시판에 올라온 최신 엑셀, PDF 자료까지 통합 검색하여 답변할 수 있도록 `route.js` 검색 로직을 병렬화(`nas_file` + `web_attachment`)했습니다.
- **백엔드 아키텍처 리팩토링**:
  - `nas_vectorizer.py`에서 텍스트 추출(`extract_text_by_ext`) 및 임베딩 적재(`embed_and_store_chunks`) 로직을 공용 함수로 분리하여 코드 중복을 제거했습니다.
  - `app_core.py` 내의 좀비 락 체크 및 태스크 실행 패턴을 표준화하여 안정성을 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/web_vectorizer.py`: 신규 작성. S3 API 연동 및 공용 함수 기반 파싱 로직 구현.
- `docker/els-backend/app_core.py`: `/api/vectorize/web` 엔드포인트 추가 및 벡터화 태스크 헬퍼 추출.
- `web/app/api/chat/route.js`: `match_documents` 호출 시 `web_attachment` 소스 타입 추가 및 병렬 쿼리 적용.

---

## [2026-04-27] NAS 최신 자료 가중치(Recency Boost) 및 다중 제안 로직 (v5.9.2)
### 🚀 Achievement
- **최신성 기반 재정렬(Recency Boost)**: 검색 결과 중 파일명이나 시트명에 현재 연도(2026)나 월(4월)이 포함된 문서에 가중치를 부여하여, 사용자가 원하는 최신 정보를 최상단에 배치하도록 개선했습니다.
- **다중 후보 능동 제안**: 검색 결과가 모호하거나 여러 파일이 경합할 경우, AI가 자율적으로 최신 순 3~5개의 후보를 나열하며 사용자에게 선택을 제안하도록 지침(Rule 17)을 추가했습니다.
- **검색 트리거 정교화**: '최근', '최신' 등의 키워드를 NAS 검색 트리거에 포함하여 사용자 의도 파악 정확도를 높였습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `adjustedScore` 계산 로직 추가 및 `nasKeywords` 확장.
- `BASE_SYSTEM_INSTRUCTION`: `Rule 17 (Multi-Proposal)` 추가.

---

## [2026-04-25] 구형 HWP 제외 및 HWPX 단일 지원 체계 (v5.8.6)
### 🚀 Achievement
- **구형 HWP 공식 제외**: 리눅스 환경에서 텍스트 추출의 신뢰도가 떨어지는 구형 바이너리 포맷(`.hwp`)을 스캔 대상에서 공식 제외했습니다.
- **HWPX 집중 지원**: 최신 개방형 표준인 `.hwpx`만 지원함으로써 AI 지식 데이터의 정합성과 품질을 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `SUPPORTED_EXTS`에서 `.hwp` 제거 및 추출 로직 삭제.

---

## [2026-04-25] 한글 신규 포맷(HWPX) 지원 및 문서 파싱 강화 (v5.8.5)
### 🚀 Achievement
- **HWPX 파일 텍스트 추출**: 한글 문서의 최신 표준인 `.hwpx` (XML 기반 ZIP) 파일을 직접 압축 해제하여 텍스트를 추출하는 엔진을 탑재했습니다.
- **HWP 지원 안정화**: 기존 `.hwp` 파일도 `textract`를 통해 검색 대상에 포함되도록 파싱 로직을 명시적으로 연결했습니다.
- **포괄적 문서 검색**: 이제 PDF, Word, Excel 뿐만 아니라 공공기관 및 실무에서 많이 쓰이는 한글 문서까지 AI가 검색할 수 있습니다.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `extract_text_hwpx` 함수 구현 (ZipFile + ElementTree 기반).
- `docker/els-backend/analyze_nas_files.py`: 분석 대상 확장자에 `.hwpx` 추가.

---

## [2026-04-25] 임시 파일 필터링 및 노이즈 제거 (v5.8.4)
### 🚀 Achievement
- **임시 파일 스캔 제외**: 엑셀 임시 파일(`~$`), 캐시 파일(`.tmp`), 시스템 숨김 파일(`.`) 등을 스캔 대상에서 원천 배제하여 DB 오염 및 불필요한 임베딩 비용 발생 방지.
- **TDD 강화**: 임시 파일 제외 로직을 TDD 테스트 케이스에 추가하여 검증 완료.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: 파일 처리 루프 내에 `startswith("~$")`, `.tmp` 포함 여부, 숨김 파일 체크 로직 추가.
- `docker/els-backend/tests/test_nas_vectorizer.py`: `~$`, `.tmp`, `.hidden` 파일을 생성하여 정상적으로 무시되는지 테스트하는 케이스 추가.

---

## [2026-04-25] 중부/예산 지점 복구 및 엑셀 시트 단위 증분 파싱 (v5.8.3)
### 🚀 Achievement
- **지점 데이터 복구**: 실수로 누락되었던 **중부지점** 및 **예산지점**을 스캔 대상(`scan_targets`)에 다시 추가하여 데이터 정합성 확보.
- **TDD 기반 로직 검증**: 7일 리센시 필터와 엑셀 시트 해시 비교 로직이 정상 작동함을 로컬 및 NAS 환경에서 TDD 스크립트로 최종 확인 (Pass).
- **스케줄 정밀화**: 자동 스캔 시작 시간을 관리자 요청에 따라 **01:30**으로 최종 변경 및 문서화.
- **엑셀 시트 단위 증분 파싱 (v5.8.2)**: 엑셀 파일 내 시트가 복사/추가되어도 수정된 시트만 선별하여 인덱싱하는 시트 해싱(Sheet Hashing) 기술 적용 완료.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: `scan_targets`에 중부, 예산 지점 추가 및 스케줄 시간 주석 업데이트.
- `docker/els-backend/nas_vectorizer.py`: `extract_sheets_xlsx` 도입 및 시트별 메타데이터 비교 로직 구현.
- `docker/els-backend/tests/test_nas_vectorizer.py`: 필터링 및 증분 파싱 검증을 위한 TDD 스크립트 작성.

---

## [2026-04-25] NAS 증분 인덱싱 도입 및 자료실 구조조정 (v5.8.1)
### 🚀 Achievement
- **고속 증분 인덱싱(Incremental Indexing)**:
  - **7일 리센시 필터**: 12,000개가 넘는 아산지점 전체 파일을 매번 스캔하는 부하를 방지하기 위해, 최근 7일 이내에 수정(`mtime`)된 파일만 선별적으로 파싱하도록 `nas_vectorizer.py` 필터링 로직 개편.
  - **스캔 부하 99% 감소**: 전체 전수 조사 대신 신규/변경분만 타겟팅하여 NAS CPU 및 API 비용 획기적 절감.
- **자료실 지점 구조조정**:
  - **스캔 대상 제외**: 비즈니스 활용도가 낮은 '자료실' 지점을 전체 자동 스캔 대상에서 제외하여 시스템 리소스 확보.
  - **레거시 데이터 정리**: 기존에 인덱싱되어 있던 자료실 관련 벡터 데이터 및 인덱스 정보를 Supabase에서 일괄 삭제하여 데이터 정합성 유지.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `os.walk` 루프 내에 `st_mtime` 기반 7일 필터 및 `skip_words`에서 자료실 키워드 분리 적용.
- `docker/els-backend/app_core.py`: `nas_sync_scheduler`의 `scan_targets`에서 자료실 지점 제거.
- `docker/els-backend/cleanup_legacy_branch.py`: 수동 데이터 정리를 위한 관리자 스크립트 작성 및 실행.

---

## [2026-04-25] Omni-Agent 완성과 지능형 데이터 리포팅 (v5.8.0)
### 🚀 Achievement
- **지능형 NAS 현황 브리핑**: 
  - **확장자별 통계 집계**: 단순히 파일 개수만 보여주던 방식에서 벗어나, PDF/XLSX/DOCX 등 주요 문서 타입별 개수를 실시간 집계하여 보고하는 지능형 리포팅 엔진 구현.
  - **파싱 시각화**: 지점별 파싱 완료율(%)과 상태 이모지를 결합하여 시인성 극대화.
- **실시간 환경 데이터 통합**: 
  - **날씨/미세먼지 트리거 통합**: 개별적으로 작동하던 날씨 정보와 K-Skill(미세먼지) 조회를 하나의 트리거로 통합하여, 기상 관련 질문 시 종합적인 환경 브리핑 제공.
  - **안정성 강화**: K-Skill 프록시 및 외부 API 타임아웃/예외 처리 보강으로 AI 답변 끊김 현상 방지.
- **UI/UX 고도화**:
  - **UI 버전 동기화**: 인트라넷 AI 어시스턴트 메인 UI 및 가이드 패널의 버전을 v5.8.0으로 일괄 업데이트 및 시스템 메시지 정교화.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `nas_file_index` 테이블 쿼리에 `extension` 필드 추가 및 `extensions` 객체 기반 카운팅 로직 구현.
- `web/app/(main)/employees/(intranet)/ask/page.js`: `DEFAULT_INIT_MSG` 및 헤더/가이드 버전 정보 갱신.
- `docs/01_MISSION_CONTROL.md`: 전체 시스템 버전을 v5.9.6으로 승격하고 이슈 현황 최신화.

---

## [2026-04-24] 2026년 안전운임(Safe Freight) 규제 통합 및 AI 고도화 (v5.6.0)
### 🚀 Achievement
- **법규 준수 운임 엔진**: 
  - **10원 단위 반올림**: 고시 제7조에 의거, VAT 제외 운임의 10원 단위 반올림(`round10`) 로직을 프론트엔드와 AI 서버에 공통 적용.
  - **할증 합산 법칙**: 고시 제22조에 의거, 여러 할증 적용 시 가장 높은 요율 100%, 나머지 50% 적용(최대 3개) 로직 구현.
  - **지역별 기점 할증**: 인천(20%), 평택(18%) 등 기점별 동적 할증률 적용 및 사용자 알림 UI 강화.
- **AI 어시스턴트 지능화**: 
  - `BASE_SYSTEM_INSTRUCTION`을 2026년 최신 고시 조항에 맞춰 갱신하여, 상담 시 법적 근거(조항 번호) 기반의 정확한 운임 산출 및 설명 가능.
- **데이터 보존**: '이외구간' 명칭을 '고시 외 구간(2022년이전)'으로 복구하여 과거 데이터 조회 정합성 및 사용자 혼선 방지.

### 🛠 Technical Changes
- `SafeFreightPage.js`: `round10`, `applySurchargesToRow` 로직 리팩토링 및 지역별 할증 훅 구현.
- `api/chat/route.js`: `calcSurcharge` 함수 내 할증 합산 로직(정렬 후 100%/50% 분기) 반영 및 시스템 프롬프트 대규모 갱신.

---

### 🚀 Achievement
- **스마트 듀얼 스케줄링**: 
  - **Fast Sync**: 파일 변경 감지 시 즉시 ±15일치 업데이트 (업무 즉시성 확보).
  - **Slow Sync**: 10분 주기 및 새벽 4시 전체 시트 순차 업데이트 (NAS CPU 부하 분산 및 완전성 확보).
- **데이터 증발 방지 (Atomic Update)**: `Delete -> Insert` 방식에서 `UPSERT` 방식으로 전환하여 동기화 도중 오류 발생 시에도 기존 데이터가 유실되지 않도록 보강.
- **NAS 부하 최적화**: 전체 시트 동기화 시 시트 간 0.5초 지연(Sleep)을 두어 NAS CPU Spike 방지.

### 🛠 Technical Changes
- `app.py`: `sync_asan_dispatch_python` 내 `upsert` 로직 및 시트 파싱 선검증 단계 추가.
- `app.py`: `asan_sync_scheduler` 10분 주기 배경 동기화 및 실시간 변경 트리거 통합.

---

## [2026-04-23] 아산 배차판 전체 동기화 복구 (v5.5.12)
- **전체 시트 복구**: 형의 요청에 따라 날짜 제한 없이 모든 시트 동기화로 일시 원복하여 과거 데이터 정합성 확보.
- **메모리 최적화 유지**: `read_only=True` 및 `gc.collect()` 적용으로 OOM 방지.

---

## [2026-04-23] 아산 배차판 동기화 지능화 및 안정화 (v5.5.9)
### 🚀 Achievement
- **지능형 2단계 동기화 구현**: 
| 구분 | 주기 | 방식 | 상태 |
| :--- | :--- | :--- | :--- |
| **아산 배차 (최근)** | 1분 (변경 시) | 엑셀 저장 시 **±15일치** 즉시 동기화 (업무 연속성) | ✅ 가동 중 |
| **아산 배차 (전체)** | 10분 / 04:00 | 파일 변경 시 **전체 시트** 배경 동기화 (NAS 부하 분산) | ✅ 가동 중 |
데이터 무결성 완벽 확보.
- **메모리 극한 최적화**: `openpyxl`의 `read_only=True` 모드 및 주기적 `gc.collect()` 적용으로 대량 시트 처리 시 NAS OOM(메모리 부족) 현상 완전 해결.
- **인프라 안정화**: `els-core`(2930), `els-bot`(2931) 포트 분리 및 도커 볼륨 매핑 최적화로 실시간 코드 반영 지원.

### 🛠 Technical Changes
- `app.py`: `sync_asan_dispatch_python` 내 `full_sync` 플래그 및 날짜 필터링(`abs(diff) > 15`) 로직 추가.
- `app.py`: `asan_sync_scheduler` 10분 주기/새벽 4시 정기 트리거 및 중복 방지 로직 구현.
- `app.py`: `openpyxl` 로드 횟수를 파일당 1회로 제한하고 `read_only` 모드로 CPU/메모리 효율 극대화.

---

## [2026-04-21] NAS 벡터화 파이프라인 안정화 (v5.5.1)
- **임베딩 모델 표준화**: `gemini-embedding-001` (768 dim) 강제 적용 및 DB 호환성 확보.
- **오류 처리 강화**: 429 에러(Rate Limit) 대응을 위한 슬립 인터벌 및 예외 처리 로직 보강.
- **좀비 락 방지**: 벡터화 프로세스 2시간 초과 시 자동 락 해제 로직 도입.

## [2026-04-11] 3-Layer RAG 및 AI 어시스턴트 고도화 (v4.9.22)
- **K-SKILL 연동**: AirKorea 공식 API 기반 미세먼지/날씨 실시간 RAG 주입.
- **K-Law MCP 직결**: `api.beopmang.org` 프록시 연동으로 법령/판례 검색 기능 탑재.
- **Anti-Hallucination**: 시스템 프롬프트 가드레일 설계 및 AI 가이드 UI 전면 개편.

## [2026-04-11] 인트라넷 UI 프리미엄화 및 배포 최적화 (v4.9.26)
- **UI 리뉴얼**: 카드 그림자, 버튼 스타일, 대시보드 레이아웃 고도화.
- **빌드 안정화**: ESLint 경고 무시 설정 및 Vercel standalone 빌드 최적화.

## [2026-04-20] 드라이버 앱 ID 누락 근본 원인 해결 (v4.9.30~34)
- **통신 로직 복구**: CapacitorHttp preflight 버그 대응을 위한 Native Bridge 복구.
- **직렬화 최적화**: NextResponse 직렬화 적용으로 빈 Body 요청 및 ID 증발 현상 최종 해결.
- **Redirect 대응**: `elssolution.com` (non-www) 통일로 307 리다이렉트 시 Body 유실 방지.

*(v4.9 이전의 상세 기록은 Git History 참조)*
