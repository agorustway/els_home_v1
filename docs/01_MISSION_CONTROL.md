# ELS MISSION CONTROL (v5.14.14 / APK v5.11.15)

> 최신 업데이트: 차량위치관제 실제 12가0140 테스트 3건을 분석해 안드로이드 캐시 좌표 재등장과 운행 중 경로 표시 혼선을 보정했습니다.

## CURRENT STATUS
- **동기화 정책**: 연간실적 `NAS 동기화` 버튼은 core 직접 파싱 대신 외부 Node importer를 `nice/ionice` 백그라운드 프로세스로 실행. 동일 파일+current snapshot 존재 시 `summary-only`, 파일 변경 시 snapshot import로 처리.
- **웹 버전**: v5.14.14
- **APK 버전**: v5.11.15
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 안전운임 상단 탭 순서를 `구간별운임 → 거리별운임 → 구간조회 → 이외구간`으로 정리.
  - 차량위치관제는 `android_bg`가 예전 좌표를 0km/h로 재전송하는 stale replay를 서버와 네이티브 앱 양쪽에서 차단하고, 운행 중 내 차량 마커 클릭 시 현재점/자동추적을 유지.
  - 선적관리 미선적 필터는 이력조회값이 있으면 `반입/적하`만 완료로 보고, 이외 이력은 작업일과 무관하게 미선적으로 판정.
  - 선적관리 컨테이너 조회 세션을 브라우저에 저장하고, 페이지 복귀 시 저장된 이력 결과를 기준으로 완료/실패/미확인 건수를 이어 표시.
  - 안전운임 주소 검색은 안전운임 데이터 키 기준으로 시도·시군구·행정동을 한 번에 정규화하고, 지도 경로조회는 터미널 키 기반으로 인천국제여객 구간운임을 우선 매칭.
  - 연간실적 core 자동 동기화와 대용량 엑셀 직접 조회는 기본 비활성화. NAS 직접 주입 스크립트만 운영 기본 경로.
  - 연간실적 sync 경로는 완료 후 `cache.pop(...)`, 대형 row/payload/hash 참조 해제, `gc.collect()` 수행.
  - 선적관리 sync/엑셀 fallback은 파싱 후 `shipping_cache`에 전체 원장을 저장하지 않고, 페이지 단위 응답 후 참조를 비움.
  - 배차판 sync는 pandas/openpyxl workbook, DataFrame, rows, comments 참조를 시트/파일 처리 후 즉시 비움.
  - 배차판 스케줄러는 컨테이너 재시작으로 인메모리 캐시가 비어도 Supabase `branch_dispatch.file_modified_at`가 최신이면 최초 전체 파싱을 생략.
  - NAS `els-core` 고메모리 원인은 core가 연간실적/배차/선적 엑셀 원장을 파싱 후 캐시하거나 재시작 후 최초 파싱을 반복하던 구조로 확인됨.
  - 연간실적 원장 장기 흐름 패널은 flex shrink를 차단하고 차트 높이/가로 스크롤 래퍼를 고정해 데스크탑에서 그래프가 잘리지 않게 함.
  - 갤럭시 S24 폭 기준 조사범위/분석섹션 버튼은 3열 배치, 월별/차량/매트릭스 표는 내부 가로 스크롤과 `%` 컬럼 여유폭으로 밀림 방지.
  - 모바일 아산지점 진입/배차판 검색 전환 시 window/document/상위 스크롤 컨테이너를 상단으로 초기화.
  - 연간실적 조사범위 버튼은 `전체 / 최근 12개월 / 최근 24개월 / 최근 3년 / 최근 5년 / 직접`으로 정리.
  - 저마진/근거 분석은 조사범위 적용 가능한 월별 breakdown만 사용. 기존 전체기간 breakdown이 모든 구간에 섞여 미래산업이 반복 노출되던 문제 차단.
  - 개요 화면의 근거 표는 제거하고, 계약/차량 탭에서 작업지·청구처·노선·구분 근거를 보도록 정리.
  - breakdown 후보를 우선순위 기반으로 선정해 `청구처`, `운송사(명의)`가 헤더 뒤쪽에 있어도 summary 근거 축에서 누락되지 않게 함.
  - 원장 장기 흐름 차트와 조사범위 KPI 카드는 개요 탭에만 표시해 세부 분석 탭 반복 노출을 제거.
  - 최근 12/24개월 등 구간 필터에서는 전체기간 breakdown fallback을 쓰지 않고, 월별 세부가 없으면 `구간별 월별 근거 갱신 필요`만 표시.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 368,617행 기준 조회 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, Bot은 2워커 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 잔여 Chrome 정리 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.15 빌드 완료 |

