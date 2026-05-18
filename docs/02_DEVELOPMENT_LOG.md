## [2026-05-18] 아산 연간실적 분석섹션 고정 배치 (v5.13.99)
### 핵심
- 분석섹션 탭을 조사범위 컨트롤 바로 아래로 이동해, 탭 전환 때 버튼 줄의 위치가 본문 섹션 높이에 끌려 움직이지 않도록 했습니다.
- 분석섹션 라벨과 버튼의 폭/높이/라인 높이를 고정해 활성 버튼 색상이 바뀌어도 줄바꿈이나 미세 흔들림이 생기지 않게 보정했습니다.
- 연간실적 화면 테스트에 `조사범위 → 분석섹션 → 장기 흐름` 렌더 순서 검증을 추가했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/API sandbox EACCES 경고만 표시)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 관리자 페이지 톤 정리와 활동 로그 조회 경로 복구 (v5.13.98)
### 핵심
- 관리자 문의/회원 권한/활동 로그 화면에서 이모지성 장식과 과한 카드 여백을 제거하고, 연락처·자료실 기준의 32px 버튼, 0.78~0.82rem 표 폰트, 짙은 블루 표 헤더 톤으로 맞췄습니다.
- 활동 로그 관리 화면이 `NEXT_PUBLIC_ELS_BACKEND_URL` 기반 `/api/logs`를 직접 호출하던 구조를 `/api/admin/logs`로 전환해 인증 쿠키가 있는 Next 서버 API를 경유하도록 복구했습니다.
- 모바일에서 로그 테이블이 CSS로 숨겨지는데 대체 카드가 없어 빈 화면처럼 보이던 문제를 로그 카드 목록으로 보완했습니다.
- 로그 조회 API는 서비스 롤로 조회·삭제해 RLS 삭제 정책 부재에 막히지 않게 하고, `count: estimated`와 한 건 추가 조회로 정확 count 병목을 줄였습니다.
- 클라이언트 로그 수집 fallback용 `web/app/api/logs/route.js`를 추가하고, 서버 로그 유틸은 NAS URL이 없을 때 Supabase에 직접 기록하도록 정리했습니다.
### 검증
- `node --test web/tests/adminManagementUi.test.mjs`: 3개 통과
- `npm.cmd run lint -- "app/(main)/admin/page.js" "app/(main)/admin/users/page.js" "app/(main)/admin/logs/page.js" "app/api/admin/logs/route.js" "app/api/logs/route.js" "utils/logger.js" "utils/logger.server.js"`: 0 errors
- `npm.cmd run build`: 통과. 외부 WebDAV/API 및 Google Fonts fetch는 sandbox 네트워크 EACCES 경고만 출력.
- 로컬 HTTP 검증: `/admin/logs?debug=true` 200 응답 및 `활동 로그 관리`, `새로고침` HTML 포함 확인.
- 인앱 브라우저 로컬 접속은 `localhost`, `127.0.0.1` 모두 `ERR_BLOCKED_BY_CLIENT`로 차단되어 HTTP 응답 검증으로 대체했습니다.
### 변경 파일
- `web/app/(main)/admin/page.js`
- `web/app/(main)/admin/admin.module.css`
- `web/app/(main)/admin/users/page.js`
- `web/app/(main)/admin/users/users.module.css`
- `web/app/(main)/admin/logs/page.js`
- `web/app/api/admin/logs/route.js`
- `web/app/api/logs/route.js`
- `web/utils/logger.js`
- `web/utils/logger.server.js`
- `web/tests/adminManagementUi.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 연간실적 차량 미기재 분리와 보고서 레이아웃 보정 (v5.13.97)
### 핵심
- 차량별 손익에서 원장 `영업넘버`가 빈칸이거나 `-`인 행을 실제 차량 랭킹과 분리하고, `차량번호 미기재` 품질 지표로 따로 표시했습니다.
- 운영 Supabase summary를 재집계해 차량 랭킹에는 실제 영업넘버만 남기고, 미기재 55,473건은 매출/매입/손익 합계와 함께 별도 보관하도록 했습니다.
- 상단 장기 흐름 차트의 SVG 비율을 넓은 화면 기준으로 재조정해 그래프가 가운데에만 몰리는 현상을 줄였습니다.
- 조사범위 선택 바와 분석 섹션 탭의 높이, 색상, 간격을 맞춰 같은 보고서 컨트롤처럼 보이도록 정리했습니다.
### 검증
- 운영 Supabase `analysisVersion=ledger-workbench-20260518-scope-vehicle-quality`, `vehiclePerformance` 80개, `-` 차량 랭킹 제외, 미기재 55,473건 분리 확인.
- `node --check "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "scripts/import-asan-annual-performance.mjs" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/supabase_sql/20260517_asan_performance_rebuild_analytics_workbench_summary.sql`
- `web/supabase_sql/20260518_asan_performance_vehicle_scope_summary.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 배차 모바일 중간 액션 버튼 정리 (v5.13.96)
### 핵심
- 현황판 중간 모바일 액션에 `통합현황`, `글로비스 KD 외`, `모비스 AS` 범위 선택 버튼을 추가했습니다.
- `배차판 검색`은 고객사/실행사 기준 선택처럼 보이지 않도록 파란 배경을 제거하고 흰색 보조 버튼 톤으로 낮췄습니다.
- 모바일에서 `배차판 검색`으로 전환할 때 컨테이너 내부 스크롤을 초기화하고 상단 카드 기준으로 이동해 중간 위치에 걸리지 않도록 보정했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] AI 어시스턴트 삭제 후 유령 목록 재표시 차단 (v5.13.95)
### 핵심
- 전체 삭제를 누르는 즉시 `els_ai_sessions_cleared_at` 로컬 삭제 마커를 저장하고, UI/로컬 캐시를 먼저 빈 대화로 전환하도록 변경했습니다.
- 페이지 재진입 때 로컬스토리지나 DB에서 삭제 마커보다 오래된 대화 스냅샷이 돌아와도 목록에 표시하지 않고, DB 잔여값은 purge 재시도로 정리합니다.
- 마지막 개별 대화 삭제/현재 대화 비우기에서도 사용자 대화가 더 이상 없으면 같은 삭제 마커를 남기도록 맞췄습니다.
### 검증
- `node --test web/tests/chatMemory.test.mjs`: 7개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" "app/api/chat/memory/route.js" "utils/chatMemory.mjs"`: 0 errors (기존 warning 8건)
### 변경 파일
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/utils/chatMemory.mjs`
- `web/tests/chatMemory.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 연간실적 장기 흐름/조사범위/차량별 손익 보강 (v5.13.94)
### 핵심
- 연간실적 분석 상단에 월별 매출·매입을 선형으로 잇는 장기 흐름 차트를 추가하고, 매출 평균선/매입 평균선을 함께 표시했습니다.
- 조사범위 선택을 `전체/최근 12개월/최근 36개월/최근 5년/최근 연도/직접`으로 제공하고, KPI·월별 흐름·연도별 집계·직계약 세그먼트·주차 분석이 선택 범위 기준으로 재계산되게 했습니다.
- 기존 애매한 표현은 화면/문서/summary 설명에서 제거하고, `직계약/차량`, `계약/명의 세그먼트`, `외부 운송사와 분리` 표현으로 정리했습니다.
- Supabase summary에 `vehiclePerformance`를 추가해 `영업넘버` 기준 차량별 매출·매입·손익·손익률·건수와 월별 흐름을 볼 수 있게 했습니다.
### 검증
- 운영 Supabase `branch_performance_files.summary.vehiclePerformance`: 80개 차량 반영, 최상위 `부산98사1786` 손익률 15.74% 확인.
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --check "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "scripts/import-asan-annual-performance.mjs" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
- 로컬 브라우저 플러그인 확인은 `ERR_BLOCKED_BY_CLIENT`로 차단되어 빌드 검증으로 대체했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/supabase_sql/20260517_asan_performance_rebuild_analytics_workbench_summary.sql`
- `web/supabase_sql/20260518_asan_performance_vehicle_scope_summary.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] AI 어시스턴트 전체 대화 삭제 DB 레이스 차단 (v5.13.93)
### 핵심
- 전체 기록 삭제 시 예약된 자동저장뿐 아니라 이미 진행 중인 저장 fetch도 abort하고, 삭제 중에는 visibility/beforeunload 저장이 예전 대화를 다시 보내지 못하게 막았습니다.
- `/api/chat/memory`는 삭제 직후 빈 마커를 남겨 늦게 도착한 이전 스냅샷을 `stale_after_delete`로 무시하고, 지연 purge로 빈 마커까지 정리합니다.
- 대화 저장 공통 판정(`hasUserConversation`, 첨부 data 제거, 최신 사용자 활동 시각 비교)을 `web/utils/chatMemory.mjs`로 분리해 프론트와 API가 같은 기준을 쓰게 했습니다.
### 검증
- `node --test web/tests/chatMemory.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" "app/api/chat/memory/route.js" "utils/chatMemory.mjs"`: 0 errors (기존 warning 8건)
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
### 변경 파일
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/api/chat/memory/route.js`
- `web/utils/chatMemory.mjs`
- `web/tests/chatMemory.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 원장 상세 검색 총건수 표기 보정 (v5.13.92)
### 핵심
- 연간실적 상세 원장 검색은 운영 DB 타임아웃을 피하려고 정확 count를 생략하는 경로가 있어, 더 불러올 행이 남아 있을 때 `301+`처럼 추정 총건수로 표시하도록 보강했습니다.
- 같은 페이징 유틸을 쓰는 선적관리도 추정 총건수 응답값을 받을 수 있게 맞췄습니다.
- 아산 배차 모바일 현황판의 날짜 시작점은 고객사/실행사 기준 전환과 배차판 검색 버튼을 함께 제공하고, 유효 오더가 없는 날짜 탭은 자동으로 제외하도록 정리했습니다.
### 웹 검증
- 운영 API에서 `analysisVersion=ledger-workbench-20260517`, current snapshot 368,617행, 월별 132개월, 주차 575개, 요일 7개, 세그먼트 4개를 확인했습니다.
- `ELS솔루션+직계약` 드릴다운은 AND 검색으로 진입하며, 원장 상세 총건수는 정확 count 생략 경로에서 `301+`처럼 표시됩니다.
- 검증 월 `2024-01` 매출 1,775,915,940 / 매입 1,543,857,480, `2025-01` 매출 1,701,698,800 / 매입 1,501,277,000을 재확인했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanShippingFlow.test.mjs" "tests/asanDashboardView.test.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanShippingFlow.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 10년 원장 분석 워크벤치 확장 (v5.13.91)
### 핵심
- 연간실적 분석 탭을 `개요/10년 흐름/연도×월/직계약·차량/주차·요일/검증·근거` 하위 탭으로 확장했습니다.
- 운영 Supabase `branch_performance_files.summary`에 `weekly`, `weekday`, `strategicSegments`, `ledgerValidation`, `amountQuality`, `dateQuality`를 추가했습니다.
- `운송사(명의)=ELS솔루션`은 외부 운송사 비교 대상과 분리하고, `ELS솔루션+직계약` 세그먼트를 별도 분석합니다.
- 분석 항목의 원장 상세 버튼과 연도×월 셀 클릭은 테이블 탭으로 이동해 AND 검색을 적용합니다.
- 선적관리는 기본 진입 시 최근 3개월 `작업일` 서버 필터를 적용해 DB 조회량을 줄이고, 모바일 무한 스크롤은 페이지 단위 추가 조회로 유지했습니다.
### 데이터 검증
- 운영 current snapshot `1c6d280d-3ac0-4f03-8f6c-271bb91980c7`: 368,617행.
- 원장 raw 재집계와 summary 총합 차이: 매출 0원, 매입 0원, 손익 0원.
- 월별 raw 재집계와 summary 불일치: 0건 / 132개월.
- 검증 월: `2024-01` 매출 1,775,915,940 / 매입 1,543,857,480, `2025-01` 매출 1,701,698,800 / 매입 1,501,277,000.
- ELS솔루션 직계약 세그먼트: 48,010건, 매출 28,877,118,648원, 매입 25,394,777,236.21원, 손익 3,482,341,411.79원.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanShipping.js" "lib/asan-branch-db.js" "scripts/import-asan-annual-performance.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/lib/asan-branch-db.js`
- `docker/els-backend/asan_performance.py`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/utils/asanShippingView.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanShippingFlow.test.mjs`
- `web/supabase_sql/20260517_asan_performance_rebuild_analytics_workbench_summary.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-18] 아산 배차 월기준 주간평균합 표기 및 모바일 검색 진입 버튼 (v5.13.90)
### 핵심
- 요일별 작업지 비중의 월간 지표명을 `월기준 주간평균합`으로 정정했습니다.
- 월 누적은 보조 텍스트로 유지해 평균 기준값과 누적 실적을 구분했습니다.
- 모바일 현황판 날짜탭 시작점에 `선택일 배차판 검색` 버튼을 추가해, 아래쪽에서 바로 배차판 검색 시작점으로 전환할 수 있게 했습니다.
- 모바일 전체 탭의 주간 선택 버튼은 `5월 1주`처럼 짧은 라벨과 작은 폰트로 표시해 두 줄 밀림을 줄였습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 월 파싱 및 월별 summary 복구 (v5.13.89)
### 핵심
- 연간실적 분석에서 1월 금액이 과대 표시되던 원인을 확인했습니다. 기존 정규식이 `2022-10`, `2022-11`, `2022-12`의 월을 `1`로 먼저 매칭해 10~12월을 1월로 집계하고 있었습니다.
- 웹 표시 유틸과 NAS Python 집계 모듈의 월 파서를 모두 수정해 `YYYY-MM`, `YYYYMM`, `YYYY-MM-DD`, `YYYYMMDD`를 1~12월 범위로 엄격하게 파싱합니다.
- 운영 Supabase `summary.monthly`는 current snapshot의 원본 `row_data->>'마감월'` 기준으로 재생성했습니다.
- 형이 준 엑셀 샘플과 대조해 `2024-01` 매출 1,775,915,940 / 매입 1,543,857,480, `2025-01` 매출 1,701,698,800 / 매입 1,501,277,000이 일치함을 확인했습니다.
- 월별 성과 흐름 UI에는 `마감월 기준`, 매출액, 손익액을 추가하고 연도별 차트에는 매출/매입/손익 범례를 붙였습니다.
- Supabase 복구 쿼리는 `web/supabase_sql/20260517_asan_performance_rebuild_monthly_summary_from_row_data.sql`에 남겼습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "utils/asanPerformanceView.mjs" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py`: 통과
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
- Supabase 검증 SQL: `summary.monthlyBasis = 마감월`, 2024-01/2025-01 샘플 금액 일치
### 변경 파일
- `web/utils/asanPerformanceView.mjs`
- `docker/els-backend/asan_performance.py`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `web/supabase_sql/20260517_asan_performance_rebuild_monthly_summary_from_row_data.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 첫 화면 구성 압축 (v5.13.88)
### 핵심
- 연간실적 분석 탭의 첫 화면에서 손익 구조 옆에 최근 12개월 성과 흐름을 배치해 현재 흐름을 바로 보게 했습니다.
- 연도별 매출·매입·손익 차트는 3줄 누적형에서 한 줄 3지표 레인으로 압축해 전체 연도를 유지하면서 세로 점유를 줄였습니다.
- 공헌도 매트릭스는 상위 10 기준으로 표시 범위를 명확히 하고, 하단 포트폴리오 진입이 더 빨라지도록 행 높이와 패널 간격을 조정했습니다.
- 로컬 dev 서버 브라우저 확인은 PowerShell `Path/PATH` 중복 환경변수로 기동이 제한되어 빌드 검증으로 대체했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 0 errors
- `git diff --check`: 통과
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 스냅샷 공개 방식 timeout 회피 (v5.13.87)
### 핵심
- 직접 주입이 36만 행 insert 후 마지막 previous current 정리 UPDATE에서 statement timeout 나는 문제를 분리했습니다.
- 기본 주입은 새 스냅샷을 `staged_current`로 insert하고, 성공 공개는 `branch_performance_files.summary.currentSnapshotId` 갱신으로 처리합니다.
- 웹 조회는 `currentSnapshotId`가 있으면 `snapshot_id` 기준으로 읽고, 없을 때만 legacy `is_current=true`로 fallback합니다.
- `--retire-previous-current` 옵션을 추가해 이전 current 행 정리는 필요할 때만 별도 수행할 수 있게 했습니다.
- 이미 실패한 staged 스냅샷을 36만 행 재파싱 없이 공개하는 복구 SQL을 추가했습니다.
- 복구 SQL로 스냅샷을 공개한 뒤 분석 summary만 다시 계산하는 `--summary-only` 모드를 추가했습니다.
- `--summary-only`는 파일 수정시간이 같아도 skip하지 않고 summary 갱신을 수행하도록 보정했습니다.
### 검증
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs" "lib/asan-branch-db.js"`: 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/lib/asan-branch-db.js`
- `web/supabase_sql/20260517_asan_performance_snapshot_row_index.sql`
- `web/supabase_sql/20260517_asan_performance_recover_staged_snapshot.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 성과 리포트 화면 재구성 (v5.13.86)
### 핵심
- 연간실적 분석 탭을 단순 그래프/상위 목록에서 성과 리포트형 대시보드로 재구성했습니다.
- 상단에 연간 성과 리포트, 손익률 등급, 기간/분석 행수/현재 스냅샷 상태, 자동 인사이트 문장을 배치했습니다.
- 매출→매입→손익 흐름을 손익 구조 패널로 보여주고, 최고 매출월/최고·최저 손익월/상위 10 집중도 성과 경보를 추가했습니다.
- 고객/작업지/운송사/노선/구분 등 summary breakdown을 선택하는 공헌도 매트릭스와 저마진/손실/고마진 포트폴리오를 추가했습니다.
- 화면 집계는 기존 Supabase summary를 사용해 브라우저에서 36만 행 전체를 재계산하지 않도록 유지했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 0 errors
- `npm.cmd run build`: 통과. 외부 WebDAV/API fetch는 sandbox 네트워크 EACCES 경고만 출력.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 배차 요일별 실적/평균 라벨 및 돋보기 위치 보정 (v5.13.85)
### 핵심
- 요일별 작업지 비중의 탭명을 `주간 실적`, `월간 평균`으로 바꿔 기준 차이를 바로 알 수 있게 했습니다.
- 주간 선택 줄은 선택 주차 실제 합계를 `주간 실적`으로 표시합니다.
- 월간 선택 줄은 요일별 평균값 합계를 `월간 평균합`으로 표시하고, 월 누적은 보조 텍스트로 분리했습니다.
- 데스크톱 추세 돋보기는 마우스 좌표를 따라가고, 내부 값만 가장 가까운 데이터 포인트 기준으로 표시하도록 보정했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 모바일 빠른 필터 폭 고정 (v5.13.84)
### 핵심
- 모바일 날짜 필터 영역에서 미선적/자체보관 버튼을 `quickFilterGroup`으로 묶었습니다.
- 모바일에서는 해당 그룹을 `repeat(2, minmax(0, 1fr))` 그리드로 렌더링해 `필터해제`/`자체보관`처럼 글자 수가 달라도 두 버튼 가로폭이 동일하게 유지됩니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 문자 오더 제외 및 기준차이 칩 색상 보정 (v5.13.83)
### 핵심
- `오더(계)`/`오더`/`계`/`수량`이 순수 숫자가 아닌 행은 필터 합계, 기간 카드, 기준차이, 실행사 기준 분석에서 제외했습니다.
- 실행사 지역칸에 `보송1` 같은 값이 있어도 오더가 `오배차` 같은 문자면 기준차이 원인과 분석 집계에 반영하지 않도록 보정했습니다.
- 기준차이 선택 칩의 활성 색상을 검정에서 차분한 파랑 계열로 변경했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs`: 56개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 빠른 필터 hover 설명 보강 (v5.13.82)
### 핵심
- `미선적`/`자체보관` 빠른 필터가 켜진 상태에서 버튼 문구가 `필터해제`만 보여 원래 필터명을 알기 어렵던 부분을 보정했습니다.
- hover 설명에 각각 `미선적 필터 적용 중`, `자체보관 필터 적용 중`을 표시해 어떤 필터를 해제하는지 바로 확인할 수 있게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 기본 로드/필터 로드 분리 (v5.13.80)
### 핵심
- 선적관리 기본 진입에서 최근 3개월 월 필터가 자동 선택되어 전체 데이터가 바로 로드되던 흐름을 해제했습니다.
- 이제 첫 진입은 `SHIPPING_PAGE_SIZE = 100` 기준으로 100건만 로드하고, 테이블 스크롤 하단 접근 시 다음 100건을 추가 로드합니다.
- 월 버튼, 미선적, 자체보관, 컬럼 필터처럼 전체 기준 판단이 필요한 작업에서만 전체 기준 로드를 수행합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 33개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/utils/asanShippingView.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 현재 스냅샷 고정과 분석 확장 (v5.13.79)
### 핵심
- 연간실적 메타 summary에 `currentSnapshotId`를 저장하고 웹 조회는 해당 스냅샷만 읽도록 보강했습니다. 여러 current 스냅샷이 남아 같은 row_index가 반복 표시되는 상황을 차단합니다.
- importer summary에 월별/구분별 breakdown을 확장해 작업지·운송사·노선·구분·청구처·지급처 등 주요 축별 매출/매입/손익 집계를 남기도록 했습니다.
- 연간실적 분석 화면에 건당 매출/건당 손익/매입률/최고 손익월, 월별 추세, 구분별 상위 분석 패널을 추가했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs" "utils/asanPerformanceView.mjs" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 날짜·금액 표시 정규화 (v5.13.78)
### 핵심
- 연간실적 importer가 `마감월`은 `YYYY-MM`, `작업일자`는 `YYYY-MM-DD`로 저장하도록 정규화했습니다.
- Excel 날짜 시리얼 값(`42006` 등)과 ISO 시간 문자열을 날짜 표시값으로 변환하고, `청구`/`하불` 같은 금액 컬럼은 천단위 구분을 적용했습니다.
- 화면 테이블도 같은 표시 유틸을 사용해 기존 적재분이 남아 있어도 날짜/금액을 방어적으로 표시합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs" "utils/asanPerformanceView.mjs" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/utils/asanPerformanceView.mjs`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 배차 점 구분자 파싱 및 기준차이 기간 선택 보정 (v5.13.81)
### 핵심
- `자차3.이지5`처럼 점으로 이어진 지역칸 입력은 소수점이 아니라 업체 구분자로 해석해 실행사 합계에 반영합니다.
- 기준차이 패널의 일/주/月 숫자 칩을 버튼으로 바꿔, 선택한 기간의 원인 행만 보여주도록 정리했습니다.
- 기본 원인 목록은 선택일 기준을 우선해 월별 원인을 현재 날짜에서 찾는 혼동을 줄였습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (54개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 검색/필터 합계와 실행사 파싱 보정 (v5.13.77)
### 핵심
- 통합현황 정렬 후 검색 결과가 정렬 인덱스와 원본 행 인덱스를 섞어 다른 행을 표시할 수 있던 문제를 원본 행 번호 기준으로 보정했습니다.
- 검색/필터가 적용된 상태에서는 상단 합계를 전체 선택일이 아니라 실제 표시 행 기준 `필터 오더량`으로 계산합니다.
- 실행사 지역칸에서 `대신10`, `자차3,칸1`, `CSS1`처럼 업체명과 수량이 붙은 값도 정상 집계하도록 파싱을 보강했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (53개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 고객사/실행사 기준 차이 추적 패널 (v5.13.76)
### 핵심
- 대시보드 기준 전환 버튼 옆 빈 영역에 `기준차이` 패널을 추가했습니다.
- 일/주/月 기준으로 `실행사 지역칸 합계 - 고객사 오더` 차이를 바로 표시합니다.
- 차이 큰 행은 날짜, 작업지, 사유, 고객/실행 수량을 함께 보여주고 `보기` 버튼으로 해당 날짜 탭과 작업지 검색까지 연결합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (51개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 도넛 점유율·빈 날짜 탭·모비스 국가명 집계 (v5.13.74)
### 핵심
- 화주/상차지 도넛 범례에 항목별 점유율 %를 추가해 중앙 `톱1점유`와 각 항목 비중을 같이 읽을 수 있게 했습니다.
- 데이터가 없는 날짜 탭은 disabled 처리하고, 초기 선택 탭도 실제 데이터가 있는 날짜를 우선 선택하도록 보정했습니다.
- 모비스 고객사 구분표는 고객사가 비어 있으면 `국가명/국가` 컬럼을 우선 사용해 `미분류`로 뭉치지 않게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (50개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 모바일 빠른 버튼 폭 정렬 (v5.13.73)
### 핵심
- 모바일 선적관리 날짜 필터에서 `미선적`과 `자체보관` 버튼이 `76px + 나머지` 그리드 비율을 타며 서로 다른 폭으로 보이던 문제를 정리했습니다.
- 모바일 날짜 필터 그리드를 2등분 구조로 바꾸고 빠른 필터 버튼에 `min-width: 0`을 적용해 두 버튼이 같은 폭을 쓰도록 했습니다.
- 모바일 상단/월 선택 회귀 테스트에 빠른 필터 동일 폭 조건을 추가했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (32개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 상차지 비율·돋보기 표시 보정 (v5.13.72)
### 핵심
- `상차지별 비율` 도넛을 작업지 기준이 아니라 `아산/부산/광양/평택/중부/부곡/인천` 등 배차 지역 칸의 업체 수량 기준으로 집계하도록 바로잡았습니다.
- 추세 그래프 돋보기는 고점처럼 위쪽 공간이 부족한 포인트에서는 아래쪽으로 열리게 해 카드 경계에 걸리지 않도록 했습니다.
- 돋보기 안의 전영업일/평균 대비 값은 공통 규칙대로 양수 빨강, 음수 파랑으로 표시합니다.
- 요일별 작업지 비중의 주간 실데이터는 정수 수량이면 소수점 없이 표시하고, 소수 입력값은 1자리까지 유지합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 15개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 모바일 기간 선택 UX 정리 (v5.13.71)
### 핵심
- 모바일에서 일별/주별/월별 기간 카드가 2열로 찌그러지지 않도록 1열 세로 배치로 바꿨습니다.
- 요일별 작업지 비중 패널의 `주간 누적`, `월 누적` 줄 자체를 선택 컨트롤로 만들어 모바일에서도 위 카드까지 이동하지 않고 주/월을 바꿀 수 있게 했습니다.
- 전체 탭의 월간/주간 선택지는 오늘 이후 사전기입 날짜를 제외해 미래 주차 선택 시 대시보드가 빈 화면처럼 보이는 흐름을 막았습니다.
- 주간 라벨을 `5/11(월)~5/17(일) (05월 3주차)` 형태로 보강했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 14개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (sandbox EACCES로 1회 실패 후 권한 경로에서 성공)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 점유율 카드 상차지 비율 추가 (v5.13.70)
### 핵심
- 화주 점유율 오른쪽에 `상차지별 비율` 도넛 카드를 추가해 작업지/상차지 관점의 톱 항목 점유를 바로 볼 수 있게 했습니다.
- 화주/상차지 도넛 중앙의 큰 퍼센트는 유지하고, 아래 작은 회색 라벨을 `톱1점유`로 통일했습니다.
- 기간 카드 하단 칩도 `톱1점유: N%` 형식으로 맞춰 같은 의미를 같은 말로 읽히게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "utils/asanDashboardView.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 날짜 필터 컬럼 후보 정리 (v5.13.69)
### 핵심
- 선적관리 날짜 필터 드롭다운이 헤더명 키워드만 보고 후보를 만들면서 `KD선적확정모선`, `AS선적확정모선`처럼 월 기준 필터에 맞지 않는 컬럼까지 섞이던 문제를 정리했습니다.
- 날짜 컬럼 후보는 헤더 키워드에 더해 실제 셀 샘플에서 날짜로 파싱되는 값이 있는 경우에만 표시합니다.
- `선적` 키워드는 후보 키워드에서 제거해 모선/텍스트 컬럼 오탐을 막았습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (32개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 분석 카드·추세·요일 작업지 비중 보강 (v5.13.68)
### 핵심
- 기간 카드 하단 칩을 `수출: N van`, `FEU: N`, `톱1점유: N%`로 통일해 카드 기준 수량 해석을 명확히 했습니다.
- 주간 선택 라벨과 전체 탭 주간 버튼에 `5/11~5/17 (05월 3주차)` 형태의 주차 정보를 함께 표시합니다.
- 일자별 추세는 KST 오늘 이후 사전기입 데이터를 제외하고, 마우스/터치 이동 위치에 맞춰 돋보기형 포커스 수치를 표시합니다.
- 요일별 비교 패널은 주간을 기본값으로 바꾸고, 요일별 총량 안에서 작업지별 비중을 stacked bar와 hover 설명으로 보여줍니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 10개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
- 로컬 standalone 서버 `/employees/branches/asan?debug=true` 200 응답 확인. Playwright 패키지가 없어 화면 자동 스크린샷은 생략.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 주간 필터 및 요일별 오더 비교 추가 (v5.13.67)
### 핵심
- 전체 탭의 월간 필터 아래에 주간 버튼을 추가해 특정 주차만 바로 합산 조회할 수 있게 했습니다.
- 전체 탭 Excel export도 `weekStart/weekEnd` 범위를 받아 주간 필터 결과와 맞게 내려가도록 보강했습니다.
- 추세 그래프 높이를 줄이고 옆에 `요일별 오더 비교` 패널을 배치했습니다. 월간은 요일별 일평균, 주간은 선택 주 실제 오더를 보여줍니다.
- 기간 카드의 컨테이너 TYPE 칩은 20FT 기준 환산 `FEU`로 변경했고, `집중`은 의미가 분명한 `톱1점유`로 바꿨습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 8개 통과
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 50개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/export/route.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/export/route.js`
- `web/utils/asanDashboardView.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 추세 그래프 전문 지표화 (v5.13.66)
### 핵심
- 날짜 탭을 추세 그래프 아래로 내려, 전체 영업일 추세와 선택일 기반 분석 영역을 시각적으로 분리했습니다.
- 일자별 추세는 주말/공휴일을 제외한 영업일 기준으로 계산해 휴무일 저점이 평균과 전영업일 대비 지표를 왜곡하지 않게 했습니다.
- 그래프에 평균선, X축/영업일, Y축/대수 라벨, 고점/저점 라벨, 시작 대비, 평균 대비, 평균 변동폭을 추가했습니다.
- SVG 기본 title 대신 가로형 hover 정보 박스를 사용하고, 비중/기간 막대 툴팁도 세로로 찢어지지 않게 보정했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 7개 통과
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 49개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/utils/asanDashboardView.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 웹 조회 count timeout 제거 (v5.13.75)
### 핵심
- 연간실적 화면 조회에서 Supabase `count=exact`를 제거하고 파일 메타의 `current_row_count`를 전체 건수로 사용하도록 변경했습니다.
- 첫 화면/더보기는 실제 표시 행만 `row_index` 범위로 가져오며, 한 행을 추가 조회해 다음 페이지 존재 여부만 판단합니다.
- 36만 행 current 원장에서도 화면 진입 시 정확한 count 집계 때문에 statement timeout이 나는 흐름을 차단했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "lib/asan-branch-db.js"` 0 errors
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 current 조회 timeout 회피 (v5.13.65)
### 핵심
- 직접 주입 기본 모드를 current 원장 전체 조회(diff)에서 새 스냅샷 staged/current 반영 방식으로 바꿨습니다.
- `file_modified_at` 미변경 스킵은 유지해 일 1회 자동 실행 시 파일이 그대로면 파싱/주입 없이 종료합니다.
- 행별 hash 비교가 필요한 경우에만 `--diff-current` 옵션으로 기존 diff 모드를 사용하도록 분리했습니다.
- Supabase current 조회용 covering index SQL을 추가해 diff 모드와 웹 조회 timeout 가능성을 낮췄습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/supabase_sql/20260517_asan_performance_current_lookup_index.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 배차 주별/월별 기본 선택 보정 (v5.13.64)
### 핵심
- 주별 카드의 기본 선택을 선택일이 속한 진행 중 주가 아니라 직전 주차로 잡도록 변경했습니다.
- 월별 카드도 진행 중인 이번 달 대신 직전 월을 기본값으로 잡아, 월중 실적이 전월 대비 마이너스로 과장되어 보이는 흐름을 줄였습니다.
- 사용자가 카드 select에서 직접 선택한 주/월 값은 기존처럼 우선 적용합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 6개 통과
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 48개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
### 변경 파일
- `web/utils/asanDashboardView.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 배차 현황판 종합 카드/추세 UX 보강 (v5.13.63)
### 핵심
- 종합 카드 첫 줄에서 `전체` 카드를 제외하고 일별/주별/월별 카드만 남겨 매일 보는 총량 흐름을 더 또렷하게 정리했습니다.
- 날짜 탭을 요약 카드 아래, 분석 영역 바로 위로 이동해 선택 날짜와 카드 분석 흐름이 같은 층에서 보이도록 조정했습니다.
- 기간 카드 막대에 색상 범례형 상위 항목과 항목/수량/% 툴팁을 추가하고, 모바일에서 툴팁이 화면 밖으로 밀리지 않도록 보강했습니다.
- 최초 적재일부터 최신일자까지 일자별 상승/하락폭을 보여주는 추세 그래프를 추가했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 47개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)
- Browser: standalone 서버와 `?debug=true` 접근은 확인했으나, 로컬 Supabase role 조회 대기로 본문 hydrate 시각검증은 제한됨
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 직접 주입 스트리밍 삽입 전환 (v5.13.62)
### 핵심
- 실제 주입 단계도 엑셀 전체 행 배열을 만든 뒤 처리하지 않고, 스트리밍으로 읽는 중 변경/신규 행을 배치 삽입하도록 전환했습니다.
- dry-run은 분석 확인을 위해 기존처럼 전체 요약을 계산하지만, 실제 import는 100행 단위 flush로 NAS 메모리 점유를 더 낮춥니다.
- 기존 row hash 비교, `is_current=false` 전환, `removed_from_excel` 처리는 유지합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 배차 현황판 선택형 분석 대시보드 개편 (v5.13.60)
### 핵심
- 거의 쓰지 않던 데이터 요약 트리 패널을 제거하고, 일별/주별/월별/전체 선택 카드로 총량 확인 흐름을 바꿨습니다.
- 각 기간 카드는 총계, 전기간 대비 증감, 오더/배차/언매치, 상위 항목, 수출입/TYPE, 톱1점유를 압축 표시합니다.
- 화주 점유율은 도넛 차트로 유지하고, 수출입/TYPE은 단일 원형 차트 대신 작은 막대 지표로 전환했습니다.
- 기존 비중 차트는 유지하면서 `고객사별` 탭을 추가했고, 실행사 기준에서도 고객사/작업지/업체명 TOP 구분표를 제공합니다.
- 집계 규칙을 `web/utils/asanDashboardView.mjs`로 분리해 선택 기간 계산과 실행사 지역칸 파싱을 테스트 가능하게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 46개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
- `npm.cmd run build`: 통과 (1차 sandbox Google Fonts EACCES 후 승인 실행)
- Browser: `http://localhost:3000/employees/branches/asan`에서 데스크톱과 360px 모바일 뷰의 카드/차트 노출 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/(main)/employees/branches/asan/dashboard.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/08_ENVIRONMENT_SETUP.md`

## [2026-05-17] 아산 연간실적 일 1회 자동동기화 안전장치 (v5.13.59)
### 핵심
- 직접 주입 스크립트가 Supabase `file_modified_at`과 Excel mtime이 같으면 파싱 전에 스킵하도록 보강했습니다.
- 수동 강제 갱신용 `--force` 옵션을 추가했습니다.
- NAS cron용 `scripts/import-asan-annual-performance.sh`를 추가하고 중복 실행 lock, 기본 chunk size 100, `nice/ionice` 낮은 우선순위를 적용했습니다.
- 파일이 바뀐 날에는 전체 엑셀을 스캔해 row hash를 비교하지만, DB insert는 신규/변경 행만 수행합니다. 최초 적재는 전체 행이 신규이므로 오래 걸릴 수 있습니다.
- 직접 주입은 Docker image/layer/cache를 생성하지 않습니다. NAS에 남을 수 있는 로컬 용량은 `web/node_modules` 설치분과 cron 로그 정도이며, 실제 원장 데이터는 Supabase DB에 적재됩니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `scripts/import-asan-annual-performance.sh`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 대용량 주입 보호 및 숫자 컬럼 보정 (v5.13.58)
### 핵심
- NAS dry-run 결과 `368,617행 / 29컬럼`을 확인했습니다.
- 실제 주입 시 insert payload를 한 번에 만들지 않고 row index 기준으로 배치 생성/삽입하도록 메모리 사용을 낮췄습니다.
- 10만 행 초과 실제 주입은 `--confirm-large-import` 옵션을 요구해 실수로 NAS에 대용량 작업을 시작하지 않도록 보호했습니다.
- 숫자 컬럼 판정이 전체 행 수가 아니라 최대 2,000행 샘플 수를 기준으로 계산되도록 보정해 대용량 파일의 매출/매입 후보가 탈락하지 않게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
- `.tmp_test` 샘플 Excel dry-run 통과
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `docker/els-backend/asan_performance.py`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 직접 주입 메모리 사용량 완화 (v5.13.57)
### 핵심
- NAS에서 dry-run 중 `xlsx` 전체 워크북 로딩이 메모리를 크게 쓰는 현상을 확인했습니다.
- 직접 주입 스크립트를 ExcelJS 스트리밍 파서로 변경해 대상 시트를 순차 읽고, 1,000행 단위 진행 로그를 출력하도록 보강했습니다.
- 기존 원장 누적 정책과 `/volume2/아산지점/...` 기본 경로는 유지했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 직접 주입 NAS 경로 정정 (v5.13.56)
### 핵심
- 직접 주입 스크립트의 기본 파일 후보 1순위를 NAS 실제 경로 `/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`로 정정했습니다.
- DB에 저장되는 논리 경로는 웹 조회 기준과 동일한 `/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`를 유지합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 Supabase 직접 주입 스크립트 추가 (v5.13.55)
### 핵심
- NAS 동기화 중 Supabase statement timeout이 발생할 때 우회할 수 있도록 로컬 Excel 파일을 `branch_performance_files/rows`에 직접 적재하는 운영 스크립트를 추가했습니다.
- 기존 원장 행은 삭제하지 않고 `is_current=false`와 `superseded_by_excel`/`removed_from_excel`/`duplicate_current_retired` 상태로 전환한 뒤 신규 스냅샷을 삽입합니다.
- 기본 파일 경로는 `A:\B_총무\C_마감\합계연간실적\합계연간실적.xlsx`, DB 논리 경로는 `/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`입니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "scripts/import-asan-annual-performance.mjs"` 0 errors
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 DB 조회 NAS 재기동 내성 보강 (v5.13.54)
### 핵심
- 원인 확인: 배차판은 Next API가 Supabase를 직접 읽고, 선적관리/실적관리는 NAS Core 프록시로 GET 조회해 도커 빌드/재기동 중 조회가 끊겼습니다.
- 선적관리 GET 조회를 Next 서버의 Supabase 직접 조회로 보강했습니다. POST 동기화와 `source=excel` 프리뷰는 계속 NAS Core를 경유합니다.
- 연간실적 GET 조회도 같은 구조로 보강해 향후 실적관리 화면이 NAS Core 재기동에 덜 흔들리게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs` 통과 (40개)
- `npm.cmd run lint -- "app/api/branches/asan/shipping/route.js" "app/api/branches/asan/performance/annual/route.js" "lib/asan-branch-db.js"` 0 errors
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/api/branches/asan/shipping/route.js`
- `web/app/api/branches/asan/performance/annual/route.js`
- `web/tests/asanShippingFlow.test.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산지점 로딩 메시지 기준 통일 (v5.13.53)
### 핵심
- 아산지점 배차판/선적관리/실적관리 초기 로딩 문구를 `데이터를 불러오는 중입니다...`로 통일했습니다.
- 로딩 메시지 폰트를 `0.86rem / 800 / #64748b` 기준으로 맞췄습니다.
- 선적관리 필터/정렬 재조회 중 빈 테이블에 보이는 안내도 같은 문구로 정리했습니다.
- `docs/01_MISSION_CONTROL.md`의 INTRANET UI 기준에 로딩 안내 규칙을 추가했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs` 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 실적관리 탭 구조 선반영 (v5.13.52)
### 핵심
- 아산지점 메인 탭의 `연간실적` 자리를 `실적관리`로 변경했습니다.
- `실적관리` 안에 `종합실적`, `월간실적`, `연간실적` 하위 탭을 추가했습니다.
- 현재 구축한 연간실적 화면은 하위 `연간실적` 탭에 연결하고, 기존 브라우저 저장값 `annual-performance`는 `performance`로 자동 보정합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs` 통과 (39개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] NAS Core 자동 파일 감지 부하 완화 (v5.13.51)
### 핵심
- 아산 배차판 자동 체크 기본 주기를 15초에서 60초로, 선적관리 기본 주기를 30초에서 60초로 조정했습니다.
- 연간실적 자동 감지 기본 주기를 120초에서 300초로 조정해 원장형 Excel 감지 부하를 더 낮췄습니다.
- 배차 설정(`branch_dispatch_settings`) 조회는 5분 캐시로 묶어 매 루프 Supabase 호출을 줄이고, 조회 실패 시 기존 캐시가 있으면 사용하도록 했습니다.
- 변경 없음/대상 파일 체크 반복 로그를 제거하고, 파일 변경 감지·최초 동기화·동기화 완료·오류 로그만 남기도록 정리했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs` 통과 (39개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app_core.py docker/els-backend/app.py docker/els-backend/asan_performance.py` 통과
### 변경 파일
- `docker/els-backend/app_core.py`
- `docker/els-backend/app.py`
- `docker/els-backend/asan_performance.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 최초 적재 타임아웃 회피 (v5.13.50)
### 핵심
- 운영 확인 결과 연간실적 GET은 `supabase-empty`로 응답해 DB 미적재 상태였고, 동기화 POST는 nginx 기본 60초 제한에 걸려 504 HTML 응답을 반환했습니다.
- `NAS 동기화`를 요청-대기형에서 백그라운드 작업 시작 방식으로 전환하고, 화면은 5초 간격으로 Supabase 조회와 동기화 상태를 폴링하도록 변경했습니다.
- gateway의 `/api/branches` 계열 timeout을 900초로 늘려 배차/선적/실적 계열 장시간 처리 여유를 맞췄습니다.
### 검증
- 운영 NAS GET: `/api/branches/asan/performance/annual?...source=supabase` 응답 `supabase-empty`, `needs_sync=true` 확인
- 운영 NAS 기존 POST: 60초 후 `504 Gateway Time-out` 확인
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과 (9개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py` 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/api/branches/asan/performance/annual/route.js"` 0 errors
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `docker/els-gateway/nginx.conf`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 Supabase 조회 흐름 정리 (v5.13.49)
### 핵심
- 화면 기본 조회를 `source=supabase`로 고정해 Supabase 원장만 읽도록 정리했습니다. NAS Excel 읽기는 `NAS 동기화` POST 또는 명시적 `source=excel` 프리뷰에서만 수행합니다.
- Supabase에 아직 적재된 행이 없으면 404/Excel 미리보기 대신 `supabase-empty`와 `needs_sync=true`로 응답해 “동기화 전” 상태를 명확히 했습니다.
- NAS Core 또는 게이트웨이가 HTML 에러 페이지를 반환해도 프론트가 `Unexpected token '<'`로 터지지 않고, 배포/라우트 확인이 필요한 응답이라는 메시지를 보여주도록 보강했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과 (8개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py` 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 연간실적 rel_path 루트 통일 (v5.13.48)
### 핵심
- 형이 확인해준 기준대로 연간실적 기본 경로를 배차판/선적관리와 동일한 `/아산지점/...` 루트 규칙으로 통일했습니다.
- 기본값을 `/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`로 바꾸고, 기존 `/B_총무/...` 저장값은 웹/백엔드 모두에서 `/아산지점/B_총무/...`로 자동 보정합니다.
- 파일 브라우저 시작 위치도 `/아산지점/B_총무/C_마감/합계연간실적`로 맞췄습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과 (7개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py` 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/utils/asanPerformanceView.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 NAS 경로 탐색 후보 보강 (v5.13.47)
### 핵심
- 운영 로그의 `연간실적 엑셀 파일을 찾을 수 없습니다` 404를 기준으로, 컨테이너 내부 탐색 후보에 `/app/data/아산지점/...`, `/app/volume2/아산지점/...`, `/app/volume1/아산지점/...`를 추가했습니다.
- `A:\B_총무\...`가 NAS에서 공유 루트 자체인지, `아산지점` 공유 폴더 안인지 애매한 상태를 코드가 둘 다 확인하도록 보강했습니다.
- 404 응답에 `checked_paths`를 포함해 다음 운영 로그/브라우저 네트워크 탭에서 실제 확인 후보를 바로 볼 수 있게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs` 통과 (7개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py` 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 연간실적 페이지 및 누적 원장 파이프라인 구축 (v5.13.46)
### 핵심
- 아산지점 화면에 `연간실적` 메인 탭을 추가하고, 분석 탭(매출/매입/손익 KPI, 연도별 그래프, 상위 거래처/구분)과 테이블 탭(검색/정렬/컬럼 숨김/더보기)을 구성했습니다.
- NAS Core에 `합계연간실적.xlsx`의 `합계` 탭을 읽는 연간실적 동기화 모듈을 추가했습니다. 제목행은 자동 감지하며 웹 설정에서 수동 지정할 수 있습니다.
- Supabase는 `branch_performance_files`, `branch_performance_rows` 구조로 설계했습니다. 원장 행은 삭제하지 않고 `is_current`와 `change_status`로 현재/종료 상태를 추적합니다.
- 월별실적 확장과 연간+월별 합산 계획을 `docs/11_ASAN_PERFORMANCE_PIPELINE.md`에 남겼습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs web/tests/vehicleTrackingExport.test.mjs` 통과 (46개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py` 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/api/branches/asan/performance/annual/route.js"` 0 errors
- `npm.cmd run build` 통과 (외부 WebDAV/fetch는 샌드박스 네트워크 `EACCES` 로그만 발생)
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `docker/els-backend/app_core.py`, `docker/els-backend/app.py`, `docker/els-backend/Dockerfile`, `docker/els-backend/Dockerfile.core`, `docker/docker-compose.yml`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `annualPerformance.module.css`, `page.js`
- `web/app/api/branches/asan/performance/annual/route.js`
- `web/utils/asanPerformanceView.mjs`
- `web/supabase_sql/20260517_asan_annual_performance.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-17] 아산 선적관리 모바일 상단 정렬 정돈 (v5.13.45)
### 핵심
- 모바일 선적관리 화면에서 상단 제목/저장정보/검색/액션 영역이 데스크톱 flex 기준 폭을 끌고 와 밀릴 수 있던 부분을 100% 폭 기준으로 정리했습니다.
- 날짜 필터 라벨과 컬럼 선택을 모바일에서 한 줄 그리드로 맞추고, 월 버튼/빠른 필터/조회 건수 텍스트가 안정적으로 줄바꿈되도록 보강했습니다.
- 모바일 상단과 월 선택 영역 정렬을 확인하는 회귀 테스트를 추가했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (29개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 월 다중선택 필터 전환 (v5.13.44)
### 핵심
- 선적관리 날짜 필터의 시작일/종료일 입력 2칸을 제거하고, 월 단위 다중선택 버튼으로 교체했습니다.
- 오늘(2026-05-17) 기준 현재월 포함 최근 6개월 버튼을 `전체 / 26년 5월 / 26년 4월 / 26년 3월 / 26년 2월 / 26년 1월 / 25년 12월` 순서로 표시합니다.
- 기본 선택은 현재월부터 3개월(`26년 5월`, `26년 4월`, `26년 3월`)이며, `전체`는 월 제한 해제, 각 월 버튼은 중복 선택/해제를 지원합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (28개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 조회/실패 건수 및 엑셀 헤더 동기화 (v5.13.43)
### 핵심
- 날짜 필터 바의 조회 건수를 `전체 N건 / 조회 N건`으로 바꿔, 서버 전체 969건 중 현재 화면 기준 100건처럼 구분되도록 했습니다.
- 컨테이너 조회 상태를 카운트 기반으로 보강해 `컨테이너 조회건수 / 조회완료 / 조회실패`를 함께 표시하고, 실패 건수는 빨간색으로 드러나게 했습니다.
- 조회 도중 에러가 나면 이미 받은 결과는 완료/실패로 집계하고, 남은 미처리 컨테이너는 실패로 포함합니다.
- 저장된 컬럼 레이아웃은 엑셀 열 수가 같을 때만 제목 변경으로 보고 인덱스 매칭하며, 열 삭제/추가 시에는 현재 엑셀 헤더 기준으로 테이블 컬럼을 제거/추가합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (27개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (38개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 버튼 정렬 및 조회중 안내 (v5.13.42)
### 핵심
- 형이 제보한 선적관리 날짜 필터 바의 버튼 글자 높낮이 차이를 기준으로 버튼류 높이와 line-height, inline-flex 정렬을 통일했습니다.
- `자체보관` 옆 `조회 N건`은 버튼이 아니므로 배경/테두리를 제거하고 일반 텍스트 형태로 표시하도록 바꿨습니다.
- 필터/정렬 재조회나 추가 로드 중 가상 테이블에 표시 행이 비는 순간에는 `자료 조회중...`을 보여 사용자가 빈 화면으로 오해하지 않게 했습니다. 실제 결과가 없는 경우에는 `조건에 맞는 자료가 없습니다.`를 표시합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (25개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (36개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js"` 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 미선적 이력 공백 노출 및 조회 건수 표시 (v5.13.41)
### 핵심
- 형이 제보한 선적관리 데이터량 부족 현상을 기준으로 미선적 빠른 필터 흐름을 재점검했습니다.
- 컨테이너 이력 저장값이 없는 행은 기존에는 `neutral`로 판정되어 미선적 필터에서 빠졌습니다. 이제 이력 데이터가 없으면 미선적 후보로 남겨, 화면에서 바로 컨테이너 조회로 확인할 수 있게 했습니다.
- 날짜 필터 바의 `미선적`/`자체보관` 옆에 현재 검색/필터 적용 후 조회 건수를 표시했습니다.
- 컨테이너 조회 시작 상태 문구도 “현재 필터 결과 N행 중 컨테이너 M건”으로 바꿔, 조회 대상이 필터 적용 결과임을 화면에서 확인할 수 있게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (23개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (34개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 필터/미선적 표시 복구 (v5.13.40)
### 핵심
- 형이 제보한 “filter 항목이 안 뜨고, 미선적을 누르면 자료가 안 뜨는” 증상을 선적관리 화면 코드와 기존 회귀 테스트 기준으로 확인했습니다.
- 컬럼 필터 드롭다운이 `th` 내부에서 렌더링되면서 헤더의 `color: #fff`를 상속해 흰 배경 위 흰 글씨가 되는 문제를 `.dropdown` 색상 명시로 복구했습니다.
- 실제 선적관리 파일은 작업 기준 날짜가 `반입일`로 들어오는데, 미선적 판정 유틸이 `작업일자` 계열만 찾고 있어 전 행이 `neutral` 처리될 수 있었습니다. `반입일`/`반입일자`를 fallback 기준일로 추가했습니다.
- 전체 로드 상태에서 컨테이너 저장 이력을 한 URL에 모두 담아 조회하면 길이 제한에 걸릴 수 있어, 저장 이력 조회를 150건 단위로 청크 처리했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (23개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (34개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
- `git diff --check` 통과 (CRLF 치환 warning만 표시)
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] eTrans 이력조회 세션 연장/자정 롤오버 보강 (v5.13.39)
### 핵심
- 형이 제보한 “API 연동 조회 중 Session이 종료되었습니다” 팝업을 기준으로 eTrans 캐시 JS와 봇 세션 관리 흐름을 조사했습니다.
- 연장 버튼 ID는 기존 분석대로 `btn_sessinExtension` 오타 ID가 맞고, 현재 봇도 해당 버튼을 찾고 있었습니다.
- 다만 eTrans 자체 타이머가 `localStorage.scwin.startTimeObj`와 현재 시각의 `HHMMSS` 차이만 계산해, 23시대에 시작된 세션이 00시대로 넘어가면 `curHms < startHms`가 되어 남은 시간을 0으로 만들고 `logoutExpire.do` 흐름을 탈 수 있음을 확인했습니다.
- `extend_session()`은 버튼 클릭 뒤 WebSquare 클라이언트 타이머를 재시작하도록 보강했고, 버튼이 보이지 않을 때는 `scwin.setSessionExtension()`/`startSessionTimer()` 직접 호출 fallback을 사용합니다.
- 로그인 직후에도 타이머 동기화 스크립트를 설치해 자정 롤오버 시 자동으로 세션 연장과 `sessionTimeInit()`을 수행하게 했습니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe elsbot\tests\test_els_bot_logic.py` 통과 (14개)
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile elsbot\els_bot.py elsbot\els_web_runner_daemon.py` 통과
### 변경 파일
- `elsbot/els_bot.py`
- `elsbot/tests/test_els_bot_logic.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 미선적 필터 표시 방어 (v5.13.38)
### 핵심
- 형이 제보한 “미선적 필터 상태에서 컨테이너 조회를 누른 뒤 조회는 도는 것 같은데 화면 행이 안 보이는” 증상을 코드 흐름으로 확인했습니다.
- 컨테이너 조회 시작 시 화면 상태에 임시 `조회 대기중` 이력값을 넣으면서, 기존 미선적 판정(`작업일자 <= 이력 MOVE TIME` + `반입/적하` 제외)이 `neutral`로 바뀌어 필터에서 빠질 수 있었습니다.
- 이제 조회 준비 상태는 기존 이력 판정이 있는 컨테이너를 덮어쓰지 않아, 새 조회값이 아직 없거나 세션 종료 오류로 결과가 안 들어와도 기존 미선적 화면을 유지합니다.
- 필터 후 행 수가 줄었는데 기존 스크롤 위치가 큰 상태면 가상 스크롤이 행 범위 밖에서 시작해 빈 화면처럼 보일 수 있어, 시작점을 실제 행 수 안으로 보정했습니다.
- 세션 종료 같은 실패 응답(`payload.ok === false`)은 저장 로직을 타지 않고 오류만 전달하게 막아, 실패한 조회가 기존 DB 이력값을 삭제하지 않도록 했습니다.
- DB 저장 구조는 기존과 동일하게 `/api/branches/asan/shipping/container-lookup`이 성공 최종 결과를 서버 측에서 `branch_shipping_container_lookups`에 저장합니다. 다만 현재 컨테이너 이력조회 세션 종료 오류 원인 조사는 별도 스레드 범위로 뒀습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (20개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (31개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-lookup/route.js" "utils/asanShippingView.mjs"` 0 errors
- `git diff --check` 통과 (CRLF 치환 warning만 표시)
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/api/branches/asan/shipping/container-lookup/route.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-17] 아산 선적관리 미선적 기준 재정의 및 조회 덮어쓰기 (v5.13.37)
### 핵심
- 형 요청대로 `미선적` 빠른 필터를 오늘 기준이 아니라 행의 `작업일자` 기준으로 다시 정의했습니다.
- `작업일자` 포함 이후의 `이력 MOVE TIME`이 있고 `이력 구분`이 `반입/적하`가 아니면 `unshipped`로 판정해 미선적 필터에 남깁니다.
- 같은 작업일 기준에서 `반입/적하`이면 완료로 판정해 전체 행 회색 음영/회색 글씨를 유지합니다.
- 필터 상태에서 `컨테이너 조회`를 누를 때 기존 저장값이 있어도 같은 파일/컨테이너의 이전 조회 결과를 삭제한 뒤 최신 최종 결과를 저장하도록 변경했습니다.
- 최종 조회 결과가 빈 경우에도 예전 이력값이 다시 살아나지 않도록 화면 상태와 DB 조회값을 비우게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (17개)
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (28개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-results/store.js" "app/api/branches/asan/shipping/container-lookup/route.js" "utils/asanShippingView.mjs"` 0 errors
- `git diff --check` 통과 (CRLF 치환 warning만 표시)
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/api/branches/asan/shipping/container-lookup/route.js`
- `web/app/api/branches/asan/shipping/container-results/store.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 차량위치관제 Excel export 빌드 로그 정리 (v5.13.36)
### 핵심
- `npm run build` 중 `/api/vehicle-tracking/export/excel` 라우트에서 `Vehicle tracking export error: Dynamic server usage` 로그가 발생하던 원인을 확인했습니다.
- 해당 라우트가 `request.url`을 사용하는 다운로드 API인데 동적 라우트 선언이 빠져 있어, Next가 빌드 중 정적 렌더 대상으로 한 번 건드리며 오류 로그가 찍혔습니다.
- ZIP export 라우트와 동일하게 `export const dynamic = 'force-dynamic'`을 추가해 빌드 중 정적 렌더 대상에서 제외했습니다.
- 회귀 테스트를 추가해 Excel export 라우트의 동적 선언이 빠지지 않도록 방어했습니다.
### 검증
- `node --test web/tests/vehicleTrackingExport.test.mjs` 통과 (1개)
- `npm.cmd run lint -- "app/api/vehicle-tracking/export/excel/route.js"` 0 errors
- `npm.cmd run build` 통과, `Vehicle tracking export error: Dynamic server usage` 로그 제거
### 변경 파일
- `web/app/api/vehicle-tracking/export/excel/route.js`
- `web/tests/vehicleTrackingExport.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 컨테이너 조회 저장 서버화 (v5.13.35)
### 핵심
- 형이 컨테이너 조회 중 다른 페이지로 이동했을 때 이력 저장이 누락된 사례를 조사했습니다.
- 기존 구조는 `/api/els/run` 조회 스트림이 끝난 뒤 브라우저가 `/container-results` 저장 API를 별도로 호출하는 방식이라, 페이지 이탈/라우트 전환 타이밍에 조회는 되었지만 저장 단계만 빠질 수 있었습니다.
- 선적관리 전용 `/api/branches/asan/shipping/container-lookup` 스트림 라우트를 추가해 NAS 조회 스트림의 부분 결과와 최종 결과를 서버 측에서 즉시 저장하도록 변경했습니다.
- 기존 `/container-results` POST와 새 스트림 라우트가 같은 저장 로직을 쓰도록 `container-results/store.js` 공통 모듈로 분리했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (15개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-results/route.js" "app/api/branches/asan/shipping/container-lookup/route.js" "utils/asanShippingView.mjs"` 0 errors
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\app.py docker\els-backend\app_core.py` 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/api/branches/asan/shipping/container-lookup/route.js`
- `web/app/api/branches/asan/shipping/container-results/route.js`
- `web/app/api/branches/asan/shipping/container-results/store.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 미선적·자체보관 빠른 필터 추가 (v5.13.34)
### 핵심
- 날짜 필터 바에 `미선적`, `자체보관` 빠른 필터 버튼을 추가했습니다.
- `미선적`은 오늘 포함 이후 `반입/적하` 완료 상태가 아닌 행만 남기며, 활성화 시 버튼 문구가 `필터해제`로 바뀝니다.
- `자체보관`은 `보관소` 컬럼 값에 자체보관이 포함된 행만 남기며, 활성화 시 버튼 문구가 `필터해제`로 바뀝니다.
- 두 빠른 필터도 전체 로드 기준 필터 계산에 포함되도록 유지했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (15개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
- Browser: `http://localhost:3000/employees/branches/asan`에서 `미선적/자체보관` 버튼 노출, 클릭 시 `필터해제` 전환 및 전체 로드 기준 필터 동작 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 필터 신뢰도·자동 더보기 보강 (v5.13.33)
### 핵심
- 컬럼 필터를 열거나 컬럼/날짜 필터가 적용되면 Supabase 현재 100행 샘플이 아니라 최대 1만 행 전체 로드 기준으로 필터 후보와 결과를 계산하도록 변경했습니다.
- 보이지 않는 빈 문자(`zero-width`, BOM 등)를 실제 빈값 하나로 정규화해 드롭다운에 공란 체크박스가 여러 개 뜨지 않고 `(빈 값)` 한 항목으로 보이게 했습니다.
- 서버 정렬 오름차순에서 빈값이 먼저 오도록 백엔드 정렬을 조정해 `반입일` 같은 컬럼에서 누락값을 바로 볼 수 있게 했습니다.
- 선적관리 리스트를 아래로 스크롤해 끝에 가까워지면 `더 보기` 버튼을 누르기 전에 다음 100행을 자동으로 추가 로드합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (15개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\app.py docker\els-backend\app_core.py` 통과
- Browser: `http://localhost:3000/employees/branches/asan`에서 `반입일` 필터 후보 `(빈 값)` 표시 및 `965 / 965행` 전체 로드 확인, 테이블 하단 스크롤 시 `200 / 965행` 자동 추가 로드 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/utils/asanShippingView.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 컨테이너 완료 행 톤 조정 (v5.13.32)
### 핵심
- 컨테이너 조회 결과의 `이력 MOVE TIME`이 오늘 날짜 이상이고 `이력 구분`이 `반입/적하`인 행을 완료 행으로 판정하도록 변경했습니다.
- 완료 행은 이력 컬럼만이 아니라 앞쪽 엑셀 원장 컬럼까지 전체 행을 회색 음영/회색 글씨로 낮춰 표시합니다.
- 미완료 행은 일반 배경/폰트를 유지하고, 행 hover 색상은 앞쪽 컬럼과 이력 컬럼 모두 동일한 초록색으로 통일했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs` 통과 (14개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
- Browser: `http://localhost:3000/employees/branches/asan` 로컬 개발 서버에서 아산 선적관리 화면 로드 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/utils/asanShippingView.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] Codex 반복 권한/배포 이슈 표준 대응 문서화
### 핵심
- `docs/08_ENVIRONMENT_SETUP.md`에 Codex Desktop/Windows에서 반복된 Git 인덱스 권한, GitHub/NAS 네트워크, PowerShell `PATH/Path` 중복, `Start-Job` 권한, 커밋 메시지 BOM, 한글 부분 스테이징 문제의 표준 대응을 추가했습니다.
- 형이 AGENTS/환경 컨텍스트에 붙일 수 있는 짧은 요약 블록도 함께 남겼습니다.
### 변경 파일
- `docs/08_ENVIRONMENT_SETUP.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 배차판/선적관리 NAS 저장 감지 보강 (v5.13.31)
### 핵심
- 배차판/선적관리 엑셀 동기화에 공통 `StableFileSyncGate`를 추가해 파일 수정시각과 크기가 8초간 안정된 뒤에만 파싱하도록 했습니다.
- 배차판은 15초, 선적관리는 30초 간격으로 가벼운 변경 체크를 수행하고, 실제 엑셀 파싱/DB upsert는 변경된 파일에만 실행해 NAS CPU/RAM 부담을 낮췄습니다.
- 동일 파일 동기화 실패 시 재시도 간격을 둬 컨테이너 이력관리 BOT과 동시에 NAS 자원을 과도하게 쓰지 않도록 했습니다.
- Core/통합 백엔드 Docker 이미지 모두 새 게이트 모듈을 포함하도록 Dockerfile 복사를 반영했습니다.
### 검증
- `python -m unittest docker/els-backend/tests/test_file_sync_gate.py` 통과 (4개)
- `python -m py_compile docker/els-backend/file_sync_gate.py docker/els-backend/app_core.py docker/els-backend/app.py` 통과
### 변경 파일
- `docker/els-backend/file_sync_gate.py`
- `docker/els-backend/tests/test_file_sync_gate.py`
- `docker/els-backend/app_core.py`
- `docker/els-backend/app.py`
- `docker/els-backend/Dockerfile`, `docker/els-backend/Dockerfile.core`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 리스트 UI 안정화 (v5.13.30)
### 핵심
- 검색 상태 문구를 고정 폭 슬롯으로 유지하고, 검색어가 없을 때의 조용한 갱신에서는 `검색 중`을 숨겨 입력창 폭이 줄었다 늘어나는 현상을 막았습니다.
- 엑셀 컬럼과 `이력 ...` 컬럼의 정렬 순서와 숨김 상태를 분리해, DB 프리셋에 저장된 숨김 컬럼이 실제 렌더링 목록에서 빠지도록 수정했습니다.
- 같은 DB 프리셋/정렬값을 새 객체로 반복 적용하지 않게 해 테이블 세로 스크롤이 위로 튀는 원인을 줄였습니다.
- 선적여부 확인이 쉽도록 작업일자 포함 이후의 `반입/양하/적하` 이력만 진하게 표시하고, 비교 가능한 나머지 이력 행은 흐린 회색 톤으로 낮췄습니다.
### 검증
- `node --test web/tests/containerInput.test.mjs web/tests/asanShippingFlow.test.mjs` 통과 (18개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"` 0 errors
- Browser: `http://localhost:3000/employees/branches/asan` 실제 데이터 로드, 검색 상태 슬롯 54px 고정/숨김, 테이블 내부 스크롤 유지 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/utils/asanShippingView.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 워커풀 운영 메모 문서화
### 핵심
- `docs/07_RUNBOOK.md`에 컨테이너 이력조회가 고정 Selenium 워커풀 + 블로킹 큐 구조로 동작한다는 운영 메모를 추가했습니다.
- 본 조회/API 조회가 동시에 들어올 때의 대기 방식, `reserveSingle` 의미, 인메모리 큐 한계, 꼬임 의심 시 대응 순서를 정리했습니다.
### 변경 파일
- `docs/07_RUNBOOK.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 원점 복구 (v5.13.29)
### 핵심
- ETrans 화면 상태를 건드리던 WebSquare 그리드 강제 초기화를 기본 OFF로 돌려, 조회 버튼 클릭 후 실제 그리드/무자료 문구를 관찰하는 단순 흐름으로 복구했습니다.
- 배치 성공행 2차 재조회를 기본 OFF로 바꿔, 정상 데이터가 화면에 나오면 그 행을 바로 확정하고 조회 자체를 반복하지 않도록 했습니다.
- `reserveSingle=false`가 데몬 워커 선택에도 반영되도록 해 3워커 배치에서 #1 워커가 놀지 않게 했고, 재로그인 성공 드라이버가 큐에 중복 대여되는 레이스를 차단했습니다.
- 조회 화면 준비 판정을 컨테이너 입력창 단독이 아니라 입력창+조회 버튼 기준으로 강화했습니다.
- 아산 선적관리 조회 결과 저장은 숫자 No.가 있는 실제 이력 행만 인정하고, `ERROR`/`NODATA` 상태 행은 저장/표시 데이터에서 제외했습니다.
### 검증
- `python -m unittest elsbot.tests.test_daemon_stop_control elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic` 통과 (32개)
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs` 통과 (16개)
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js" "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-results/route.js" "utils/containerHistoryResults.mjs"` 0 errors, 기존 warning 5개
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
- `git diff --check` 통과 (CRLF 치환 warning만 표시)
### 변경 파일
- `docker/docker-compose.yml`
- `docker/els-backend/app_bot.py`
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `web/app/(main)/employees/container-history/page.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/api/branches/asan/shipping/container-results/route.js`
- `web/utils/containerHistoryResults.mjs`
- `elsbot/tests/test_container_lookup_safety.py`, `elsbot/tests/test_daemon_stop_control.py`, `elsbot/tests/test_els_bot_logic.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 3워커 운용·재기동 완화 (v5.13.28)
### 핵심
- NAS Chrome 동시 기동 부담을 줄이기 위해 `ELS_MAX_DRIVERS`와 `ELS_BATCH_MAX_WORKERS`를 3으로 낮췄습니다.
- 배치 조회 시작 시 부족한 워커를 새로 띄우지 않고, 이미 준비된 가용 워커만 사용하도록 했습니다.
- 성공행 2차 검증 실패는 워커 재기동이 아니라 해당 결과 폐기/재조회 판정으로 처리해, 조회 시작이 곧 워커 재가동으로 이어지는 현상을 차단했습니다.
- 배치 기본값에서 강제 메뉴 재진입을 끄고 현재 조회 화면을 유지해 검증 오버헤드를 줄였습니다.
### 검증
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
- `python -m unittest elsbot.tests.test_daemon_stop_control elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic` 통과 (26개)
- `git diff --check` 통과
### 변경 파일
- `docker/docker-compose.yml`
- `docker/els-backend/app_bot.py`
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 검색 상태 표시 안정화 (v5.13.27)
### 핵심
- 검색어 입력이 끝난 뒤 DB 조회가 아주 빠르게 끝나도 `검색 중`이 즉시 켜졌다 꺼져 불안정해 보이던 표시를 정리했습니다.
- 조용한 검색 갱신은 350ms 이상 걸릴 때만 `검색 중`을 보여주고, 짧은 갱신은 화면 표시 없이 지나가게 했습니다.
- 검색/정렬 요청 ID를 관리해 이전 요청 응답이 늦게 도착해도 최신 결과를 덮어쓰지 않도록 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/page.js" app/api/branches/asan/shipping/route.js app/api/branches/asan/shipping/container-results/route.js` 0 errors
- `git diff --check` 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 워커 장애 격리·성공행 2차 검증 (v5.13.26)
### 핵심
- 배치 병렬도 산정을 `total_drivers`가 아니라 실제 `available_drivers`와 현재 배치가 점유 중인 작업 수 기준으로 변경했습니다.
- 메뉴 진입 실패 워커는 같은 큐에 되돌리지 않고 즉시 격리한 뒤 1개씩 재기동 예약하도록 해, 한 워커 장애가 전체 조회를 500초 이상 붙잡는 상황을 차단했습니다.
- 배치 성공행은 같은 컨테이너를 깨끗한 화면에서 한 번 더 조회해 1차/2차 이력 서명이 일치할 때만 확정합니다. 불일치하면 워커를 격리하고 재시도/오류 행으로 남겨 유령 성공을 막습니다.
- 배치 중 가용 워커가 0이면 남은 작업을 무작정 제출하지 않고 최대 90초 대기 후 입력 행별 오류로 확정합니다.
- 단일 데몬 운영 기준으로 로그의 `[D#1]` 표기를 제거해, `[B#n]` 워커 흐름이 더 잘 보이도록 정리했습니다.
### 검증
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
- `python -m unittest elsbot.tests.test_daemon_stop_control elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic` 통과 (26개)
- `git diff --check` 통과
- `elsbot.tests.test_backend_api`는 로컬 번들 Python에 `requests` 패키지가 없어 실행하지 못했습니다.
### 변경 파일
- `docker/els-backend/app_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/els_bot.py`
- `docker/docker-compose.yml`
- `elsbot/tests/test_container_lookup_safety.py`
- `elsbot/tests/test_daemon_stop_control.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 지도 공개범위 운전원정보 마스터화 (v5.13.25)
### 핵심
- 지도 공개범위는 운행 건별 편집 값이 아니라 `driver_contacts.map_visibility` 마스터 설정이라는 기준으로 정리했습니다.
- 차량위치관제 운행기록 행의 `지도: 자기차량/계약차량/전체운행` 선택 UI를 제거했습니다.
- 운전원정보 목록 상단에 `지도범위 일괄설정` 버튼을 항상 노출하고, 선택된 운전원에게 일괄 적용하도록 복구했습니다.
- 차량위치관제 API는 운전원정보의 지도범위 값을 조회해 활용하고, 운행 생성/수정/완료 동기화 과정에서 운행 건에 `map_visibility`를 녹여 쓰지 않도록 정리했습니다.
### 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- `git diff --check` 통과
- `npm.cmd run build` 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/(intranet)/driver-contacts/page.js`
- `web/app/(main)/employees/(intranet)/intranet.module.css`
- `web/app/api/vehicle-tracking/trips/route.js`
- `web/app/api/vehicle-tracking/trips/[id]/route.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 DB 전체 기준 정렬 (v5.13.24)
### 핵심
- 컬럼 헤더 정렬이 브라우저에 이미 내려온 100행만 재정렬하던 문제를 수정했습니다.
- 엑셀 원장 컬럼 정렬은 `sort_key/sort_dir`로 NAS 백엔드에 전달하고, Supabase 조건 결과 전체를 정렬한 뒤 요청 페이지를 잘라 내려오도록 변경했습니다.
- 컨테이너 이력 컬럼은 웹에서 붙이는 파생 데이터라 기존처럼 현재 로드분 기준 정렬을 유지합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/page.js" app/api/branches/asan/shipping/route.js app/api/branches/asan/shipping/container-results/route.js` 0 errors
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과
- `git diff --check` 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 후행 워커 준비상태 기반 기동 (v5.13.23)
### 핵심
- 배포 직후 대기 상태에서도 #1/#2 로그인/메뉴 진입이 160~210초까지 늘어나 #3/#4가 고정 지연만 보고 먼저 뜨며 remote-debugging 연결 실패가 반복되는 로그를 확인했습니다.
- #3/#4는 이제 #1/#2가 실제 준비 완료된 뒤 순차 기동합니다.
- `ELS_DRIVER_STAGGER_SEQUENCE=0,45,120,180`, `ELS_LATE_WORKER_MIN_READY=2`, `ELS_LATE_WORKER_SPACING_SEC=45`를 추가해 NAS Chrome 기동 경합을 줄였습니다.
### 검증
- `python -m py_compile elsbot/els_web_runner_daemon.py elsbot/tests/test_daemon_stop_control.py` 통과
- `python -m unittest elsbot.tests.test_daemon_stop_control elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic` 통과 (24개)
### 변경 파일
- `docker/docker-compose.yml`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_daemon_stop_control.py`

## [2026-05-16] 아산 선적관리 툴바/검색/보존기간 정리 (v5.13.22)
### 핵심
- 선적관리 상단을 데스크톱 한 줄 고밀도 툴바로 압축하고, 폭이 좁을 때만 자연스럽게 줄바꿈되도록 정리했습니다.
- 모바일에서는 버튼 그룹을 3열/2열 그리드로 접어 검색, 프리셋, 엑셀, NAS 동기화, 컨테이너 조회가 겹치지 않게 했습니다.
- 컨테이너 조회 버튼은 NAS 동기화 뒤쪽에 배치하고, 이력 컬럼은 렌더링 단계에서 엑셀 원장 오른쪽으로 강제 고정했습니다.
- 숨김 컬럼 칩은 `이력` 접두어를 줄이고 소형 고정 폭/말줄임 스타일로 단순화했습니다. 긴 안내문은 화면에서 제거하고 숨김 영역 hover 툴팁으로 이동했습니다.
- 검색 입력은 한글 조합 중 조회를 멈추고, 입력 종료 후 1초 뒤 DB 전체 조건 검색을 조용히 갱신하도록 변경했습니다. Enter는 즉시 검색합니다.
- 삭제 archive는 365일, 컨테이너 lookup 조회 이력은 180일 보존으로 나누고 최신 lookup/보존기간 delete 인덱스를 추가했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (21개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/page.js" app/api/branches/asan/shipping/route.js app/api/branches/asan/shipping/container-results/route.js` 0 errors
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과 (번들 Python 사용)
- Supabase 운영 DB 확인: 현재 원장 965행/약 6.4MB, archive 0건, lookup 0건. 최신 lookup/보존기간 인덱스 3개 생성 확인.
- 로컬 dev 서버 `http://localhost:3001/employees/branches/asan`에서 검색 입력 중 테이블 유지, `입력 대기` 표시, 엑셀 컬럼 우선/이력 컬럼 우측 배치, 숨김 긴 안내문 제거 확인. 3000 포트는 기존 프로세스 점유로 3001 사용.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/supabase_sql/20260516_asan_shipping_lookup_retention_indexes.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 이력 1년 보존 정리 (v5.13.21)
### 핵심
- 선적관리 운영 원장 `branch_shipping_rows`는 계속 엑셀 최신본 기준으로 유지하고, 보존기간 정리 대상에서 제외했습니다.
- 삭제 이력 `branch_shipping_row_archive`와 컨테이너 조회 이력 `branch_shipping_container_lookups`만 보존기간 초과분을 NAS core 스케줄러에서 하루 1회 정리하도록 했습니다. 이후 v5.13.22에서 archive 365일, lookup 180일로 분리했습니다.
- 회귀 테스트로 1년 보존 상수, archive/lookup 삭제 조건, 현재 원장 미삭제 조건을 고정했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (18개)
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과 (번들 Python 사용)
- `git diff --check` 통과
- Supabase 운영 DB 확인: 365일 초과 archive/lookup 0건, 현재 선적관리 원장 965건.
### 변경 파일
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 WebSquare 잔상/무자료 조기 확정 보강 (v5.13.22)
### 핵심
- `ONEU6027330` 유령 성공행과 `HPCU5082429` 무자료 오판 로그를 기준으로, 기존 방어가 같은 원문 잔상만 잡고 WebSquare 내부 상태/무자료 모달 잔상에는 약한 점을 확인했습니다.
- 조회 전 WebSquare 그리드 컴포넌트, DOM 행, 일반 모달을 더 넓게 초기화합니다.
- 조회 직후 `데이터가 없음` 문구를 바로 NODATA로 확정하지 않고, 최종 추출 단계에서 충분히 기다린 뒤 확정합니다.
- 조회 버튼 클릭 직후 입력값을 다시 읽어 요청 컨테이너와 다르면 오류로 중단합니다.
### 검증
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py elsbot/tests/test_container_lookup_safety.py elsbot/tests/test_els_bot_logic.py` 통과
- `python -m unittest elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic elsbot.tests.test_daemon_stop_control` 통과 (23개)
### 변경 파일
- `elsbot/els_bot.py`
- `elsbot/tests/test_els_bot_logic.py`

## [2026-05-16] 컨테이너 이력조회 유령 데이터 방어 보강 (v5.13.21)
### 핵심
- `ONEU6027330`처럼 ISO 체크섬은 통과하지만 단독 조회 시 에러/무자료가 맞는 번호에서, 이전 컨테이너 그리드가 그대로 붙어 성공행처럼 보일 수 있는 위험을 확인했습니다.
- 새 조회 버튼을 누르기 전 그리드 원문 지문을 저장하고, 조회 후에도 같은 원문이 다른 컨테이너 요청에 남아 있으면 `이전 조회 결과 잔상 감지` 오류행으로 폐기합니다.
- 이 오류는 불확실 실패로 취급해 1회 재조회하며, 그래도 같은 잔상이면 성공 데이터로 쓰지 않습니다.
- NAS Chrome #3/#4는 `ELS_DRIVER_STAGGER_SEQUENCE=0,15,75,105`로 후행 기동해 remote-debugging 시작 충돌을 완화합니다.
### 검증
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py elsbot/tests/test_container_lookup_safety.py elsbot/tests/test_daemon_stop_control.py` 통과
- `python -m unittest elsbot.tests.test_container_lookup_safety elsbot.tests.test_daemon_stop_control elsbot.tests.test_els_bot_logic` 통과 (22개)
### 변경 파일
- `docker/docker-compose.yml`
- `elsbot/els_bot.py`, `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_container_lookup_safety.py`, `elsbot/tests/test_daemon_stop_control.py`

## [2026-05-16] 아산 선적관리-컨테이너 이력조회 콜라보 1차 (v5.13.20)
### 핵심
- 선적관리 엑셀 동기화는 현재 화면용 `branch_shipping_rows`를 엑셀 최신본 기준으로 교체하되, 엑셀에서 사라진 행은 `branch_shipping_row_archive`에 `deleted_from_excel`로 보관합니다.
- 선적관리 화면에 `컨테이너 조회` 버튼을 추가해 현재 검색/필터 결과의 컨테이너를 기존 `/api/els/run` 스트림 파이프라인으로 조회합니다.
- 조회 결과의 No.1 메인 행을 `이력 ...` 초록색 컬럼으로 선적관리 표에 붙이고, 사용자는 기존 컬럼 숨김 기능으로 노출 여부를 조정할 수 있습니다.
- 조회 결과는 `branch_shipping_container_lookups`에 run_id/컨테이너별로 누적 저장하며, 선적관리 화면에는 엑셀 저장 시각과 DB수정 시각을 분리해 표시합니다.
### 검증
- Supabase migration `asan_shipping_history_and_lookup` 적용 성공. archive/lookup 테이블 생성 확인.
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (17개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/page.js" app/api/branches/asan/shipping/route.js app/api/branches/asan/shipping/container-results/route.js` 0 errors
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과 (번들 Python 사용)
- `npm.cmd run build` 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
### 변경 파일
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`, `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/app/api/branches/asan/shipping/container-results/route.js`
- `web/utils/containerHistoryResults.mjs`
- `web/supabase_sql/20260516_asan_shipping_history_and_lookup.sql`
- `web/tests/asanShippingFlow.test.mjs`

## [2026-05-16] 컨테이너 이력조회 워커 후행 기동 안정화 (v5.13.20)
### 핵심
- NAS에서 #3/#4 Chrome이 #1/#2 로그인/메뉴 진입 중 동시에 뜨며 remote-debugging 연결 실패가 나는 패턴을 확인했습니다.
- 초기 2개 워커는 기존처럼 빠르게 띄우고, #3/#4는 `ELS_DRIVER_STAGGER_SEQUENCE=0,15,75,105`로 후행 기동하도록 조정했습니다.
- 조회는 준비된 워커 수로 먼저 시작하고, 뒤 워커가 살아나면 기존 동적 배치 확장 로직으로 같은 조회 안에 투입됩니다.
### 검증
- `python -m py_compile elsbot/els_web_runner_daemon.py elsbot/tests/test_daemon_stop_control.py` 통과
- `python -m unittest elsbot.tests.test_daemon_stop_control elsbot.tests.test_container_lookup_safety elsbot.tests.test_els_bot_logic` 통과 (20개)
### 변경 파일
- `docker/docker-compose.yml`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_daemon_stop_control.py`

## [2026-05-16] 컨테이너 이력조회 300초 스톱/alert 대기 보강 (v5.13.19)
### 핵심
- DrissionPage `handle_alert()` 기본 timeout 10초가 컨테이너마다 반복되어 `조회 후 초기 판정`이 83초대로 늘어나는 병목을 `timeout=0.05` 즉시 확인으로 수정.
- 데몬 워커가 0개인 상태에서 `/run`이 바로 워커 대기/타임아웃으로 빠지지 않고 먼저 로그인 세션을 확보하도록 보강.
- 배치 시작 후 워커가 2→3→4개로 살아나면 같은 조회 안에서 병렬도 창을 확장하도록 변경.
- NAS nginx `/api/els` 스트리밍 타임아웃/버퍼링을 보강하고, Vercel route `maxDuration`을 늘려 300초 스톱 위험을 낮춤.
- 클라이언트 연결이 끊기면 `GeneratorExit`를 삼키지 않고 데몬 stop을 호출해 보이지 않는 조회가 계속 도는 현상을 차단.
### 검증
- `python -m py_compile docker/els-backend/app_bot.py elsbot/els_web_runner_daemon.py elsbot/els_bot.py ...` 통과
- `python -m unittest elsbot.tests.test_container_lookup_safety elsbot.tests.test_daemon_stop_control elsbot.tests.test_els_bot_logic` 통과 (19개)
- `npx.cmd eslint "app/api/els/run/route.js" "app/(main)/employees/container-history/page.js"` 0 errors, 기존 warning 5개
- `git diff --check` 통과
### 변경 파일
- `docker/els-backend/app_bot.py`, `docker/els-gateway/nginx.conf`, `docker/docker-compose.yml`
- `elsbot/els_bot.py`, `elsbot/els_web_runner_daemon.py`, `elsbot/tests/*`
- `web/app/api/els/run/route.js`

## [2026-05-16] 아산 선적관리 초기 로딩 추가 최적화 (v5.13.18)
### 🚀 Achievement
- **초기 payload 축소**: 선적관리 기본 조회를 500행에서 100행으로 낮춰 첫 응답을 212,531 bytes에서 42,992 bytes 수준으로 줄였습니다.
- **엑셀 번들 지연 로딩**: `xlsx`를 화면 진입 시 로드하지 않고 엑셀 다운로드 버튼 클릭 시 `import('xlsx')`로 가져오도록 변경했습니다.
- **불필요한 기본 fetch 감소**: 아산 메인 탭 선택을 localStorage에 저장해 선적관리 사용자가 재방문할 때 배차판 fetch가 먼저 실행되지 않게 했습니다.
- **운영 DB 경로 재확인**: Vercel/NAS gateway/NAS core 모두 `source=supabase`, 총 965건 기준으로 응답하는 것을 확인했습니다.
### 🧪 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (14개)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/page.js" app/api/branches/asan/shipping/route.js` 0 errors
- `npm.cmd run build` 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- 운영 API: `page_size=100` 100/965건, 42,992 bytes, Vercel 경유 700ms대. NAS gateway/core 직접 호출은 230ms대.
### 📁 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 워커/표시 병목 보강 (v5.13.17)
### 🚀 Achievement
- **준비 워커 전체 사용**: 수동 컨테이너 이력조회 배치는 `reserveSingle=false`를 전달해 현재 준비된 워커를 모두 사용합니다. AI/단건 요청은 배치 중이면 큐에서 기다리는 쪽으로 둡니다.
- **부분 결과 즉시 표시**: 백엔드 스트림은 입력 순서 앞 건을 기다리지 않고 완료된 컨테이너 행을 즉시 내려보냅니다. 프론트 테이블은 기존처럼 입력 순서를 유지하므로 뒤 결과도 제자리에서 먼저 갱신됩니다.
- **클릭 병목 완화**: WebSquare 입력값은 JS 세팅/검증을 먼저 사용하고, 조회 버튼은 JS click 이벤트를 우선 트리거해 DrissionPage 물리 입력/클릭이 사이트 응답을 80~90초 붙잡는 경로를 줄였습니다.
- **원인 추적 로그**: 입력창 탐색, 모달 정리, 입력값 세팅, 조회 버튼 트리거 등 단계별 1초 이상 지연을 로그로 남겨 다음 병목 위치를 바로 확인할 수 있게 했습니다.
### 🧪 검증
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety elsbot.tests.test_daemon_stop_control` 통과 (16개, 번들 Python 사용)
- `python -m py_compile docker/els-backend/app_bot.py elsbot/els_web_runner_daemon.py elsbot/els_bot.py elsbot/tests/test_els_bot_logic.py` 통과
- `node --test web/tests/containerInput.test.mjs` 통과 (4개)
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js"` 0 errors, 기존 warning 5건
- `npm.cmd run build` 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- `git diff --check` 통과
### 📁 변경 파일
- `docker/els-backend/app_bot.py`
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_container_lookup_safety.py`
- `elsbot/tests/test_els_bot_logic.py`
- `web/app/(main)/employees/container-history/page.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] NAS 배포 Docker PATH/실패 감지 보강 (v5.13.16)
### 🚀 Achievement
- **Docker PATH 주입**: Synology 비대화형 sudo 환경에서 `docker-compose build`가 내부적으로 호출하는 `docker` 실행 파일을 찾도록 `PATH=/usr/local/bin:...`을 명시 주입했습니다.
- **거짓 완료 방지**: `set -e`를 추가해 compose/build/prune 중 하나라도 실패하면 스크립트가 즉시 실패하도록 바꿨습니다.
- **sudoers 호환 유지**: 명령 자체는 `/usr/local/bin/docker-compose`, `/usr/local/bin/docker` 절대경로를 유지해 NOPASSWD 규칙과 계속 일치합니다.
### 🧪 검증
- `C:\Program Files\Git\bin\bash.exe -n scripts/nas-deploy.sh` 통과
- NAS에서 `sudo -n PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /usr/local/bin/docker-compose version` 통과
### 📁 변경 파일
- `scripts/nas-deploy.sh`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] NAS 전체 배포 sudo 경로 보강 (v5.13.15)
### 🚀 Achievement
- **비대화형 배포 복구**: `nas-deploy.sh`가 SSH 비대화형 세션에서도 sudo 비밀번호 프롬프트 없이 진행되도록 `sudo -n`을 사용합니다.
- **sudoers 경로 일치**: Docker 호출을 `/usr/local/bin/docker-compose`, `/usr/local/bin/docker` 절대경로로 고정해 기존 NOPASSWD 규칙과 정확히 맞췄습니다.
- **반복 장애 방지**: core/bot/gateway 전체 재빌드 중 sudo 프롬프트 때문에 배포가 중간에 멈추는 경로를 제거했습니다.
### 🧪 검증
- `C:\Program Files\Git\bin\bash.exe -n scripts/nas-deploy.sh` 통과
### 📁 변경 파일
- `scripts/nas-deploy.sh`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 중지/리셋 강제화 (v5.13.14)
### 🚀 Achievement
- **조회 중지 버튼 전환**: `실시간 이력 조회` 버튼이 진행 중에는 `조회 중지`로 바뀌고, 클릭 시 프론트 스트리밍 fetch를 즉시 Abort합니다.
- **행 누락 없는 중지 처리**: 중지/대기 초과/데몬 리셋 시 아직 결과가 없는 컨테이너도 입력 순서를 유지한 `ERROR / 조회 중지됨` 행으로 남깁니다.
- **배치 큐 강제 취소**: NAS 백엔드는 모든 컨테이너를 한 번에 future로 넣지 않고 살아있는 배치 워커 수만큼 순차 제출합니다. stop 신호가 오면 미제출/취소 가능 작업을 즉시 `조회 중지됨`으로 확정합니다.
- **데몬 리셋 세대 무효화**: 봇 데몬에 stop 플래그와 generation을 추가해, 리셋 전에 예약된 로그인/워커복구/세션관리 스레드가 뒤늦게 성공해도 워커 풀에 다시 붙지 못하게 막았습니다.
- **워커 재큐 방지**: stop 이후 반환되는 드라이버는 큐에 넣지 않고 종료해, 리셋 뒤 오래된 컨테이너 조회가 계속되는 경로를 차단했습니다.
### 🧪 검증
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety elsbot.tests.test_daemon_stop_control` 통과 (16개, 번들 Python 사용)
- `python -m py_compile docker/els-backend/app_bot.py elsbot/els_web_runner_daemon.py elsbot/els_bot.py elsbot/tests/test_daemon_stop_control.py` 통과
- `node --test web/tests/containerInput.test.mjs` 통과 (4개)
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js"` 0 errors, 기존 warning 5건
- `npm.cmd run build` 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- `git diff --check` 통과
### 📁 변경 파일
- `docker/els-backend/app_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_daemon_stop_control.py`
- `web/app/(main)/employees/container-history/page.js`
- `web/app/(main)/employees/container-history/container-history.module.css`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 페이지 단위 DB 조회 완성 (v5.13.13)
### 🚀 Achievement
- **초기 로딩 축소**: 선적관리 첫 조회가 전체 대량 행 대신 Supabase DB에서 500행 단위로 받아오도록 변경했습니다.
- **서버 검색 적용**: 전체 검색어를 API 쿼리로 전달하고, 백엔드에서 콤마 구분 검색을 OR 조건으로 처리하도록 보강했습니다.
- **더보기 UX 추가**: DB 전체 건수와 현재 로드 건수를 표시하고, `더 보기` 버튼으로 다음 페이지를 이어 붙여 조회할 수 있게 했습니다.
- **동기화 후 조회 일관화**: `NAS 동기화` POST 응답도 동일한 페이지 크기/검색 조건을 반영해 돌려받도록 맞췄습니다.
- **Hook 경고 제거**: 선적관리 컴포넌트의 React Hook dependency 경고를 정리했습니다.
### 🧪 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (13개)
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과 (번들 Python 사용)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" app/api/branches/asan/shipping/route.js` 0 errors
- `npm.cmd run build` 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- 로컬 dev 서버 `/employees/branches/asan` HTTP 200 확인(인증 보호로 로그인 페이지 응답)
- Supabase 운영 DB 확인: `branch_shipping_files` 1건, `branch_shipping_rows` 965건 조회 성공
### 📁 변경 파일
- `docker/els-backend/app.py`
- `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 아산 선적관리 조회/동기화 분리 (v5.13.12)
### 🚀 Achievement
- **GET 조회 경량화**: 아산 선적관리 API의 일반 조회 경로에서 NAS 엑셀 동기화를 제거하고, Supabase에 이미 적재된 DB 조회를 우선하도록 분리했습니다.
- **POST 강제 동기화**: 웹의 `NAS 동기화` 버튼은 같은 API의 POST를 호출해 사용자가 명시적으로 갱신할 때만 NAS 엑셀을 파싱하고 Supabase에 반영합니다.
- **프록시 확장**: Next.js 선적관리 프록시 라우트가 GET뿐 아니라 POST도 NAS 백엔드로 전달하도록 보강했습니다.
- **회귀 방어**: GET 경로에 `sync_asan_shipping_python()` 호출이 되살아나지 않도록 Node 회귀 테스트를 추가했습니다.
### 🧪 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs` 통과 (12개)
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과 (번들 Python 사용)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" app/api/branches/asan/shipping/route.js` 0 errors, 기존 Hook dependency warning 2건
### 📁 변경 파일
- `docker/els-backend/app.py`
- `docker/els-backend/app_core.py`
- `web/app/api/branches/asan/shipping/route.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 자료실 첨부파일 목록형 재통일 (v5.13.11)
### 🚀 Achievement
- **서식자료실 다운로드 UI 통일**: 서식자료실 상세에 남아 있던 단일 카드형 다운로드 블록을 제거하고, 업무자료실과 같은 `IntranetDataTable` 기반 목록형으로 변경했습니다.
- **자료실 하위 재검토**: 업무자료실/서식자료실 상세 첨부 표시 경로를 다시 훑어 카드형 `attachmentItem` 잔존 경로가 없도록 정리했습니다.
- **열 구조 표준화**: `No / 파일명 / 크기 / 작업` 열과 `내려받기 / 주소 복사` 액션 구성을 동일하게 맞췄습니다.
### 🧪 검증
- `npm.cmd run lint` 통과
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/form-templates/[id]/PageClient.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 자료실/연락처 상세 이미지 반응형 보강 (v5.13.10)
### 🚀 Achievement
- **자료실 본문 오버플로 방지**: 업무자료실 상세의 HTML 본문을 공통 `contentBody`로 감싸, 삽입 이미지와 넓은 표가 브라우저 축소 시 페이지 밖으로 밀려나지 않게 했습니다.
- **서식자료실 렌더 통일**: 서식자료실 상세의 마크다운 이미지 렌더 경로도 동일한 본문 규칙을 쓰도록 맞췄습니다.
- **연락처/작업지 상세 공통 가드**: `DetailSection` 내부 이미지·표·pre에 `max-width`, 내부 가로 스크롤, 이미지 비율 유지 규칙을 추가해 연락처 상세 하위 페이지까지 같은 기준으로 동작합니다.
### 🧪 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- 빌드 중 외부 HTTPS fetch EACCES와 차량 엑셀 export dynamic 경고는 기존 환경/라우트 경고이며 종료코드는 0입니다.
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/intranet.module.css`
- `web/app/(main)/employees/(intranet)/work-docs/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/form-templates/[id]/PageClient.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 워커 큐 안정화 (v5.13.9)
### 🚀 Achievement
- **활성 워커 기반 병렬도 조절**: 배치 조회가 `ELS_BATCH_MAX_WORKERS=4`를 무조건 쓰지 않고 현재 살아있는 데몬 워커 수에 맞춰 병렬도를 낮춥니다. 워커 1개 상태에서는 1개 순차 처리로 동작합니다.
- **단건/AI 워커 예약**: 워커가 2개 이상 살아있으면 배치는 1번 워커를 피하고, 단건/AI 조회가 먼저 사용할 수 있게 예약합니다. 예약 기능은 `ELS_RESERVE_SINGLE_WORKER=false`로 끌 수 있습니다.
- **큐 대기 강화**: 워커가 없을 때 즉시 실패하지 않고 최대 240초까지 대기하도록 배치/단건 요청에 `acquireTimeoutSec`를 전달합니다.
- **로그인 전 표시 보정**: 활성 워커가 0개인 초기 상태에서는 배치 병렬도를 1개 대기 모드로 표시해, 로그인 전부터 3개 병렬처럼 보이는 혼선을 막았습니다.
- **죽은 워커 복구**: 저장된 로그인 세션이 있고 비밀번호 보호 모드가 아니면 누락된 워커를 쿨다운(10분) 기준으로 1개씩만 재기동합니다. 로그인 실패 횟수는 기존 보호 로직을 유지합니다.
- **죽은 드라이버 재큐 방지**: 세션 복구 실패 후 이미 제거한 드라이버가 `finally`에서 다시 큐에 들어가는 경로를 차단했습니다.
### 🧪 검증
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety` 통과 (14개)
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
- `node --test web/tests/containerInput.test.mjs` 통과 (4개)
### 📁 변경 파일
- `docker/els-backend/app_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_container_lookup_safety.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 WebSquare 입력 검증 보강 (v5.13.8)
### 🚀 Achievement
- **필수입력 알림 방어**: ETrans가 `[컨테이너이동] 필수 입력 항목 입니다.` 알림을 띄우면 즉시 감지·닫고 `INPUT_REQUIRED_MODAL` 오류로 반환하도록 했습니다. 이제 모달에 갇혀 진행중 행만 남는 상황을 줄입니다.
- **입력값 검증 추가**: 조회 버튼 클릭 전에 DOM 값과 WebSquare 컴포넌트 값을 모두 읽어 요청 컨테이너 번호가 실제 입력창에 반영됐는지 확인합니다. 마지막 동작은 기존 안정 흐름처럼 물리 입력으로 유지합니다.
- **오판 축소**: `데이터 없음` 판정은 전체 `document.body`가 아니라 602 컨테이너 조회 결과 영역과 현재 보이는 모달만 검사합니다.
### 🧪 검증
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety` 통과 (13개)
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
### 📁 변경 파일
- `elsbot/els_bot.py`
- `elsbot/tests/test_els_bot_logic.py`
- `elsbot/tests/test_container_lookup_safety.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 오류 행 누락 방지 (v5.13.7)
### 🚀 Achievement
- **입력 행 유지**: 화면 입력 파서가 ISO 6346 체크섬까지 통과한 번호만 남기던 동작을 바꿔, 컨테이너 번호 형식(영문4+숫자7)이 맞으면 체크섬 오류 번호도 조회 대상으로 유지합니다.
- **오류 사유 표시 보장**: 체크섬 오류 번호는 NAS 봇 단 검증에서 `ERROR / 유효하지 않은 컨테이너 번호(ISO 6346 검증 실패)` 행으로 돌아오므로, 10건 요청 중 문제 있는 건도 말없이 빠지지 않고 순서에 맞춰 표시됩니다.
### 🧪 검증
- `node --test web/tests/containerInput.test.mjs` 통과 (4개)
### 📁 변경 파일
- `web/utils/containerInput.mjs`
- `web/app/(main)/employees/container-history/page.js`
- `web/tests/containerInput.test.mjs`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 컨테이너 이력조회 정확도 방어 및 4워커 복구 (v5.13.6)
### 🚀 Achievement
- **유령 데이터 차단 강화**: NAS 봇 단에서 ISO 6346 체크섬 검증을 수행해 변형·비정상 컨테이너 번호는 외부 사이트 조회 전 `ERROR`로 확정하도록 했습니다.
- **빈 그리드 오판 수정**: WebSquare 그리드 `rowCount=0`은 로딩 중 상태로 보고, 명시적인 `"데이터가 없음"` 계열 문구가 있거나 실제 이력 행이 추출될 때만 결과를 확정합니다.
- **stale 데이터 방어**: 전체 페이지의 다른 그리드 fallback을 제거하고, 602 컨테이너이동현황 영역의 번호+상태 행만 파싱하도록 제한했습니다. 조회 전 WebSquare 객체와 DOM tbody를 함께 초기화합니다.
- **실패 재조회**: `데이터 추출 실패`, 통신 예외 등 불확실 실패만 1회 재조회합니다. 검증된 `NODATA`와 체크섬 오류는 재조회하지 않아 가짜 성공으로 번지는 경로를 막았습니다.
- **4워커 복구 및 순서 보장**: `ELS_MAX_DRIVERS=4`, `ELS_BATCH_MAX_WORKERS=4`를 Docker 환경에 명시하고, 병렬 내부 처리 결과는 사용자 입력 순서대로 스트리밍합니다.
- **첫 조회 지연 원인 보정**: 로그인 직후 이미 컨테이너 조회 화면에 진입한 드라이버에 `page_ready=True`를 기록해 첫 단건 조회에서 불필요한 메뉴 재진입을 생략합니다.
### 🧪 검증
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety` 통과 (10개)
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py` 통과
- `git diff --check` 통과
### 📁 변경 파일
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `docker/els-backend/app_bot.py`
- `docker/docker-compose.yml`
- `elsbot/tests/test_els_bot_logic.py`
- `elsbot/tests/test_container_lookup_safety.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 앱 로컬 GPS 안정화/중복 전송 방어 및 종료 잔류 수정 (v5.13.5 / APK v5.11.12)
### 🚀 Achievement
- **수신/반영 분리**: 앱 지도 화면은 1초 GPS 수신을 유지하되, 로컬 안정화 필터를 통과한 확정 포인트만 차량 마커·경로선·서버 전송에 사용하도록 변경했습니다.
- **정차/저속 흔들림 방어**: 실내·신호대기처럼 위치가 튀었다 돌아오는 값은 후보 포인트로 보류하고, 같은 위치/방향으로 연속 확인될 때만 확정점으로 승격합니다.
- **배터리/서버 부하 조절**: 일반 운행은 12~45초 중심의 전략 전송, 앱 지도/웹 실시간 추적은 2초 고감도 전송으로 분리했습니다. 오프라인 큐도 같은 위치 반복 포인트를 압축합니다.
- **서버 저장 중복 방어**: `/api/vehicle-tracking/location`에서 이동거리/heartbeat 기준 미달 포인트는 저장하지 않고, 저장 대상에만 역지오코딩을 수행해 DB/외부 API 부하를 줄였습니다.
- **앱 종료 잔류 수정**: 운행 종료 후 뒤로가기 종료 시 Android `onPause()`가 오버레이 서비스를 다시 깨우지 않도록 active trip 기준을 추가하고, 명시 종료 시 서비스/알림을 함께 정리합니다.
- **권한/도구 요청 문서화**: 다음 세션에서도 막히면 우회하지 않고 형에게 필요한 도구·권한을 요청하도록 `AGENTS.md`, `docs/03_RULES.md`, `docs/08_ENVIRONMENT_SETUP.md`를 보강했습니다.
### 🧪 검증
- `node --test web/tests/vehicleLocation.test.mjs` 통과 (6개)
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1` 통과, APK metadata `versionCode 5153` / `versionName 5.11.12` 확인
- `npm.cmd run build` 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/driver-src/modules/gps.js`
- `web/app/api/vehicle-tracking/location/route.js`
- `web/utils/vehicleLocation.mjs`
- `web/tests/vehicleLocation.test.mjs`
- `web/android/app/src/main/java/com/elssolution/driver/*`
- `web/android/app/build.gradle`
- `web/public/apk/version.json`
- `web/public/apk/els_driver.apk`
- `AGENTS.md`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`
- `docs/03_RULES.md`
- `docs/08_ENVIRONMENT_SETUP.md`

## [2026-05-16] AI 권한/도구 요청 기준 문서화
### 🚀 Achievement
- **요청 프로토콜 추가**: AI가 네트워크, Git, NAS/Supabase, Android/Gradle, 브라우저 자동화, OS 권한, 추가 CLI 도구에서 막히면 우회하지 않고 형에게 필요한 항목·이유·명령어·영향 범위를 요청하도록 규칙화했습니다.
- **환경 가이드 보강**: 선택 도구(`gh`, Supabase CLI, Playwright Chromium)와 Windows 권한 경고 정리 예시를 `docs/08_ENVIRONMENT_SETUP.md`에 추가했습니다.
### 🧪 검증
- Markdown 문서 변경만 수행했습니다.
### 📁 변경 파일
- `AGENTS.md`
- `docs/03_RULES.md`
- `docs/08_ENVIRONMENT_SETUP.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-16] 차량위치관제 GPS 품질/앱 지도 UX 리팩터링 (v5.13.4 / APK v5.11.11)
### 🚀 Achievement
- **실제 운송 데이터 분석**: 최근 운행 GPS 표본 1,000개를 분석해 raw 97.6km가 보정 후 54.4km로 줄어드는 것을 확인했습니다. 정차/저속 중 좌표 점프 47건, spike-return 37건, 불가능 순간속도 10건이 핵심 원인이었습니다.
- **GPS 판정 강화**: `shouldAcceptLocation()`에 저속 점프, 정차 중 이동거리, 적응형 화물차 속도 제한, 기록시간 역전 방지 기준을 추가했습니다. 서버 저장 시 클라이언트 수신시각을 보존해 오프라인 큐가 한 시각에 몰리며 순간이동처럼 보이는 문제를 줄였습니다.
- **관제 응답 정제**: Vercel API와 NAS Flask 관제 API 모두 최신 위치를 raw 마지막 점이 아니라 보정 경로의 마지막 정상점으로 계산하도록 변경했습니다. 기록 탭의 최고/평균 속도도 보정 포인트 기준으로 계산합니다.
- **앱 지도 개선**: 앱 전경/지도 화면에서 GPS 수집 주기를 단축하고, 지도 화면은 5초 폴링과 1초 전경 샘플링으로 부드럽게 갱신합니다. 선택 차량의 지나온 경로선은 현재 위치 샘플을 따라 계속 연장됩니다.
- **UX 정리**: 앱 지도 상세보기 중 운행 목록 패널을 접어 겹침을 해소하고, 차량 마커 반복 클릭 시 13↔15 줌 토글이 되도록 했습니다. 내 위치/전체보기 버튼의 이모지를 제거했습니다. 웹 관제 상세 패널은 요약 헤더와 지표 스트립을 추가해 읽기 쉽게 정리했습니다.
- **APK 반영**: 드라이버 앱 버전을 v5.11.11 / versionCode 5152로 올리고 공식 빌드 스크립트로 `web/public/apk/els_driver.apk`를 갱신했습니다.
### 🧪 검증
- `node --test web/tests/vehicleLocation.test.mjs` 통과
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py` 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1` 통과, APK metadata `versionCode 5152` / `versionName 5.11.11` 확인
- 브라우저 확인: `http://localhost:3007/employees/vehicle-tracking?debug=true`에서 관제 화면과 상세 패널 렌더링 확인. 콘솔에는 위치 권한 경고만 확인됨.
- `npm.cmd run build` 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/utils/vehicleLocation.mjs`
- `web/tests/vehicleLocation.test.mjs`
- `web/app/api/vehicle-tracking/location/route.js`
- `web/app/api/vehicle-tracking/trips/route.js`
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/constants/vehicleTracking.js`
- `web/app/(standalone)/driver-app/page.js`
- `web/driver-src/*`
- `web/android/app/build.gradle`
- `web/public/apk/version.json`
- `web/public/apk/els_driver.apk`
- `docker/els-backend/app.py`
- `docker/els-backend/app_core.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-15] 업무보고/아산지점 테이블 밀도 표준화 (v5.13.3)
### 🚀 Achievement
- **업무보고 목록 표준화**: 전체/일일/월간/내 업무보고 목록의 테이블 제목행을 연락처형 페이지와 같은 짙은 블루 헤더로 통일하고, 셀 폰트와 행 여백을 고밀도 업무 화면 기준으로 축소했습니다.
- **업무보고 하위페이지 보정**: 작성/수정/상세 화면의 제목 영역, 입력 라벨, 본문 크기, 첨부파일 표시를 같은 톤으로 정리했습니다.
- **아산 배차판 보정**: 배차판 테이블 헤더 색상, 폰트 크기, 셀 여백을 인트라넷 표준에 맞췄고 상단 탭/헤더 간격도 줄였습니다.
- **아산 선적관리 보정**: 선적관리 가상 스크롤 행 높이를 34px에서 28px로 낮추고 테이블 셀 padding/font를 축소해 큰 여백을 줄였습니다.
### 🧪 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/reports/*`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-15] AI 어시스턴트 대화 삭제 DB 동기화 보강 (v5.13.2)
### 🚀 Achievement
- **전체 삭제 레이스 차단**: 전체 삭제 버튼 실행 전에 예약된 DB 자동저장 타이머를 먼저 취소하여, 삭제 직후 기존 대화 목록이 다시 `POST`되는 문제를 막았습니다.
- **삭제 즉시 반영**: 개별 대화 삭제와 현재 대화 비우기도 로컬 상태 변경 후 DB에 즉시 치환/삭제되도록 보강했습니다.
- **빈 대화 DB 재생성 방지**: 사용자 메시지가 없는 기본 대화만 남은 경우에는 `ai_chat_memory`를 다시 upsert하지 않고 삭제 상태를 유지합니다.
- **삭제 API 응답 보강**: `/api/chat/memory`의 `DELETE` 응답에 삭제 건수와 상세 오류 메시지를 포함해 실패가 조용히 묻히지 않도록 했습니다.
### 🧪 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/api/chat/memory/route.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-15] 이스터에그 복구 및 인트라넷 전체 폰트/자료실 상세 보정 (v5.13.1)
### 🚀 Achievement
- **이스터에그 복구**: 공식 메뉴에 노출되지 않는 숨은 기능인 랜덤게임 라우트를 복구하고, AI 어시스턴트 하단 빌드 문구 링크로 진입 가능하게 유지했습니다. 송미관 모달은 뉴스 페이지 이스터에그로 명시하고 버튼 타입/접근성 라벨을 보강했습니다.
- **작업지정보 컬럼 보정**: 작업지 주소가 과도하게 긴 유동 폭을 차지하던 구성을 줄이고, `주의사항`과 `특이사항` 축약 컬럼을 추가했습니다.
- **업무자료실 상세 정리**: 상세 화면을 공통 상세 구조로 재구성하고, 첨부파일을 카드형 박스 대신 게시목록형 테이블로 정리했습니다.
- **인트라넷 전체 폰트 기준 보정**: CSS 모듈이 다른 인트라넷 페이지도 제목/상세제목/본문/라벨/버튼 높이 기준을 따라가도록 `SiteLayout.module.css` 상위 보정 레이어를 추가했습니다.
### 🧪 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- `contactDisplay` 빠른 케이스 검증 통과
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/(main)/employees/(intranet)/random-game/*`
- `web/app/(main)/employees/news/page.js`
- `web/app/(main)/employees/(intranet)/work-sites/page.js`
- `web/app/(main)/employees/(intranet)/work-docs/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/intranet.module.css`
- `web/components/SiteLayout.module.css`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`
- `docs/04_MASTER_ARCHITECTURE.md`
- `docs/05_DESIGN_SYSTEM.md`
- `docs/10_INTRANET_UI_REFACTOR_20260515.md`

## [2026-05-15] 인트라넷 연락처형 페이지 UI 파이프라인 리팩토링 (v5.13.0)
### 🚀 Achievement
- **목록 구조 통일**: 사내연락망/외부연락처/협력사정보/운전원정보/작업지정보 목록을 `IntranetDataTable` 기반으로 재구성했습니다. 컬럼 폭, 테이블 헤더, 전화 링크, 상태 배지, 비고/주소 유동 컬럼 기준을 통일했습니다.
- **상세 화면 표준화**: 연락처 상세 페이지들을 `DetailHero → DetailGrid → DetailSection` 흐름으로 정리하여 이름/회사/작업지 중심 정보, 주요 필드, 메모/첨부 영역을 같은 리듬으로 배치했습니다.
- **모바일 밀도 개선**: Galaxy S24 360px 뷰포트 기준으로 카드 패딩, 버튼 높이, 본문 여백, 폰트 크기를 줄여 작은 화면에서 가로 공간을 효율적으로 쓰도록 조정했습니다.
- **공통 유틸 추가**: 전화번호/날짜 포맷, 파일 URL 안정화, 이미지 판별, 값 조합 유틸을 `contactDisplay.js`로 분리했습니다.
- **이스터에그 정책 확인 전 임시 정리**: 랜덤게임을 비활성 유산 페이지로 판단해 정리했으나, v5.13.1에서 형의 정책에 맞춰 공식 메뉴 미노출 이스터에그로 복구했습니다.
### 🧪 검증
- `npm.cmd run lint` 통과
- `npm.cmd run build` 통과
- `contactDisplay` 빠른 케이스 검증 통과
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 `EACCES` 경고가 발생했으나 빌드 종료 코드는 0입니다.
### 📁 변경 파일
- `web/app/(main)/employees/(intranet)/intranet.module.css`
- `web/components/IntranetDataTable.js`
- `web/components/IntranetRecordDetail.js`
- `web/components/ContactFilterBar.js`
- `web/utils/contactDisplay.js`
- `web/app/(main)/employees/(intranet)/internal-contacts/page.js`
- `web/app/(main)/employees/(intranet)/internal-contacts/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/external-contacts/page.js`
- `web/app/(main)/employees/(intranet)/external-contacts/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/partner-contacts/page.js`
- `web/app/(main)/employees/(intranet)/partner-contacts/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/driver-contacts/page.js`
- `web/app/(main)/employees/(intranet)/driver-contacts/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/work-sites/page.js`
- `web/app/(main)/employees/(intranet)/work-sites/[id]/PageClient.js`
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/(main)/employees/(intranet)/random-game/*` (v5.13.1에서 이스터에그로 복구)
- `docs/01_MISSION_CONTROL.md`
- `docs/10_INTRANET_UI_REFACTOR_20260515.md`

## [2026-05-15] 이트랜스 '데이터가 없음' 키워드 및 그리드 초기화 객체 보강 (v5.12.22)
### 🚀 Achievement
- **키워드 탐지 강화**: 이트랜스의 `"데이터가 없음"`, `"데이터가없음"` 등 변종 문구를 탐지 리스트에 추가하여 내역 없음 상황을 정확히 인지하도록 개선했습니다.
- **그리드 초기화 객체 타격**: WebSquare 엔진 객체(`window[id]`)를 직접 찾아 `setData([])`를 호출함으로써, 이전 조회 잔상이 확실히 제거되도록 수정했습니다.
- **검증 폴링 강화**: 조회 클릭 직후 대기 시간을 늘리고 더 촘촘하게 팝업을 감시하여 무결성을 확보했습니다.
### 📁 변경 파일
- `elsbot/els_bot.py`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-15] 컨테이너 이력조회 데이터 누수(잔상) 버그 긴급 수정 (v5.12.21)
### 🚀 Achievement
- **데이터 누수(잔상) 원천 차단**: 존재하지 않는 컨테이너 조회 시, 이전 성공했던 조회의 데이터가 그리드에 남아 스크래핑되는 '유령 데이터' 문제를 해결했습니다.
- **그리드 초기화 로직 강화**: 새 조회를 시작하기 전, WebSquare 그리드 내부 데이터를 강제로 비우는(`setData([])`) 전처리 단계를 추가했습니다.
- **다중 레이어 무결성 검증**:
    - 조회 클릭 직후 1.5초간 '데이터 없음' 팝업을 실시간 감시하여 즉시 조회를 종료하는 Fast-Fail 로직 적용.
    - 데이터 추출 도중에도 지속적으로 에러 메시지를 폴링하여 stale 데이터 수집 방지.
- **안정성 향상**: 비정상적인 조회 상황에서도 봇이 "내역 없음"을 정확히 판정하도록 보강하여 데이터 신뢰도를 100%로 끌어올렸습니다.
### 📁 변경 파일
- `elsbot/els_bot.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-14] 아산지점 모바일 UI 최적화 및 레이아웃 수정 (v5.12.20)
### 🚀 Achievement
- **모바일 고정 높이 해제**: 데스크탑 환경을 위해 설정했던 `height: 100vh` 제약을 모바일(768px 이하)에서 해제하여, 페이지가 잘리지 않고 아래로 자유롭게 스크롤되도록 개선했습니다.
- **저장시간 레이아웃 보강**: 모바일에서 '데이터 저장 시간' 표시가 상단 버튼과 겹쳐 메뉴가 깨지던 현상을 해결했습니다. CSS `order`와 `display: contents`를 활용해 저장 시간을 버튼 하단으로 배치하고, 전역 스타일을 입혀 가독성을 높였습니다.
- **JS/CSS 동기화**: React의 `dynamicHeight` 로직과 CSS 미디어 쿼리를 동기화하여 모든 모바일 브라우저에서 일관된 스크롤 경험을 제공합니다.
### 📁 변경 파일
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-14] 이력조회 세션 연장 안정화 및 관리 지능 보강 (v5.12.19)
### 🚀 Achievement
- **세션 연장 로직 강화**: WebSquare 특유의 버튼 ID 오타(`sessinExtension`)를 재확인하고, `find_ele_globally`를 통해 프레임 컨텍스트에 관계없이 버튼을 찾아낼 수 있도록 개선했습니다. 또한 물리 클릭 실패 시 JS 직접 실행(`by_js=True`)을 병행하여 클릭 안정성을 확보했습니다.
- **프로액티브 세션 관리**: 기존의 '무활동 20분' 기준뿐만 아니라, 활동 여부와 관계없이 '마지막 연장 후 30분'이 경과하면 자동으로 세션 연장을 수행하도록 스케줄러를 고도화했습니다. 이를 통해 대량 조회 중에도 세션이 끊기는 현상을 방지했습니다.
- **상태 추적 및 로깅**: `login_time`과 `last_extension` 시점을 기록하고, 연장 전후의 타이머 값을 로그로 남겨 세션 유지 상태를 정밀하게 모니터링할 수 있게 했습니다.
- **검증**: 사용자(형)의 실시간 브라우저 DevTools 화면을 통해 오타가 포함된 정확한 ID를 교차 검증 완료했습니다.
### 📁 변경 파일
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-13] 아산 선적관리 경량화 및 Supabase 전환 기반 (v5.12.18)
### 🚀 Achievement
- **가상 스크롤 적용**: 선적관리 표가 전체 행을 한 번에 DOM에 렌더링하지 않고, 현재 보이는 구간과 여유 행만 그리도록 변경해 대량 행 스크롤 부담을 줄였습니다.
- **DB 전환 스키마 추가**: `branch_shipping_files`, `branch_shipping_rows` 테이블 마이그레이션을 추가해 NAS 엑셀 데이터를 행 단위 JSONB로 저장하고 검색/페이징 기반으로 확장할 수 있게 했습니다.
- **NAS 백엔드 동기화 경로 추가**: `app_core.py`와 로컬/이미지용 `app.py`에 선적관리 mtime 감지, Supabase 동기화, DB 조회, 엑셀 캐시 폴백 로직을 추가했습니다. 테이블 미적용 상태에서는 기존 엑셀 캐시 방식으로 안전하게 폴백합니다.
- **검증**: 번들 Python으로 `app_core.py/app.py` 문법 컴파일 통과, `AsanShipping.js` 대상 ESLint 0 errors 확인. 기존 Hook dependency warning 2건은 잔존.
### 📁 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `docker/els-backend/app_core.py`
- `docker/els-backend/app.py`
- `web/supabase_sql/20260513_asan_shipping.sql`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-12] 드라이버 앱 작업지 자유입력 복구 (v5.12.17 / APK v5.11.10)
### 🚀 Achievement
- **상세조회 버튼 제거**: 운행 시작 화면과 일지 수정 화면의 `작업지` 입력칸 옆에 노출되던 승인되지 않은 `상세조회` 버튼을 제거하고, 입력칸을 전체 폭 자유입력 필드로 복구했습니다.
- **조회 기능 잔여물 제거**: `App.lookupWorkSite` 노출, 작업지 상세조회 모달, 뒤로가기 모달 처리, 조회 함수 본문을 함께 제거해 앱 안에서 해당 기능이 다시 호출되지 않도록 정리했습니다.
- **APK 캐시버스터 갱신**: `versionCode 5151`, `versionName 5.11.10`으로 올리고 공식 `scripts/build_driver_apk.ps1`로 `driver-src` 캐시버스터, Capacitor sync, APK 빌드 및 `web/public/apk/els_driver.apk` 반영을 완료했습니다.
- **검증**: `driver-src`와 Android assets에서 `상세조회/lookupWorkSite/modal-work-site/work-site-modal` 잔여 검색 0건 확인, `npm.cmd run lint` 통과, APK 내부 버전 `v5.11.10` 확인.
### 📁 변경 파일
- `web/driver-src/index.html`
- `web/driver-src/app.js`
- `web/driver-src/modules/trip.js`
- `web/android/app/build.gradle`
- `web/driver-src/modules/*.js`
- `web/public/apk/version.json`
- `web/public/apk/els_driver.apk`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-12] 드라이버 앱 지도 GPS 샘플링 및 현재 운행 우선 표시 보강 (v5.12.16 / APK v5.11.9)
### 🚀 Achievement
- **현재 운행 우선 대표 선택**: 같은 차량의 `completed` 운행이 `updated_at/completed_at` 때문에 현재 `driving` 운행보다 최신으로 잡히던 케이스를 막기 위해, 앱 지도용 운행 정렬을 `driving > paused > completed` 우선순위로 보정했습니다.
- **완료 운행 지도 기본 제외**: 앱 지도 마커/전체보기 기본 대상에서 완료 운행을 제외해, 운행 중 마커를 눌렀는데 완료 경로의 마지막 위치를 현재 운행처럼 보는 오인을 차단했습니다.
- **지도 화면 1초 GPS 샘플링**: 지도 화면이 열려 있고 운행 중일 때만 스마트폰 전경 GPS를 1초마다 확인합니다. 화면 마커와 내 차량 추적은 이 샘플로 부드럽게 움직이고, 서버 전송은 기존 `onGpsUpdate`의 정확도/간격/필수 포인트 필터를 그대로 유지합니다.
- **APK 캐시버스터 갱신**: `versionCode 5150`, `versionName 5.11.9`로 올리고 공식 `scripts/build_driver_apk.ps1`로 `driver-src` 캐시버스터, Capacitor sync, APK 빌드 및 `web/public/apk/els_driver.apk` 반영을 완료했습니다.
- **검증**: `web`에서 `npm.cmd run lint`, `npm.cmd run build` 통과. 첫 APK 빌드는 샌드박스 네트워크 차단으로 Gradle wrapper 다운로드가 막혀 내부 버전 불일치가 났고, 권한 승인 후 재실행하여 새 APK 산출물 시간과 `version.json` 5150 반영을 확인했습니다.
### 📁 변경 파일
- `web/driver-src/modules/gps.js`
- `web/driver-src/modules/map.js`
- `web/driver-src/modules/locationFilter.js`
- `web/android/app/build.gradle`
- `web/driver-src/app.js`, `web/driver-src/index.html`, `web/driver-src/modules/*.js`
- `web/public/apk/version.json`
- `web/public/apk/els_driver.apk`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-12] 안전운임 구간조회 할증/부대비용 계산 보강 (v5.12.15)
### 🚀 Achievement
- **체크 상태-결과 금액 정합성 보강**: 구간조회 `SurchargePanel`이 전달하는 요약 배율(`totalPctMult`)만 사용하지 않고, 실제 적용 목록(`pctApplied`, `fixedApplied`)을 기준으로 퍼센트 할증과 부대비용을 재계산하도록 수정했습니다.
- **저장 내역 할증 정보 보존**: 저장 결과에 적용/제외 할증 목록을 함께 담아, 화면·저장·엑셀 흐름에서 선택한 할증 정보가 유실되지 않도록 보강했습니다.
- **검증**: `web`에서 `npm.cmd run lint`, `npm.cmd run build` 통과. PowerShell 실행 정책상 `npm run lint`는 `npm.ps1` 로드 차단으로 실패하여 `npm.cmd`로 대체 실행했습니다. 빌드 중 외부/NAS fetch는 샌드박스 네트워크 차단으로 `EACCES` 로그가 출력됐지만 Next 빌드는 정상 완료됐습니다.
### 📁 변경 파일
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`
- `docs/01_MISSION_CONTROL.md`
- `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-12] 안전운임 할증/부대비용 동적 재계산 로직 구현 (v5.12.14)
### 🚀 Achievement
- **조회 결과 리액티브 구조 개선**: `SurchargePanel`에서 할증/부대비용을 변경할 때, 이미 화면에 표시된 거리별/구간별 운임 결과가 실시간으로 재계산되어 반영되도록 개선했습니다.
- **원본 데이터(Raw Data) 상태 관리**: API로부터 받은 가공 전 원본 데이터를 별도 상태(`rawDistRow`, `rawSectionRows` 등)로 저장하고, `surchargeInfo`가 변경될 때마다 `applySurchargesToRow`를 통해 최종 운임을 도출하는 파이프라인을 구축했습니다.
- **저장 정합성 확보**: 할증이 실시간으로 적용된 최종 상태의 운임 데이터가 `저장` 버튼 클릭 시 정확히 기록되도록 보장했습니다.
### 📁 변경 파일
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`

## [2026-05-12] 아산 배차판 소수 수량 집계 보정 (v5.12.13)
### 🚀 Achievement
- **글로비스 KD 외 합계 누락 해결**: 오늘 글로비스 자료에 `0.9`, `0.1` 분할 오더가 포함된 경우 `parseInt()`가 둘 다 0으로 잘라 웹 합계가 66건이 아닌 65건으로 표시되던 문제를 수정했습니다.
- **집계 경로 일괄 보정**: 배차판 상단 합계, 종합현황판 피벗/차트, AI 배차 RAG 요약 모두 소수 수량을 `Number` 기반으로 파싱해 정확히 합산하도록 변경했습니다.
### 📁 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanDashboard.js`
- `web/app/api/chat/route.js`

## [2026-05-12] 구간조회 결과 영역 레이아웃 정렬 및 가로폭 최적화 (v5.12.12)
### 🚀 Achievement
- **결과 영역 2열 그리드 밸런스 조정**: 좌측(탐색된 경로 + 할증 패널)과 우측(운임 결과)이 50:50(1fr 1fr) 비율로 완벽하게 정렬되도록 레이아웃 구조 개선.
- **컴포넌트 그룹화**: `[탐색된 경로]`와 `[할증/부대비용]`을 하나의 좌측 컬럼 wrapper로 묶어 가로폭이 제각각으로 보이던 문제 해결.
### 📁 변경 파일
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`

## [2026-05-12] 구간조회 할증패널 통합 + UX 개선 (v5.12.11)
### 🚀 Achievement
- **할증/부대비용 패널 분리 컴포넌트화 (SurchargePanel.js)**: 기존 `page.js`에만 있던 할증 선택 UI를 독립 컴포넌트로 분리하여 구간조회(RouteSearchView) 내 경로 결과 아래에 배치. 할증 선택 시 운임 결과에 실시간 반영. 고시 변경 시 `options.surcharges` JSON 데이터만 수정하면 UI 자동 반영되도록 설계.
- **최단거리 자동 선택**: 경로 탐색 결과에서 기존 `traoptimal/tracomfort` 2개만 비교하던 로직을 모든 경로(trafast 포함) 중 가장 짧은 거리를 기본 선택하도록 개선.
- **결과 표시 순서 최적화**: 안전운임 조회 결과 표시 순서를 `구간별운임 → 편도구간 → 거리별운임` 순으로 변경하여 구간별 편도 거리 우선 노출.
### 📁 변경 파일
- `web/app/(main)/employees/safe-freight/route-search/SurchargePanel.js` (신규)
- `web/app/(main)/employees/safe-freight/route-search/surcharge-panel.module.css` (신규)
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`

## [2026-05-12] 선적관리 배차시간 포맷 최적화 (v5.12.10)
### 🚀 Achievement
- **시간 데이터 표시 형식 개선**: 아산지점 선적관리 탭에서 엑셀에서 가져온 원본 `HH:mm:ss` 형식의 배차시간 데이터를 가독성을 위해 초(seconds) 단위를 잘라내고 `HH:mm` 형식(예: `09:00`)으로 일괄 포맷팅하여 보여주도록 `formatCellValue` 로직을 업데이트했습니다.

## [2026-05-12] 핫픽스: 선적관리 탭 크래시 해결 (v5.12.9)
### 🚀 Achievement
- **런타임 에러 수정**: v5.12.8에서 높이 계산 로직을 추가하며 `AsanShipping.js` 컴포넌트에 `useRef` Hook을 사용했으나, 상단 `import` 문에 `useRef`가 누락되어 발생한 React 렌더링 오류(흰 화면)를 긴급 수정했습니다.

## [2026-05-12] 브라우저 확대/축소 완벽 대응 (v5.12.8)
### 🚀 Achievement
- **동적 JS 높이 계산**: CSS `calc()`의 한계를 넘어, 브라우저 화면을 확대(Zoom)하거나 축소해도 항상 표의 하단 가로 스크롤바가 화면 맨 아래에 정확히 고정되도록 JavaScript의 `getBoundingClientRect()` 기반 실시간 높이 계산 로직을 도입했습니다.
- **배차판 & 선적관리 통합 적용**: 아산지점 배차판(`page.js`)과 선적관리 리스트(`AsanShipping.js`) 화면 모두에 창 크기 조절 이벤트 리스너를 붙여 브라우저 환경에 구애받지 않도록 개선했습니다.

## [2026-05-12] PWA/데스크탑 표 스크롤바 가시성 완전 해결 (v5.12.7)
### 🚀 Achievement
- **뷰포트 정밀 계산**: 최상단 헤더(70px), 티커(40px), 인트라넷 서브메뉴(80px), 패딩 등을 정밀히 계산하여 표 영역 컨테이너의 높이를 `calc(100vh - 250px)`로 재조정했습니다.
- **스크롤 고정 완벽 대응**: 이제 데스크탑 앱(PWA) 또는 PC 브라우저 환경에서 페이지 전체를 스크롤하지 않고도 항상 하단에 가로 스크롤바가 노출되어 즉시 좌우 스크롤이 가능합니다.
- **모바일 대응**: 모바일 환경의 경우 헤더 높이가 작으므로 모바일 전용 높이 `calc(100vh - 180px)`를 부여하여 낭비되는 세로 공간이 없도록 조정했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/branches/asan/dispatch.module.css`: `.container` 높이를 `100vh - 250px` (모바일 `180px`)로 조정.
- `web/app/(main)/employees/branches/asan/shipping.module.css`: 동일한 방식의 높이 계산 로직 적용.

## [2026-05-11] 아산 배차판 PC 높이 최적화 — 하단 스크롤바 가시성 개선 (v5.12.6)
### 🚀 Achievement
- **PC 레이아웃 동적 높이 적용**: 배차판의 최상위 컨테이너를 브라우저 창 높이(`100vh`)에 맞추고 Flexbox를 적용하여, 데이터 양에 관계없이 하단 가로 스크롤바가 브라우저 하단에 항상 고정되어 보이도록 개선했습니다.
- **독립 스크롤 시스템**: 페이지 전체 스크롤을 막고 표 내부(`.tableScroll`)에서만 스크롤이 발생하도록 구조를 변경하여 데이터 탐색 편의성을 극대화했습니다.
- **현황판(Dashboard) 호환성 확보**: 상황판 뷰에서도 높이 제한 내에서 정상적으로 스크롤되도록 `flex: 1` 및 `overflow-y: auto`를 적용했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/branches/asan/dispatch.module.css`: `.container`, `.tableWrap`, `.tableScroll`에 Flexbox 및 `100vh` 기반 동적 높이 로직 적용.
- `web/app/(main)/employees/branches/asan/dashboard.module.css`: `.dashboard`에 `flex: 1`, `min-height: 0`, `overflow-y: auto` 추가.

## [2026-05-11] 아산 종합상황판 모바일 UI 최적화 — 메뉴 정렬 및 차트 여백 축소 (v5.12.5)
### 🚀 Achievement
- **모바일 메뉴바 단정화**: 현황판/배차판 및 통합현황/글로비스/모비스 버튼군이 모바일 화면에서 줄바꿈 없이 균등하게 배치(`flex: 1`)되도록 CSS를 수정하여 시각적 완성도를 높였습니다.
- **날짜 뱃지 재배치**: 공간을 많이 차지하던 날짜 뱃지를 모바일에서 하단 중앙 전역 배치로 변경하여 가독성을 개선했습니다.
- **차트 카드 여백 축소**: 화주(고객사) 점유율 파이 차트 모듈의 내부 패딩(`14px` -> `8px`)과 대시보드 래퍼 패딩(`8px` -> `4px`)을 축소하여 모바일 화면 활용도를 극대화했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/branches/asan/dispatch.module.css`: `@media (max-width: 768px)` 내 `.viewSwitch`, `.viewBtn`, `.funcBtn`, `.headerBadge` 스타일 최적화.
- `web/app/(main)/employees/branches/asan/dashboard.module.css`: 모바일 환경에서의 `.dashboard` 패딩 및 `.pieCard` 내부 여백 축소.

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