## INTRANET UI 기준
- **목록 테이블**: 고정 헤더, 균일 버튼 높이, 모바일 카드 대체 뷰.
- **상세 화면**: `Hero -> 주요 필드 Grid -> 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치 통일.
- **로딩 안내**: 아산지점 모든 페이지 초기 로딩 문구는 `데이터를 불러오는 중입니다...`, 폰트 `0.86rem / 800 / #64748b`.
- **실적관리**: 상단 `실적관리` 아래 `종합실적 / 월간실적 / 연간실적`; 연간실적은 조사범위 컨트롤 바로 아래 분석섹션 탭 고정.

## MILESTONES
- [x] Phase 1-6: AI 어시스턴트 및 RAG 기반 구축
- [x] v5.10: 차량위치관리 GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 아산 배차판/연간실적 분석 리포트 확장
- [x] v5.14: NAS core 대용량 엑셀 파싱 메모리 보호
- [ ] Next: 아산 월간실적 취합 및 연간+월간 합산 API

## RECENT CHANGES
- **v5.14.14**: 12가0140 2026-05-18 17시대 테스트 3건 기준으로 GPS 튐을 재분석. 1번은 좌표 자체보다 촘촘한 전경 샘플/도로 매칭 과신 문제, 2·3번은 `android_bg` 캐시 좌표 재등장으로 확인. 서버 stale replay 필터, Android 네이티브 전송 전 물리 필터와 `recorded_at`, 경로 waypoint 단순화, 운행 중 현재점 표시를 적용. APK v5.11.15 / 5156 빌드.
- **v5.14.13**: 선적관리 미선적 필터 기준을 `작업일 이후 MOVE TIME` 우선에서 컨테이너 이력구분 우선으로 보정. 이력조회값이 없는 행은 작업일이 지난 경우만 미선적 후보로 유지.
- **v5.14.12**: 선적관리 컨테이너 조회 상태를 `localStorage` 세션으로 보존하고 4초 주기로 저장 결과를 복원. 시작 이후 저장된 이력만 완료로 인정해 이전 조회 결과와 섞이지 않게 함.
- **v5.14.11**: 안전운임 탭 렌더 순서를 조정해 지도 기반 `구간조회` 버튼을 `이외구간` 앞에 배치.
- **v5.14.10**: 안전운임 기본 조회의 주소→행정동 자동 선택을 동기 정규화로 보정하고, 지도 기반 구간조회에서 `인천항국제여객터미널`이 `[왕복] 인천국제여객` 구간운임으로 매칭되도록 터미널 기점 판정을 강화.
- **v5.14.09**: 차량 위치 관제에서 `TRIP_END` 저품질/불가능 좌표는 마지막 정상점으로 수렴시키고, 앱 지도는 GPS 공백 중 짧은 예측 이동만 표시. 터널 출구 후보는 방향·속도상 맞을 때만 실제 경로로 연결. 완료 마커는 유지하되 동일 차량 재운행 시 진행 중 운행이 우선 표시되도록 보강.
- **v5.14.08**: `NAS 동기화` 버튼을 외부 Node importer 백그라운드 작업으로 연결. Core 메모리에 workbook/row를 남기지 않고, 동일 파일은 `summary-only`, 변경 파일은 snapshot import로 처리하도록 구성. Core Docker 이미지에 Node.js/npm/util-linux를 추가.
- **v5.14.07**: 구간 필터의 저마진/손실/고마진 패널에서 전체기간 fallback을 제거. 최근 12/24개월 조회에 실제 해당 기간 항목만 남기고, monthly breakdown이 없을 때는 갱신 필요 상태만 표시.
- **v5.14.06**: 구간 필터 적용 시 전체기간 breakdown만 있고 항목별 monthly breakdown이 없는 summary 데이터가 비어 보이던 문제를 보정. 화면은 전체기간 기준 fallback과 `월별 근거 갱신 필요`를 표시해 정확도 상태를 드러냄.
- **v5.14.05**: 연간실적 원장 장기 흐름 차트와 조사범위 KPI 카드가 모든 분석 탭에 반복 노출되던 구조를 개요 탭 전용으로 변경.
- **v5.14.04**: 연간실적 개요 근거 표를 제거하고 분석 탭명을 `계약/차량`으로 변경. 청구처가 비던 원인은 importer가 breakdown 후보를 엑셀 앞쪽 8개 컬럼으로 잘라 `청구처`를 누락할 수 있던 구조로 확인해 우선순위 기반 12개 후보로 보정.
- **v5.14.03**: 원장 장기 흐름 패널 높이를 확정해 KPI 카드에 그래프가 잘리는 문제를 차단. 범위 프리셋을 최근 12/24개월, 3/5년으로 정리하고 공헌도 매트릭스 대신 작업지/청구처/노선/구분 근거 표를 배치. summary breakdown 월별 집계 저장을 추가해 범위별 저마진 분석 기반 마련.
- **v5.14.02**: 모바일 아산지점 진입 시 이전 스크롤 위치가 복원되는 현상을 방지하고, 배차판 검색 전환도 상단 카드 기준으로 스크롤 초기화.
- **v5.14.01**: 아산 연간실적 원장 장기 흐름 차트가 flex 스크롤 영역에서 압축되어 보이지 않던 문제를 수정하고, 갤럭시 S24 기준 분석탭/조사범위/차량손익/월별표 `%` 컬럼 밀림을 보정.
- **v5.14.00**: `els-core` 연간실적 자동 엑셀 파싱을 기본 차단하고, 선적관리/배차판 파싱 완료 후 DataFrame/Workbook/rows/payload/cache 참조를 즉시 비우도록 보강. 배차판은 DB 파일수정일이 최신이면 컨테이너 재시작 후 최초 전체 파싱을 생략.
- **v5.13.103**: NAS 메모리 악화 중 Docker recreate가 60초 타임아웃으로 실패하지 않도록 Bot/Core 전용 배포 스크립트의 Docker/Compose 타임아웃을 600초로 상향.
- **v5.13.102**: `deploy-bot.sh`, `deploy-core.sh`를 비대화형 sudo/Docker 경로 기준으로 정리하고 로그 확인을 종료형으로 변경.
- **v5.13.101**: `stop-daemon` 이후 잔여 Chrome 프로세스 정리 보강.
- **v5.13.100**: NAS `els-bot` Selenium 워커/배치 병렬도를 2개로 제한.
- **v5.13.99**: 아산 연간실적 분석섹션 탭을 조사범위 아래 고정 배치해 탭 전환 시 화면 흔들림을 줄임.
- **v5.13.98**: 관리자 문의/회원권한/활동로그 화면을 인트라넷 톤으로 재정리하고 로그 조회 경로를 `/api/admin/logs`로 복구.

## VERIFICATION
- `node --test web/tests/vehicleLocation.test.mjs`: 12개 통과
- `npm.cmd run lint`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.15 / 5156 APK 빌드 및 `web/public/apk/els_driver.apk` 복사 완료
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.15`, `BUILD_CODE 5156` 확인
- `git diff --check`: 통과 (version.json line-ending 경고만 표시)
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "utils/asanShippingView.mjs" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `node --test web/tests/safeFreightTabOrder.test.mjs`: 1개 통과
- `node --test web/tests/safeFreightRegion.test.mjs`: 4개 통과
- 안전운임 로컬 브라우저 확인: `[왕복] 인천국제여객 → 경기도 화성시 마도면` 구간운임 26.02월 42km / 안전운임 333,600원 표시 확인
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 NAS/WebDAV/API/폰트 fetch는 sandbox EACCES 경고만 표시)
- 브라우저 로컬 확인: 데스크탑 장기흐름 패널과 KPI 겹침 없음, Galaxy S24 360px 기준 문서 가로 overflow 없음.
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "tests/asanAnnualPerformance.test.mjs" "tests/asanDashboardView.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- NAS 적용 확인: `/health` 정상, `els-core` 약 140MB / CPU 0.01%, import node 프로세스 없음

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 게임.
- `/employees/news` 하단 숨은 트리거로 미니 모달 진입 가능.

## IN-PROGRESS
- 현재 이어받을 미완료 작업 없음.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
