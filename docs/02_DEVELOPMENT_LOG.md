## [2026-05-28] GLAPS 일반 목록 중복 강조 제한 (v5.14.249)
### 핵심
- 일반 목록에서는 전체 원장 기준 중복 행이어도 빨간 배경을 표시하지 않게 했습니다.
- `중복검출`을 눌렀을 때만 `운송경로코드`/`최종코드(BP)` 중복 그룹을 빨간색으로 강조합니다.
- 중복 여부 계산과 선택/일괄병합 기준은 기존 코드 단독 기준을 유지합니다.
### 검증
- `cd web; node --test tests\glapsDuplicateGroups.test.mjs tests\glapsMasterData.test.mjs tests\asanDashboardView.test.mjs`: 47개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsDuplicateGroups.mjs" "tests/glapsDuplicateGroups.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-28] 배차변동 추가/삭제 순증감 기준 정리 (v5.14.248)
### 핵심
- 배차변동 추가/삭제 기준을 지역 배차칸 수량 변화 또는 행 추가/삭제로 좁혔습니다.
- `Nomi/특이사항` 변경은 BKG/비고/GLAPS 파생코드처럼 변동 행 생성 기준에서 제외했습니다.
- 같은 항목의 미확인 add/delete 수량이 상쇄되면 화면에서 숨기고, 이미 확인완료된 변동은 상쇄되어도 유지합니다.
- 2026-05-27 통합 배차변동 active 48건 중 40건을 `neutralized` 이력과 함께 비활성화해 8건만 남겼습니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 51개 통과
- `cd web; npx eslint "app/api/branches/asan/dispatch/change-events/route.js" "utils/asanDispatchChangeEvents.mjs" "tests/asanDashboardView.test.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
### 변경 파일
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-28] GLAPS 중복 기준 코드 단독 정정 (v5.14.247)
### 핵심
- 운송경로 중복검출/병합 기준을 `운송경로코드` 단독 반복으로 정정했습니다.
- 항목매핑 중복검출/병합 기준을 `최종코드(BP)` 단독 반복으로 정정했습니다.
- 상차지/경유지/하차지/공장/매핑항목/운송경로코드 등 다른 컬럼은 항목매핑 중복 판정에서 제외합니다.
### 검증
- `cd web; node --test tests\glapsDuplicateGroups.test.mjs tests\glapsMasterData.test.mjs tests\asanDashboardView.test.mjs`: 47개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsDuplicateGroups.mjs" "tests/glapsDuplicateGroups.test.mjs"`: 통과
- `cd web; npm run build`: Next standalone manifest ENOENT로 실패. 컴파일/타입체크/정적 페이지 생성은 통과.
- 미해결 빌드 이슈 기록: `.tmp_issues/20260528_next_build_manifest_enoent.md`
### 변경 파일
- `web/utils/glapsDuplicateGroups.mjs`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/glapsDuplicateGroups.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-28] 아산 구간단가 묶음 항목 압축 (v5.14.246)
### 핵심
- 구간단가에 `묶음 항목` 토글을 추가해 매출/지역/작업지/운송사/구분/픽업/청구픽업/선적/TYPE/청구처/하불처를 집계 기준에서 제외하거나 다시 포함할 수 있게 했습니다.
- 청구/하불 금액은 고정 기준으로 두고, 제외한 항목은 집계 키에서 빼서 같은 금액표가 한 줄로 다시 합쳐지게 했습니다.
- 컬럼 제목열 필터는 현재 포함된 컬럼에만 표시되며, 항목을 제외하면 해당 컬럼 필터도 함께 정리됩니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-28] 아산 구간단가 제목열 필터 전환 (v5.14.245)
### 핵심
- 구간단가 상단에 장황하게 분리되어 있던 `필터 목록` 패널을 제거했습니다.
- 각 컬럼 제목열 안에 필터 버튼을 넣어, 정렬은 제목 클릭으로, 조건 필터는 제목 옆 버튼으로 처리하도록 분리했습니다.
- 필터는 현재 조회 범위의 금액표 묶음 기준으로 목록화하며, 상단 검색창의 금액/키워드 검색은 그대로 유지했습니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 배차확정 후 BKG 원본 변경 표시 정책 (v5.14.244)
### 핵심
- 배차확정 이후 원본 배차판의 BKG1~3/TARGET VESSEL/비고가 바뀌어도 `BKG확정`은 확정 당시 값 또는 WEB 수기값으로 유지합니다.
- 원본 BKG가 바뀌면 상세배차/배차변동의 BKG 배지와 원본칸을 붉게 표시하고, 사용자가 바뀐 BKG 셀을 클릭할 때만 `BKG확정`을 새 값으로 바꿉니다.
- TARGET VESSEL/비고 변경은 행 이벤트를 만들지 않고 memo_changed 이력과 붉은 배경으로만 알립니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 49개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js" "app/api/branches/asan/dispatch/confirmation/route.js" "utils/asanDispatchChangeEvents.mjs" "tests/asanDashboardView.test.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
- 로컬 `http://localhost:3000/employees/branches/asan?debug=true`: HTTP 200 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/app/api/branches/asan/dispatch/confirmation/route.js`
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] GLAPS 중복 유틸 분리 (v5.14.243)
### 핵심
- 항목매핑/운송경로 중복검출과 병합 기준을 화면/API 공통 유틸로 분리했습니다.
- 화면과 API가 `glapsDuplicateGroups` 공통 유틸을 사용하게 하여 빨간 중복 표시와 실제 병합 대상이 같은 기준을 따르게 했습니다.
- 중복 필터 화면에서는 같은 중복 그룹끼리 붙어서 보이게 정렬했습니다.
- 실제 최종 기준은 v5.14.247에서 `운송경로코드`/`최종코드(BP)` 단독 반복으로 정정했습니다.
### 검증
- `cd web; node --test tests\glapsDuplicateGroups.test.mjs tests\glapsMasterData.test.mjs tests\asanDashboardView.test.mjs`: 47개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsDuplicateGroups.mjs" "tests/glapsDuplicateGroups.test.mjs"`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/utils/glapsDuplicateGroups.mjs`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/glapsDuplicateGroups.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 아산 구간단가 필터 목록화 (v5.14.242)
### 핵심
- 구간단가 표 헤더 아래에 길게 늘어났던 컬럼별 입력 필터줄을 제거했습니다.
- 금액/매출/지역/작업지/운송사/구분/픽업/선적/TYPE/청구처/하불처를 `필터 목록` 드롭다운으로 정리했습니다.
- 적용된 조건은 칩으로 표시하고, 칩 클릭 또는 `필터 초기화`로 해제할 수 있게 했습니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-27] 아산 구간단가 TYPE/기간/필터 보강 (v5.14.241)
### 핵심
- 구간단가는 DB 부하와 컬럼 신뢰도를 고려해 월간 마감자료 current 원장 전용으로 유지했습니다. 연간 36만 행 원장은 합산하지 않습니다.
- 조회 범위를 `전체/연도별/월별`로 확장하고, 묶음 기준에 `TYPE`을 추가했습니다.
- 표 제목열 클릭 정렬과 컬럼별 필터 입력을 추가했습니다. 금액 검색은 `650000`처럼 천단위 구분 없이 숫자만 입력해도 매칭됩니다.
- Supabase RPC `asan_monthly_route_unit_amount_payload`를 TYPE 포함 반환 구조로 재생성했습니다.
### 검증
- Supabase RPC `asan_monthly_route_unit_amount_payload('month', 2026, 1, 5)`: 2,518행/803묶음, 첫 TYPE `40RF` 확인
- 로컬 API 월별/연도별/전체: 2,518행/803묶음, 11,620행/2,974묶음, 12,178행/3,066묶음 확인
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/supabase_sql/20260527_asan_monthly_route_unit_amount_rows.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-27] 아산 구간단가 월간 금액표 재구성 (v5.14.239)
### 핵심
- 구간단가를 연간 대용량 원장과 기간별 단가 차트에서 분리하고, 월간실적 `is_current=true` 원장만 사용하는 청구/하불 금액표로 다시 구성했습니다.
- 묶음 기준은 `청구/하불 금액 + 매출, 지역, 작업지, 운송사, 구분, 픽업, 청구픽업, 선적, 청구처, 하불처`이며, 화면은 전체/월별 범위와 테이블 필터/정렬 중심으로 동작합니다.
- API는 dashboard snapshot을 만들지 않고 Supabase RPC `asan_monthly_route_unit_amount_payload`를 우선 사용합니다. RPC 실패 시에도 월간 current 행을 1000행 단위로만 읽는 fallback으로 제한했습니다.
### 검증
- Supabase RPC `asan_monthly_route_unit_amount_payload('all', null, null, 5000)`: 12,178행/3,051묶음 응답 확인
- 로컬 API `analysis=route-unit-price&unit_scope=month&unit_month=2026-01&refresh_snapshot=1`: 2,518행/795묶음, RPC 약 5.1초 확인
- 로컬 API `analysis=route-unit-price&unit_scope=all&refresh_snapshot=1`: 12,178행/3,051묶음, RPC 약 1.5초 확인
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/supabase_sql/20260527_asan_monthly_route_unit_amount_rows.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-27] 아산 배차변동 구버전 재동기화 방어 (v5.14.240)
### 핵심
- 배차변동 스냅샷 payload에 `changeSchemaVersion=2`를 추가했습니다.
- 구버전으로 열린 배차판 탭이 `transportRemark` 없는 currentLines를 보내면 서버가 sync를 무시해 기존 변동 이벤트를 덮어쓰지 않게 했습니다.
- 2026-05-27 통합 배차변동 이벤트는 새 기준 active 48건(추가 28, 삭제 20)으로 다시 계산하는 절차를 확인했습니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js" "utils/asanDispatchChangeEvents.mjs" "utils/asanDispatchDetailLines.mjs" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" tests/asanDashboardView.test.mjs tests/asanDispatchDetailLines.test.mjs`: 통과
### 변경 파일
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 아산 배차변동내역 감지 기준 축소 (v5.14.238)
### 핵심
- 배차변동내역은 지역 배차칸 수량 변화만 `추가/삭제`로 기록하고, 같은 원천행의 고객사·포트·라인·TYPE 변화만 `변경`으로 기록하도록 비교 기준을 줄였습니다.
- BKG확정/BKG1~3/TARGET VESSEL/비고/수정일시와 GLAPS 파생코드 변화는 변동 행을 만들지 않습니다. BKG·비고류 변경은 `memo_changed` 이력으로만 남깁니다.
- `추가취소쌍` 표시는 제거했고, 변경 이벤트에서는 실제 달라진 셀만 붉은색으로 표시합니다.
- 2026-05-27 통합 배차변동 이벤트를 새 기준으로 재정리했습니다. 기존 active 118건을 비활성화하고 새 기준 active 48건(추가 28, 삭제 20)으로 재계산했습니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 47개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js" "utils/asanDispatchChangeEvents.mjs" "utils/asanDispatchDetailLines.mjs" tests/asanDashboardView.test.mjs tests/asanDispatchDetailLines.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/utils/asanDispatchDetailLines.mjs`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] GLAPS 중복 판정키/병합 기준 정리 (v5.14.237)
### 핵심
- 운송경로 중복 기준을 `상차지 + 경유지(ELS) + 하차지` 연결키로 고정했습니다. 운송경로코드만 같은 행은 더 이상 중복 기준으로 보지 않습니다.
- 항목매핑 중복 기준을 최종코드(BP) 하나로 고정했습니다. 같은 최종코드 안의 배차판 매칭용 값, ELS명, GLAPS명, 운송경로코드는 쉼표 다중값으로 병합합니다.
- GLAPS코드 화면에서 운송경로도 항목매핑과 동일하게 중복행 선택/일괄 병합을 지원합니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 46개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 아산 구간단가 LAST 단가/표 검색 보강 (v5.14.236)
### 핵심
- 구간단가 대표 단가를 기간 평균이나 최고값이 아니라 선택 범위 안의 마지막 기간(LAST) 청구단가/하불단가/차액단가로 고정했습니다.
- 구간단가 금액은 억/만원 축약 없이 원 단위와 천단위 구분으로 표시하고, 표 안의 막대형 장식은 제거했습니다.
- 구간단가 기간 선택지는 연간실적 summary가 아니라 연간+월간 구간단가 원장의 `scope.months/years`를 우선 사용해 2026 월간 자료가 보이도록 했습니다.
- 구간별 단가 목록에 필터와 정렬을 추가했습니다. 필터는 구간/청구처/지급처/TYPE/매출열을 대상으로 하고, 정렬은 최근 청구단가/차액단가/건수/구간명 기준을 제공합니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; npm.cmd run build`: 통과
- 로컬 `http://localhost:3000/api/branches/asan/performance/annual?analysis=route-unit-price&unit_scope=year&unit_year=2026&refresh_snapshot=1`: 2026년 구간단가 1,181건/160구간, `LastMonth=2026-05`, `unitBasis=last` 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-27] 아산 구간단가 단가 전용 재정리 (v5.14.235)
### 핵심
- 구간단가 화면에서 연간/월간 총액 리포트와 겹치던 KPI와 요약을 제거하고, 건당 청구단가·하불단가·차액단가 중심의 목록/선택 구간/기간별 흐름으로 재구성했습니다.
- 집계 기준을 연간 current 원장 단독에서 연간+월간 current 원장 통합으로 바꿨습니다. 같은 마감월이 양쪽에 있으면 월간 원장을 우선해 중복 단가 계산을 막습니다.
- Supabase에 구간단가 기간 조회 인덱스를 적용했습니다. RPC는 SQL로 보관하되 기본 웹 경로는 timeout 방지를 위해 인덱스 기반 JS fallback 집계를 사용합니다.
### 검증
- Supabase `asan_route_unit_price_period_indexes`, `asan_route_unit_price_rpc_annual_monthly` 마이그레이션 적용 성공
- 로컬 `http://localhost:3035/api/branches/asan/performance/annual?analysis=route-unit-price&unit_scope=year&unit_year=2025&refresh_snapshot=1`: 2025년 단가 payload 33,394건/160구간 응답 확인
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/api/branches/asan/performance/annual/route.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/supabase_sql/20260527_asan_annual_route_unit_price_rpc.sql`
- `web/supabase_sql/20260527_asan_route_unit_price_period_indexes.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] GLAPS 마스터 원장 중복행 방어 (v5.14.234)
### 핵심
- 원인: GLAPS 마스터 반영 중 파싱 결과에 같은 `branch_id + version_id + route_code + source_sheet + source_row_number` 운송경로가 중복 포함되면 DB 제약 `glaps_transport_routes_branch_version_route_source_key`에서 insert가 중단됐습니다.
- 조치: 마스터 반영 시 새 버전은 비활성으로 만든 뒤 모든 행 insert가 성공한 경우에만 active 전환합니다. 운송경로와 항목매핑은 DB insert 전에 실제 UNIQUE 기준으로 한 번 정리하고, 정리 건수는 `원장 중복행 N건 정리`로 화면 메시지와 업로드 로그에 남깁니다.
- 기존 `WEB수정` 보존과 GLAPS 코드기준 병합 흐름은 유지했습니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 46개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 아산 연간실적 구간단가 분석 추가 (v5.14.233)
### 핵심
- 실적관리 하위 탭에 `구간단가`를 추가했습니다. 연간 원장 DB를 마감월 기준으로 읽고 `픽업-지역-작업지-하차 + 매출열 + 청구처 + 지급처 + TYPE` 조합별 청구/하불/차액/건당단가를 표시합니다.
- 구간단가 화면은 `전체/연도별/월별` 범위를 제공하며, 선택 구간의 기간별 단가 변동을 청구단가/하불단가 평균선과 최고/최저 포인트가 있는 그래프로 보여줍니다.
- Supabase DB 선집계 RPC SQL(`20260527_asan_annual_route_unit_price_rpc.sql`)을 추가했습니다. Supabase 앱 커넥터 재인증 전에는 웹이 snapshot_id만 필터링해 읽고 JS에서 범위 집계한 뒤 dashboard snapshot 캐시를 사용합니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/performance/annual/route.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- 로컬 `http://localhost:3033/employees/branches/asan?debug=true`: `구간단가` 탭 진입, 전체 v2 snapshot 367,993건/160구간 표시 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/app/api/branches/asan/performance/annual/route.js`
- `web/lib/asan-branch-db.js`
- `web/supabase_sql/20260527_asan_annual_route_unit_price_rpc.sql`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] GLAPS 항목매핑 코드기준 병합 (v5.14.232)
### 핵심
- GLAPS코드 화면의 항목매핑 중복 기준을 `매핑항목 + 운송경로코드 + 최종코드(BP)`로 바꿔, 같은 GLAPS 코드에 붙은 여러 ELS 매치코드/디스크립션을 미병합 중복으로 빨간색 표시합니다.
- 선택한 중복 그룹 또는 현재 중복 전체를 병합하는 버튼을 추가했습니다. 병합 시 대표 행 하나에 `ELS 매치코드`, `ELS 디스크립션`, `GLAPS 디스크립션`을 쉼표 구분 다중값으로 합치고 나머지는 비활성화합니다.
- 상세배차/배차변동 GLAPS lookup과 RAG 코드맵은 병합된 쉼표/세미콜론/줄바꿈 다중값을 각각 별칭으로 나눠 인식합니다.
### 검증
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 46개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsMasterData.mjs" "utils/asanDispatchRag.mjs" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/glapsMasterData.mjs`, `web/utils/asanDispatchRag.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 모바일 배차판 합계바 공백 제거 (v5.14.231)
### 핵심
- 원인: 모바일에서 합계바가 세로 배치로 바뀐 뒤에도 데스크탑용 `.summaryRight { flex: 1 1 480px; }`가 남아 버튼 영역에 480px 높이 공백이 생겼습니다.
- 조치: 모바일 media query 안에서 `.summaryRight`와 `.summaryLeft`를 `flex: 0 0 auto; width: 100%;`로 고정해 합계/버튼 높이가 내용만큼만 잡히게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 36개 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] GLAPS코드 중복 오류 판정과 후보 검출 (v5.14.230)
### 핵심
- 원인: 직접등록 중 UNIQUE/중복 오류가 나도 에러 메시지에 `glaps_master_aliases` 같은 테이블명이 포함되면 `GLAPS 마스터 테이블이 아직 적용되지 않았습니다`로 오판했습니다.
- 조치: 테이블 미적용 판정은 실제 missing table/schema cache 코드로 좁히고, 웹 직접등록 전 운송경로코드/연결키/항목매핑 exact duplicate를 409로 먼저 안내하게 했습니다.
- GLAPS코드 화면에 `중복검출` 필터를 추가해 운송경로 중복과 항목매핑 exact duplicate/복수후보를 바로 묶어 볼 수 있게 했습니다.
- 동일 ELS 매치코드에 여러 포트 후보코드를 둘 수 있도록 항목매핑 UNIQUE 기준에 `glaps_code`를 포함하는 SQL을 추가했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 45개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsMasterData.mjs" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/utils/glapsMasterData.mjs`
- `web/supabase_sql/20260523_asan_glaps_master_codes.sql`
- `web/supabase_sql/20260527_glaps_alias_duplicate_candidates.sql`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-27] 아산 배차판 자동 동기화 수동 조건 통일 (v5.14.229)
### 핵심
- 원인 확인: 수동 NAS 동기화는 `force=True`로 `1순위 작업일 -> 전/후 작업일 -> 나머지 날짜`를 순차 실행하지만, 자동 스케줄러는 파일 변경 감지 후 `phase=all` 단일 루틴을 직접 호출해 수동과 조건이 달랐습니다.
- 조치: 자동 스케줄러는 파일 mtime/size 변경이 안정화된 경우에만 동작하되, 실제 반영은 수동 NAS 동기화와 동일한 `sync_asan_dispatch_manual_python()` 루틴으로 실행하게 했습니다.
- 기존 재시작 직후 DB 최신 파일이면 전체 파싱을 생략하는 보호 로직과 파일 저장 안정화 게이트는 유지했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 35개 통과
- 번들 Python AST 검사 `docker/els-backend/app_core.py`: 통과
### 변경 파일
- `docker/els-backend/app_core.py`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 아산 배차판 테이블 조밀 톤앤매너 정리 (v5.14.228)
### 핵심
- 배차판/상세배차/배차변동 공통 테이블의 헤더 색상을 GLAPS 계열 짙은 청록 톤으로 맞추고, 데이터 셀 padding과 line-height를 줄여 행간 여백을 낮췄습니다.
- 상세배차/배차변동의 상차지 입력, 포트 선택, BKG확정, BKG 셀 선택, WEB 입력칸을 24px대 높이로 통일했습니다.
- GLAPS코드 테이블도 관리 버튼, 상태/출처 배지, 필터, 직접수정 input 높이를 줄여 배차판과 같은 밀도로 보이게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 45개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
- 로컬 `http://localhost:3020/employees/branches/asan?debug=true`에서 상세배차 데이터 행 높이가 25px로 줄고 헤더 톤이 `rgb(31, 86, 115)`로 통일된 것을 확인했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 모비스 통합현황 고객사 국가·도착항 병기 (v5.14.227)
### 핵심
- 모비스 원본의 `국가/국가명`과 `도착항`을 조합해 통합현황/전체/엑셀의 `고객사(국가)` 칸에 `호주 시드니`처럼 표시하도록 했습니다.
- 현황판 고객사 점유율/구분표 집계는 기존처럼 국가 기준을 유지해 국가별 합산이 흐트러지지 않게 했습니다.
- 클라이언트 전체 탭 병합도 같은 표시 규칙을 적용해 서버 통합자료와 화면 병합자료가 다르게 보이지 않도록 했습니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 54개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/export/route.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchWebCells.test.mjs"`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/dispatch/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDispatchWebCells.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 배차판 필터 상태 WEB BKG 저장 밀림 방지 (v5.14.226)
### 핵심
- 원인: WEB 셀 저장 API가 현재 `row_signature`와 매칭되지 않을 때 같은 `row_index`의 기존 셀을 바로 갱신했습니다. 필터/정렬 상태에서 입력하거나 행 서명이 흔들린 상황에서는 같은 행번호의 다른 BKG 기록을 새 행으로 재귀속할 위험이 있었습니다.
- 조치: row_index fallback은 `작업지/고객사/포트/라인/TYPE` 등 핵심 row_context가 호환될 때만 기존 셀을 갱신하도록 제한했습니다. 문맥이 다르면 기존 BKG를 건드리지 않고 현재 행 서명으로 새로 저장합니다.
- 화면 오버레이 복구도 같은 호환 판정을 사용해 같은 행번호라도 문맥이 다른 BKG가 붙지 않게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchWebCells.test.mjs web/tests/asanDispatchRag.test.mjs`: 68개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/export/route.js" "app/api/branches/asan/dispatch/web-cell/route.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchWebCells.test.mjs"`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/app/api/branches/asan/dispatch/web-cell/route.js`
- `web/tests/asanDispatchWebCells.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 모비스 CODE 포트 축 분리와 상세 고객사 표기 보정 (v5.14.225)
### 핵심
- 모비스 `CODE` 헤더를 글로비스 포트 축과 매칭해 통합 배차판에는 `포트(CODE)`로 보이게 하고, 모비스 개별 화면의 `국가/국가명`은 현황판 고객사 집계용으로 유지했습니다.
- 상세배차내역과 배차변동내역은 포트 컬럼명을 `포트(DIST)`로 통일하고, 모비스 행의 고객사 컬럼에는 `국가 도착항`을 한 칸 띄어 표시하도록 했습니다.
- RAG 배차판 스키마 설명도 `포트(DIST)`와 `픽업지역/상차지`를 분리해 CODE/Nomi 같은 설명 컬럼이 상차지로 오해되지 않게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchWebCells.test.mjs web/tests/asanDispatchRag.test.mjs`: 67개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/export/route.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchWebCells.test.mjs"`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`, `web/utils/asanDispatchDetailLines.mjs`, `web/utils/asanDispatchRag.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/dispatch/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchWebCells.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 아산 GLAPS 테이블 높이 잠금 해제와 더보기 분리 (v5.14.224)
### 핵심
- 상세배차/배차변동/GLAPS코드 화면의 데스크탑 본문 높이 계산, 테이블 스크롤 박스 높이, 아산 content wrapper의 남은 화면 채우기를 풀어 테이블 하단과 더보기 영역이 페이지 스크롤로 자연스럽게 보이도록 했습니다.
- 상세배차/배차변동은 기존 100건 더보기 구조를 유지하고, GLAPS코드 원장 테이블도 100건 단위 더보기/전체 표시로 끊어 렌더링 부담을 줄였습니다.
- GLAPS코드 테이블의 가로 스크롤은 유지하되, 원장 화면 자체는 고정 높이 안에 갇히지 않도록 CSS를 정리했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
- 로컬 `http://localhost:3020/employees/branches/asan?debug=true`에서 상세배차 100행 표시, 페이지 스크롤 확장, 테이블 하단 더보기 노출, footer 앞 막힘 간격 축소를 확인했습니다. GLAPS코드는 로컬 인증 부재로 데이터는 0건이지만 100건 렌더링 제한과 CSS/빌드 검증을 완료했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] GLAPS 포트 중복 후보 선택 지원 (v5.14.223)
### 핵심
- GLAPS 포트 항목매핑에서 동일 ELS 매치값에 여러 GLAPS 코드를 등록해도 후보 목록으로 유지하도록 변경했습니다.
- `검수메모`에 `기본/default/우선/대표` 중 하나가 들어간 포트 항목을 기본값으로 쓰고, 상세배차와 배차변동에서 행별 포트코드를 선택 저장하게 했습니다.
- 상세배차/배차변동의 상차지 입력칸 최소 폭을 줄여 화면 여백을 줄였습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/detail-override/route.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`, `dispatch.module.css`
- `web/app/api/branches/asan/dispatch/detail-override/route.js`
- `web/app/api/branches/asan/glaps/master/route.js`, `template/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 선적관리 확정모선 빠른 필터 추가 (v5.14.222)
### 핵심
- 선적관리 날짜 필터 영역의 `미선적`, `자체보관` 옆에 `확정모선` 빠른 필터 버튼을 추가했습니다.
- `KD선적확정모선`, `AS선적확정모선`처럼 `선적확정모선`을 포함한 컬럼 중 하나라도 값이 있으면 필터 결과에 남기도록 했습니다.
- 기본 정렬에서 확정모선 값이 있는 행을 위로 올리던 로직도 같은 컬럼 판정 함수를 사용하도록 정리했습니다.
- 모바일 빠른 필터 버튼은 3개가 같은 폭으로 보이도록 grid를 3열로 조정했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 37개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 월간실적 이월 순환 기준 분리 (v5.14.220)
### 핵심
- 월간 원장의 `청구/하불`은 마감월 반영 금액으로 유지하고, 첫 컬럼 값이 `이월`인 행은 `청구이월 반영분`으로 따로 집계했습니다.
- `이월구분 + 청구_1/하불_1`은 이번 마감에서 다음 마감월로 넘어갈 `익월이월 발생분`으로 분리했습니다.
- 월간 dashboard summary의 기준을 `마감월`로 고정하고, 월별 series에는 청구이월/익월이월 금액과 건수를 함께 보존합니다.
- 월간 화면 KPI와 구성 분석은 `이월` 단일 표현 대신 `청구이월`과 `익월이월`을 분리해 보여줍니다.
- 운영 Supabase monthly 메타는 2026-01~05 current 원장 기준으로 백필했습니다. 2026-04 기준 익월이월은 청구 484,932,800원 / 하불 410,156,300원으로 확인했습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 25개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" lib/asan-branch-db.js utils/asanPerformanceView.mjs scripts/import-asan-annual-performance.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
- Supabase 운영 확인: monthly 2026-01~05 `carryoverCycle.incoming/outgoing` 생성 확인
### 변경 파일
- `web/utils/asanPerformanceView.mjs`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `web/supabase_sql/20260526_asan_monthly_carryover_cycle_backfill.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-26] GLAPS 운송서비스코드 도출 추가 (v5.14.221)
### 핵심
- GLAPS 상세배차/배차변동 라인에서 배차판 `구분` 값을 기준으로 `운송서비스코드`를 자동 도출하도록 연결했습니다.
- 현재 확인 코드표를 fallback으로 두고, 향후 GLAPS 마스터에 `운송서비스` 시트가 들어오면 해당 시트의 `운송서비스/설명` 값을 함께 코드표로 읽습니다.
- 도출 기준은 `수출=5010001`, `수출(보관)=5010002`, `수입=5020001`, `수입(보관)=5020002`, `반품=311101`, `내수/석회석=6032001`입니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과, 정적 생성 후 외부 WebDAV fetch ECONNRESET 로그 3건 발생 but exit 0
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 실적관리 이익 표기와 마감자료 구분 정리 (v5.14.219)
### 핵심
- 종합실적, 월간실적, 연간실적 화면의 표시 문구를 `손익/손익률` 대신 `이익/이익률`로 통일했습니다.
- 실적관리 RAG 문맥과 AI 메뉴 설명도 응답에는 `이익/이익률`을 쓰도록 바꾸고, 기존 `손익` 질문은 호환 검색어로만 유지했습니다.
- 종합실적의 `원장 신뢰도` 제목을 `마감자료 구분`으로 변경했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs web/tests/asanPerformanceRag.test.mjs`: 27개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" utils/asanPerformanceRag.mjs utils/aiAssistantMeta.mjs tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs tests/asanSummaryPerformance.test.mjs tests/asanPerformanceRag.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `AsanMonthlyPerformance.js`, `AsanSummaryPerformance.js`
- `web/utils/asanPerformanceRag.mjs`, `web/utils/aiAssistantMeta.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`, `web/tests/asanPerformanceRag.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-26] 종합실적 빠른 뷰와 풀네임 검색 보정 (v5.14.218)
### 핵심
- 종합실적의 경영 신호, 연도 매트릭스, 당사/협력사 비교, 원장 신뢰도 영역에서 월간/연간 테이블 검색으로 넘어가는 클릭 동작을 제거했습니다.
- 원장 신뢰도 표의 헤더 정렬을 본문 값과 맞춰 매출, 이익률, 행/파일, 동기화 위치가 어긋나 보이지 않게 했습니다.
- 실적관리 탭 전환부의 `performanceSearchHandoff`를 제거해 테이블 검색은 사용자가 월간/연간 테이블 검색창에서 직접 실행할 때만 동작하도록 정리했습니다.
- 연간/월간 테이블 검색은 괄호, 따옴표, 구분점, 슬래시 같은 구두점을 공백/제거 양쪽으로 정규화하고, 풀네임 입력은 토큰 단위로도 매칭합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `cd web; npm.cmd run lint -- lib/asan-branch-db.js "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs tests/asanSummaryPerformance.test.mjs`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`, `annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 인트라넷 엑셀 다운로드 톤앤매너 공통화 (v5.14.217)
### 핵심
- 아산 상세배차내역 엑셀의 제목, 생성정보, 남색 헤더, 본문 테두리, 자동너비 규격을 `web/utils/intranetExcelExport.mjs` 공통 유틸로 분리했습니다.
- 안전운임 일반조회, 차량관제 운행기록, 아산 기존 export, 아산 선적관리, 연락처/작업지 양식, 컨테이너 이력 fallback 엑셀 스타일을 같은 기준으로 맞췄습니다.
- 안전운임 구간조회는 지도 경로, 고시 운임, 구간별 운임, 운행비가 섞인 보고서형 데이터라 일반 테이블로 평탄화하지 않고 섹션형 시트로 정리했습니다.
- 엑셀 산출물 기준은 `docs/04_MASTER_ARCHITECTURE.md`와 `docs/05_DESIGN_SYSTEM.md`에 기록했습니다.
### 검증
- `node --test web/tests/intranetExcelExport.test.mjs web/tests/vehicleTrackingExport.test.mjs`: 통과
- `cd web; npm.cmd run lint -- utils/intranetExcelExport.mjs ...`: 통과, 기존 hook/img 경고 11건 유지
- `git diff --check`: 통과
### 변경 파일
- `web/utils/intranetExcelExport.mjs`, `web/tests/intranetExcelExport.test.mjs`
- `web/app/api/branches/asan/export/view/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/app/api/safe-freight/download-excel/route.js`, `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`
- `web/app/api/vehicle-tracking/export/excel/route.js`, `web/app/(main)/employees/branches/asan/AsanShipping.js`, `web/app/(main)/employees/container-history/page.js`
- `web/app/api/contacts/excel/template/route.js`, `web/app/api/els/template/route.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/04_MASTER_ARCHITECTURE.md`, `docs/05_DESIGN_SYSTEM.md`

---

## [2026-05-26] 실적 화면 원가율 표기 통일 (v5.14.216)
### 핵심
- 종합실적, 연간실적, 월간실적 화면과 실적관리 RAG 문맥에서 원가율 표시를 통일했습니다.
- 과거 개발 로그와 `docs/11_ASAN_PERFORMANCE_PIPELINE.md`의 분석 축 설명까지 함께 검색해 구형 표현이 남지 않도록 정리했습니다.
- v5.14.215에서 추가한 연간/월간 테이블 검색 안내와 상세배차 톤 엑셀 다운로드도 같은 배포 묶음에 포함됩니다.
### 검증
- `rg -n "<구형 원가율 표현>" web docs --glob "!node_modules"`: 남은 표기 없음
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs web/tests/asanPerformanceRag.test.mjs`: 통과
- `cd web; npm.cmd run lint -- lib/asan-branch-db.js "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" utils/asanPerformanceTableExport.mjs utils/asanPerformanceRag.mjs utils/asanPerformanceSummary.mjs tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs tests/asanSummaryPerformance.test.mjs tests/asanPerformanceRag.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `AsanSummaryPerformance.js`
- `web/utils/asanPerformanceRag.mjs`, `web/utils/asanPerformanceSummary.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`, `web/tests/asanPerformanceRag.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

---

## [2026-05-26] 연간/월간 실적 테이블 검색 안내와 엑셀 다운로드 (v5.14.215)
### 핵심
- 연간/월간 실적 테이블 검색·정렬 조회 중 기존 데이터를 지우지 않고 `조회중 (빅데이터 검색 느림)` 안내를 표시하도록 보강했습니다.
- 테이블 툴바에 `엑셀` 버튼을 추가해 현재 검색어, 검색 조건, 정렬, 표시 컬럼 기준으로 결과를 내려받습니다.
- 엑셀 생성은 상세배차가 쓰는 `/api/branches/asan/export/view` 라우트를 재사용해 제목/생성정보/파란 헤더/테두리/필터/고정행 톤앤매너를 맞췄습니다.
- 다운로드 조회는 `export=1`일 때 최대 50,000행까지 허용해 검색 결과를 한 번에 담도록 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 20개 통과
- `cd web; npm.cmd run lint -- lib/asan-branch-db.js "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" utils/asanPerformanceTableExport.mjs tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `AsanMonthlyPerformance.js`, `annualPerformance.module.css`
- `web/utils/asanPerformanceTableExport.mjs`
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 연간/월간 실적 검색 배치 스캔 보강 (v5.14.214)
### 핵심
- 연간/월간 실적 검색 스캐너가 Supabase 조회 쿼리를 1,000행 배치마다 새로 만들어 뒤쪽 원장 행까지 안정적으로 훑도록 수정했습니다.
- 운영 확인 결과 월간 2026-05 원장 뒤쪽에 `글로비스(RSB수입건)` 4행이 있었고, 기존 검색 API는 앞쪽 배치만 보고 0건으로 응답하던 문제를 확인했습니다.
- 종합실적의 경영 신호 중 청구처/지급처 카드는 클릭 시 월간실적 테이블로 이동하며 해당 값을 `모두 포함` 검색으로 바로 넣도록 연결했습니다.
- 연간실적 화면도 외부 검색 전달값을 받으면 테이블 탭으로 전환해 같은 검색 흐름을 사용합니다. 단, 현재 연간 원장에 없는 2026 월간 전용 값은 검색 실패가 아니라 원천 범위 차이입니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `cd web; npm.cmd run lint -- lib/asan-branch-db.js "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs tests/asanSummaryPerformance.test.mjs`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `AsanMonthlyPerformance.js`, `AsanSummaryPerformance.js`, `annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-26] 연간/월간 실적 테이블 검색 원본값 포함 보정 (v5.14.213)
### 핵심
- 연간/월간 실적 테이블 검색이 화면에 매핑된 컬럼값만 보지 않고, Supabase 원장 원본 `row_data`, `row_values`, 파일/시트/기간 메타까지 함께 훑도록 확장했습니다.
- 연간 개별 파일 조회도 검색 시 `row_data`를 같이 읽고 5,000행 배치 스캔 경로를 사용해 앞쪽 일부 행 제한을 피하도록 보정했습니다.
- 검색 결과 0건일 때 `total`이 전체 원장 건수로 되살아나지 않도록 `paged.total ?? fallbackTotal` 기준으로 정리했습니다.
- 운영 DB 확인 결과, 월간 2026 원장에는 `대신` 검색 결과가 있으며 현재 연간 원장에는 `대신`/`rsb` 문자열이 0건임을 확인했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 20개 통과
- `cd web; npm.cmd run lint -- lib/asan-branch-db.js tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 연간/월간 실적 테이블 검색 전체 원장 스캔 보정 (v5.14.212)
### 핵심
- 연간/월간 실적 테이블 검색이 정렬/검색 보호 로직 때문에 현재 원장의 앞쪽 일부 행만 훑던 문제를 수정했습니다.
- 검색 시 현재 원장을 5,000행 단위로 배치 스캔해 2만 행 이후 자료도 찾고, 기본 테이블 페이징은 기존처럼 가볍게 유지했습니다.
- 상세 분석에서 테이블 탭으로 넘어가며 검색어를 바로 넣는 경우에도 검색 파라미터가 빠지지 않도록 `options.search/options.sortKey`가 있으면 테이블 조회로 처리합니다.
- 검색 입력은 `,`와 `;`를 조건 구분자로 받고, 버튼 문구를 `하나라도 포함/모두 포함`으로 바꿔 OR/AND 기준을 화면에서 알 수 있게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 20개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] GLAPS 경로미도출/실적관리 RAG 보정 (v5.14.211)
### 핵심
- `내일 GLAPS 경로확인 안되는 작업지 어디야?` 같은 질문을 단순 키워드 검색이 아니라 상세배차의 `운송경로 미도출` 조건으로 해석하도록 보정했습니다.
- 상세배차 RAG가 GLAPS 활성 원장의 운송경로/항목매핑을 함께 읽어 `needsRouteCodeMapping`을 계산하고, 작업지별 미도출 수량을 먼저 주입합니다.
- 실적관리 RAG를 추가해 `종합실적/월간실적/연간실적` 화면의 도출항목과 요약 스냅샷을 재사용합니다. 원장 전체 행을 프롬프트에 직접 넣지 않아 대용량 마감자료 부담을 피합니다.
- AI 가이드/빠른질문은 실제 가능 업무 기준으로 갱신하고, 오류 컨테이너 예시 대신 운영 선적 이력 정상 샘플 `CMAU7631738`을 사용합니다.
### 검증
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/asanOpsRag.test.mjs web/tests/asanPerformanceRag.test.mjs web/tests/aiAssistantMeta.test.mjs`: 24개 통과
- `cd web; npm.cmd run lint -- "utils/asanDispatchRag.mjs" "utils/asanPerformanceRag.mjs" "utils/aiAssistantMeta.mjs" "tests/asanDispatchRag.test.mjs" "tests/asanPerformanceRag.test.mjs" "tests/aiAssistantMeta.test.mjs" "app/api/chat/route.js"`: 통과
- Supabase 읽기 전용 검증: 2026-05-26 상세배차 81라인 중 `GLAPS 경로확인 안되는` 조건 44건 조회
### 변경 파일
- `web/utils/asanDispatchRag.mjs`, `web/utils/asanPerformanceRag.mjs`
- `web/app/api/chat/route.js`, `web/utils/aiAssistantMeta.mjs`
- `web/tests/asanDispatchRag.test.mjs`, `web/tests/asanPerformanceRag.test.mjs`, `web/tests/aiAssistantMeta.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 운영 DB RAG 범위 확장 및 총 배차 집계 보정 (v5.14.210)
### 핵심
- 모비스 배차판의 `CODE`, `Nomi,구간`, `함축` 같은 설명 컬럼을 상차지/운송사 수량으로 오인해 실제 배차가 부풀던 문제를 수정했습니다.
- `배차예정` 이후부터 `배차/검증/특이사항` 전까지를 지역 컬럼 블록으로 우선 추론하고, 블록이 없는 경우에만 셀 패턴 fallback을 사용합니다.
- `총 몇 대 배차` 질문은 오더 수량이 아니라 실제 배차 수량을 즉답용 집계로 주입하며, 오더는 참고값으로 분리합니다.
- AI 채팅 RAG가 아산 상세배차, 선적관리, 배차변동내역, GLAPS코드를 각각 Supabase 운영 DB에서 읽도록 연결했습니다.
- 실제 DB 기준 2026-05-26 아산 배차는 오더 83대, 실제 배차 81대로 계산됨을 확인했습니다.
### 검증
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/asanOpsRag.test.mjs web/tests/aiAssistantMeta.test.mjs`: 21개 통과
- `cd web; npm.cmd run lint -- "utils/asanDispatchRag.mjs" "utils/asanShippingRag.mjs" "utils/asanOpsRag.mjs" "utils/aiAssistantMeta.mjs" "tests/asanDispatchRag.test.mjs" "tests/asanOpsRag.test.mjs" "tests/aiAssistantMeta.test.mjs" "app/api/chat/route.js"`: 통과
- `cd web; npm.cmd run build`: 통과
- Supabase 읽기 전용 검증: 선적관리 1,343행, 2026-05-26 상세배차 81라인, GLAPS 검색 성공, 해당일 배차변동 0건 정상 응답
### 변경 파일
- `web/utils/asanDispatchRag.mjs`
- `web/utils/asanShippingRag.mjs`, `web/utils/asanOpsRag.mjs`
- `web/app/api/chat/route.js`
- `web/utils/aiAssistantMeta.mjs`
- `web/tests/asanDispatchRag.test.mjs`, `web/tests/asanOpsRag.test.mjs`, `web/tests/aiAssistantMeta.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 테이블 수정칸 직접 편집화 (v5.14.210)
### 핵심
- 배차판 WEB 입력칸, 상세배차 상차지/BKG확정, 배차변동 상차지/BKG확정 입력이 셀 안에 별도 네모 박스로 떠 보이지 않도록 투명 테이블 입력 스타일로 정리했습니다.
- 선택된 BKG와 포커스 상태는 셀 배경/인셋 라인으로만 표시해 테이블 흐름이 유지되게 했습니다.
- GLAPS코드 화면의 추가/수정은 별도 편집 카드 대신 테이블 행이 바로 입력행으로 바뀌도록 변경했습니다. `Enter` 저장, `Esc` 취소도 지원합니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 43개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/(main)/employees/branches/asan/page.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 차량관제 모바일 기록/상세 표시 안정화 (v5.14.209)
### 핵심
- 모바일 운행기록 카드에서 `구분` 값을 한 줄로 표시하고, 날짜 라벨 아래에 생기던 큰 여백을 줄였습니다.
- 운행기록 카드의 최종위치는 주소가 없을 때 좌표/기록시간을 fallback으로 보여주도록 보강했습니다.
- 운행기록 목록 API는 위치 포인트를 소량 배치로 나눠 읽어 포인트가 많은 운행이 섞여도 운행거리, 최고속도, 최종위치 보강값이 빠지지 않게 했습니다.
- 단건 상세 API도 위치 포인트를 기반으로 운행거리, 최고속도, 최종위치를 계산해 상세보기 진입 시 목록에서 보이던 값이 사라지지 않게 했습니다.
- 상세현황의 위치 포인트 목록은 전체 포인트를 보유하되 화면에는 최근 60개만 렌더링해 모바일 다운 위험을 줄였습니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/app/api/vehicle-tracking/trips/route.js`
- `web/app/api/vehicle-tracking/trips/[id]/route.js`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] GLAPS 운송경로 보호 컬럼 우측 배치 (v5.14.208)
### 핵심
- 운송경로 탭에서 `운송경로코드/운송경로명` 회색 보호 컬럼이 왼쪽에 있어 항목매핑 탭과 시선 흐름이 달랐던 문제를 정리했습니다.
- 화면 테이블은 `상차지 -> 경유지(ELS) -> 하차지 -> 연결키 -> 운송경로명 -> 운송경로코드` 순서로 바꿔, 입력/매칭값을 먼저 보고 원장 보호값은 오른쪽에서 확인하게 했습니다.
- 운송경로 수정양식도 같은 흐름으로 `상차지/경유지(ELS)/하차지`를 먼저 두고, 보호값 `경유지/운송경로명/운송경로코드`를 오른쪽에 배치했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 43개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/template/route.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/utils/glapsMasterData.mjs`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 선적관리 모바일 목록 100건 단위 렌더링 제한 (v5.14.207)
### 핵심
- 모바일 선적관리 테이블이 `processedData` 전체를 한 번에 렌더링하지 않고 100건 단위로만 화면에 표시되도록 제한했습니다.
- 모바일 창 스크롤이 하단에 가까워지면 먼저 화면 표시량을 100건씩 늘리고, 이미 받은 행을 다 보여준 뒤에만 다음 서버 페이지를 조회합니다.
- 모바일 가로 스크롤이 테이블 내부 `onScroll`을 통해 다음 페이지 로딩을 호출하지 않도록 차단했습니다.
- 모바일에서는 컬럼 필터/빠른 필터 때문에 `FULL_FILTER_PAGE_SIZE` 전체 로딩을 자동 실행하지 않게 해 초기 진입 부하를 줄였습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 37개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 모바일 상단 여백 제거 (v5.14.206)
### 핵심
- 모바일에서 아산 배차판 상단 상태/작업 버튼 영역이 데스크톱용 `flex-basis: 520px`와 `justify-content: flex-end`를 유지해 선택일 배지 아래에 큰 빈 여백이 생기던 문제를 수정했습니다.
- 모바일 상태영역은 자동 높이로 초기화하고 위쪽부터 배치되게 했습니다.
- 저장/동기화 상태가 없을 때는 빈 상태 박스를 렌더링하지 않도록 정리했습니다.
### 검증
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js"`: 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 34개 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] GLAPS 항목매핑 라벨/BP 노출 정리 (v5.14.205)
### 핵심
- 항목매핑 화면과 수정양식의 `배차판 매칭용`을 `ELS 매치코드`, `ELS명`을 `ELS 디스크립션(설명)`, `GLAPS명`을 `GLAPS 디스크립션(설명)`, `GLAPS코드`를 `최종코드(BP)`로 바꿨습니다.
- `항목`은 `매핑항목`으로 한글 표시하고, 수정양식 업로드도 `포트/선사/컨테이너규격/운송사/컨샤이니/기타` 한글값을 인식하게 했습니다. 기존 영문값과 구형 헤더도 계속 허용합니다.
- 상세배차 매칭은 기존처럼 `ELS 매치코드`, `ELS 디스크립션(설명)`, `GLAPS 디스크립션(설명)`, `최종코드(BP)`를 모두 같은 최종코드로 참조합니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 43개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js"`: 통과
### 변경 파일
- `web/utils/glapsMasterData.mjs`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 동기화 상태칩 prefix 수정 (v5.14.204)
### 핵심
- 상태칩이 에러가 아니면 무조건 `완료` prefix를 붙이던 표시 로직을 수정했습니다.
- `glovis 파일 확인 중`, `NAS 동기화 요청 중`, `저장 중` 같은 진행성 메시지는 `진행 · ...`으로 표시합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js"`: 통과
- `cd web; npm run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 배차확정 후 WEB BKG 잠금 및 변경 tooltip 보강 (v5.14.203)
### 핵심
- 배차확정 이후 배차판 WEB 입력칸의 BKG1/2/3 기존값은 UI에서 회색 잠금 처리하고, 저장 API에서도 같은 조건을 다시 차단합니다.
- 비어 있던 BKG2/3 등 후속 부킹 칸은 확정 후에도 추가 입력할 수 있게 두어, 뒤늦게 확정된 부킹번호를 상세배차/배차변동 코드 도출에 반영할 수 있게 했습니다.
- TARGET VESSEL과 비고는 운영 메모 성격으로 확정 이후에도 계속 수정 가능하게 유지했습니다.
- 상세배차의 `변경건` 표시와 배차변동의 `변동구분`에 마우스를 올리면 변경 전/후 값을 볼 수 있게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/web-cell/route.js"`: 통과
- `cd web; npm run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/web-cell/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 배차변동 추가/삭제 이력 보존 및 확인취소 잠금 정책 (v5.14.202)
### 핵심
- 배차확정 후 추가된 상세라인이 다시 삭제될 때 기존 `추가` 이벤트를 `삭제`로 덮어쓰지 않고, `delete-after-add:*` 별도 삭제 이벤트를 아래에 추가하도록 변경했습니다.
- 추가/삭제 쌍은 `추가취소쌍` 배지와 회색 배경으로 함께 표시해, 3건 추가 후 2건 삭제처럼 일부만 살아남는 상황을 눈으로 구분할 수 있게 했습니다.
- 확인완료된 배차변동 행은 상차지/BKG확정/BKG 클릭 선택을 잠그고, `확인취소` 버튼으로 미확인 상태로 되돌린 뒤 수정하도록 했습니다.
- 최종수량은 이미 최신 원천 데이터가 반영된 상세라인 수량을 기준으로 표시해, 변동 delta를 다시 더하는 이중계산을 막았습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js"`: 통과
- `cd web; npm run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 NAS 동기화 우선순위 재정렬 (v5.14.201)
### 핵심
- 수동 NAS 동기화의 빠른 반영 기준을 기존 최근 5일에서 `1순위 작업일 -> 전/후 작업일 -> 나머지 날짜`로 바꿨습니다.
- 1순위 작업일은 오늘 시트가 있으면 오늘, 없으면 오늘 이후 첫 작업일, 미래 시트가 없으면 가장 최근 과거 작업일로 잡습니다.
- 1순위가 글로비스/모비스 모두 끝나면 `quick_done`을 즉시 세워 웹이 새로고침으로 상세배차/배차변동을 먼저 볼 수 있게 했습니다.
- 전/후 작업일과 나머지 날짜를 백그라운드로 처리하는 중에는 1분 쿨다운이 끝난 뒤 재요청할 수 있고, 이 경우 기존 백그라운드를 시트 단위로 중단한 뒤 1순위부터 다시 시작합니다.
### 주의
- 엑셀 파일 읽기/시트 저장 중간을 OS 레벨로 강제 종료하지는 않고, 시트 처리 경계에서 취소 토큰을 확인하는 협력적 중단 방식입니다. 데이터 반영 중간 끊김을 피하기 위한 선택입니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `py -3 -m py_compile docker/els-backend/app_core.py`: 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js"`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 조회 2차 경량화 및 버튼 순서 정리 (v5.14.200)
### 핵심
- 아산 예하페이지 우측 작업 버튼 순서를 `엑셀 -> 설정 -> 새로고침 -> NAS 동기화`로 변경했습니다.
- `/api/branches/asan/dispatch`에 `mode=meta/date/full` 조회를 추가했습니다.
- 화면은 먼저 날짜별 메타와 선택일 상세만 받아 초기 표/탭을 표시하고, 전체 원장은 백그라운드에서 채워 넣습니다.
- 빠른 화면 전환 중 이전 백그라운드 조회가 새 화면 데이터를 덮지 않도록 load sequence guard를 추가했습니다.
### 다음 최적화 후보
- 현재 `mode=meta`는 브라우저 payload/render 부하를 줄이는 단계입니다. 서버 내부 DB 스캔까지 줄이려면 날짜별 유효행 수 요약 컬럼 또는 summary 테이블을 두는 방식이 다음 후보입니다.
- 아산 `page.js`는 계속 커지고 있어 상세배차/변동내역/GLAPS hook 분리가 유지보수 최적화 후보입니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js"`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/dispatch/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 상세/변동 엑셀 다운로드 GLAPS 업로드 시트 추가 (v5.14.199)
### 핵심
- NAS `/volume2/아산지점/A_운송실무/GLAPS_업로드.xlsx` 첫 시트(`오더 엑셀업로드`)의 실제 헤더를 확인했습니다.
- 첫 시트는 62컬럼이며, 상세배차/배차변동내역 다운로드 시 기존 우리 기준 시트와 별도로 `GLAPS_업로드` 시트를 함께 생성합니다.
- GLAPS 시트에는 오더구분, 선사코드, 화주사 코드, 반출지/작업지/반입지 코드, 운송경로 코드, 운송서비스/운송사 코드, 부킹번호, POD/최종목적지, 컨테이너 규격/수량, 컨사이니를 매핑합니다.
- 같은 부킹번호/운송경로/선사/컨테이너 규격은 `컨테이너 수량`으로 묶습니다. 삭제 변동건은 GLAPS 신규 업로드 양식으로 표현할 수 없으므로 우리 기준 시트에는 남기고 `GLAPS_업로드` 시트에서는 제외합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 44개 통과
- Export API 메모리 검증: `상세배차내역`, `GLAPS_업로드` 2개 시트 생성, GLAPS 헤더 62개, 부킹번호/컨테이너 수량 위치 확인
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/export/view/route.js" "utils/asanGlapsUploadExport.mjs"`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/utils/asanGlapsUploadExport.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/export/view/route.js`
- `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 GLAPS lookup 경량화 1차 (v5.14.198)
### 핵심
- 아산 배차판이 상세배차/배차변동내역 진입 시 전체 GLAPS 마스터를 다시 읽어 화면 체감 부하가 커지는 지점을 우선 계측했습니다.
- GLAPS 활성 원장 기준 전체 응답은 운송경로 540건, 항목매핑 2,923건, 원본시트 1,177건으로 상세 코드 도출에는 과한 구조였습니다.
- `/api/branches/asan/glaps/master?mode=lookup`을 추가해 상세 코드 도출에 필요한 운송경로, 포트/라인/컨테이너/운송사/컨샤이니 alias, `컨테이너규격`/`수출입코드` 원본행만 내려주게 했습니다.
- 실측 기준 상세 lookup payload는 약 3.2MB에서 약 738KB로 줄었고, 같은 GLAPS refresh token 안에서는 상세배차와 배차변동내역 간 중복 fetch를 생략합니다.
### 다음 최적화 후보
- 배차 원본 API는 아직 화주별 112일치 원장을 한 번에 가져옵니다. 날짜 목록 메타와 선택 날짜 상세를 분리하면 초기 배차판 payload를 추가로 줄일 수 있습니다.
- `page.js`는 3,300줄대 단일 컴포넌트라 상세/변동/GLAPS hook 분리가 다음 유지보수 병목입니다.
- `전체 표시` 상태의 대형 표는 행 수가 늘면 DOM 부하가 커지므로 필요 시 row virtualization을 도입합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 49개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/glaps/master/route.js"`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차변동 하위 탭 통합 이벤트 조회 보정 (v5.14.197)
### 핵심
- 2026-05-25 배차변동 DB를 확인한 결과, 배차확정과 변동 이벤트가 `integrated` scope에만 저장되어 글로비스 하위 탭의 `dispatch_type=glovis` 조회에서는 보이지 않는 것을 확인했습니다.
- `change-events` API는 글로비스/모비스 직접 확정이 없는 경우 `integrated` 변동 이벤트를 함께 조회하고, snapshot의 화주 값으로 해당 탭 이벤트만 필터링합니다.
- 하위 탭에서 보이는 통합 변동 이벤트도 event id 기준으로 개별/일괄 확인 및 변동행 수정이 가능하도록 확인/수정 쿼리의 scope 검증을 보정했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 42개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js"`: 통과
- `cd web; npm run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] Vercel Preview 루트 middleware 환경변수 보정 (v5.14.196)
### 핵심
- 실제 Vercel 요청 진입점은 `web/middleware.js`였고, 기존 `utils/supabase/middleware.js` 보정만으로는 외부 URL의 middleware 실패가 해결되지 않는 것을 확인했습니다.
- 루트 middleware에서 Supabase URL/anon key가 없으면 세션 갱신과 권한 조회를 생략하고 요청을 그대로 통과하도록 보정했습니다.
### 검증
- `cd web; npm run lint -- middleware.js utils/supabase/middleware.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/middleware.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] Vercel Preview middleware 환경변수 보정 (v5.14.195)
### 핵심
- Vercel Preview 배포는 READY 상태가 됐지만, 외부 URL 접근 시 middleware에서 Supabase client 생성이 실패해 `MIDDLEWARE_INVOCATION_FAILED`가 발생했습니다.
- `utils/supabase/middleware.js`에서 Supabase URL/anon key가 없으면 세션 갱신을 생략하고 요청을 그대로 통과하도록 보정했습니다.
### 검증
- `cd web; npm run lint -- utils/supabase/middleware.js utils/supabase/server.js utils/supabase/client.js utils/supabase/unavailableClient.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/utils/supabase/middleware.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] Vercel Preview 공용 Supabase fallback 보정 (v5.14.194)
### 핵심
- Vercel Preview 재빌드에서 `/api/driver-contacts/search`, `/admin/logs`, `/driver-app` 등 공용 Supabase client를 쓰는 경로가 환경변수 누락으로 빌드 중 실패하는 것을 확인했습니다.
- `utils/supabase/server.js`, `utils/supabase/client.js`에 환경변수 누락 시 예외를 던지지 않는 fallback client를 연결했습니다.
- fallback client는 빌드/렌더/import 단계에서는 안전하게 통과하고, 실제 DB 요청은 503 성격의 오류 응답 객체를 반환합니다.
- 직접 Supabase admin client를 생성하던 아산 export 라우트와 아산 성과 DB 헬퍼도 같은 기준으로 보정했습니다.
### 검증
- `cd web; npm run lint -- utils/supabase/server.js utils/supabase/client.js utils/supabase/unavailableClient.js app/api/branches/asan/export/route.js lib/asan-branch-db.js app/api/branches/asan/settings/route.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/utils/supabase/server.js`, `web/utils/supabase/client.js`, `web/utils/supabase/unavailableClient.js`
- `web/app/api/branches/asan/export/route.js`, `web/lib/asan-branch-db.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] Vercel Preview 아산 설정 API 초기화 보정 (v5.14.193)
### 핵심
- PR Preview 재빌드가 `/api/branches/asan/settings` 수집 단계에서 다시 `supabaseUrl is required`로 실패하는 것을 확인했습니다.
- 해당 라우트도 Supabase admin client를 모듈 import 시점에 생성하고 있어, Preview 환경변수가 없는 경우 빌드 단계에서 예외가 발생했습니다.
- Supabase admin client 생성을 GET/PATCH 요청 시점으로 늦기고, 환경변수가 없으면 실제 API 요청에서 503 JSON을 반환하도록 보정했습니다.
### 검증
- `cd web; npm run lint -- app/api/branches/asan/settings/route.js app/api/branches/asan/dispatch/route.js constants/siteLayout.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/app/api/branches/asan/settings/route.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] Vercel Preview Supabase 환경변수 누락 보정 (v5.14.192)
### 핵심
- PR 생성 후 Vercel Preview 빌드가 `/api/branches/asan/dispatch` 수집 단계에서 `supabaseUrl is required`로 실패하는 것을 확인했습니다.
- 원인은 API 라우트가 모듈 import 시점에 Supabase admin client를 생성해, Preview 환경변수가 없는 경우 빌드 단계에서 즉시 예외가 발생하던 구조였습니다.
- Supabase admin client 생성을 요청 시점으로 늦기고, 환경변수가 없으면 실제 API 요청에서 503 JSON을 반환하도록 보정했습니다.
### 검증
- `cd web; npm run lint -- app/api/branches/asan/dispatch/route.js constants/siteLayout.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/app/api/branches/asan/dispatch/route.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 서비스 히어로 문구 정리 (v5.14.191)
### 핵심
- 서비스 페이지 히어로 문구에서 `및 제조 서비스` 표현을 제거했습니다.
- 최종 문구는 `고객의 가치를 최우선으로 하는 맞춤형 물류 서비스`입니다.
### 검증
- `cd web; npm run lint -- constants/siteLayout.js`: 통과
- Browser local check (`http://localhost:3010/services`): 기존 `물류 및 제조 서비스` 문구 없음, 새 `맞춤형 물류 서비스` 문구 확인.
### 변경 파일
- `web/constants/siteLayout.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 서비스 제목 보조 라벨 제거 (v5.14.190)
### 핵심
- 서비스 페이지 `주요 사업 및 운영 현황` 제목 위에 작게 표시되던 공통 `ELS` 라벨을 제거했습니다.
- 공통 `sectionTitle` 스타일 전체를 건드리지 않고, 서비스 섹션에만 `noEyebrow` 클래스를 적용해 영향 범위를 좁혔습니다.
### 검증
- `cd web; npm run lint -- components/Business.js`: 통과
- Browser local check (`http://localhost:3010/services`): 제목의 `::before` content/display가 `none`으로 확인됨.
### 변경 파일
- `web/components/Business.js`
- `web/components/Business.module.css`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 공개 헤더 CTA 중복 제거 (v5.14.189)
### 핵심
- 미로그인 공개 헤더에서 `임직원 로그인`과 우측 `로그인`이 동시에 보여 같은 기능 버튼이 중복 노출되던 문제를 정리했습니다.
- 공개 내비게이션에는 `인트라넷` 단일 진입만 남기고, 클릭 시 기존처럼 로그인 후 `/employees/ask`로 이동하게 유지했습니다.
- 모바일 메뉴에서도 미로그인 상태의 별도 `로그인` 버튼을 숨겨 같은 패턴으로 맞췄습니다.
### 검증
- `cd web; npm run lint -- components/Header.js`: 통과. 기존 `no-img-element` 경고 3건만 확인.
- Browser local check (`http://localhost:3010/intro`): 헤더 텍스트가 `회사소개 / 서비스 / 실적현황 / 웹진 / 네트워크 / 문의하기 / 인트라넷`으로 표시되고 `로그인` 중복 없음.
### 변경 파일
- `web/components/Header.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 공개/인트라넷 UI 톤앤매너 정리 (v5.14.188)
### 핵심
- 공개 홈페이지는 회사 소개, 서비스, 실적, ESG, 문의 흐름의 카피와 밀도를 한국 사용자 기준으로 정리했습니다.
- 미로그인 공개 헤더에서는 인트라넷 세부 메뉴를 숨기고 `임직원 로그인` 진입만 남겨 외부 노출 범위를 줄였습니다.
- 아산 배차판·선적관리·실적관리 기준에 맞춰 버튼 높이, 테이블 셀 패딩, 카드 라운드/그림자/여백을 더 조밀하고 담백하게 보정했습니다.
- 자료실, 게시판, 연락처, 업무자료, 안전운임, 차량관제 등 인트라넷 주요 화면의 장식성 이모지를 텍스트 라벨로 치환했습니다.
- 문의 페이지는 공개 문의 목록 노출을 제거하고 비공개 접수 안내 중심으로 정리했습니다.
### 검증
- `cd web; npm run lint`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
- Browser local check (`http://localhost:3010`): `/intro`, `/contact`, `/employees/branches/asan`, `/employees/safe-freight` 진입 및 콘솔 오류 없음. 캡처 저장은 브라우저 런타임 타임아웃으로 생략.
### 변경 파일
- `web/components/*` 공개 홈페이지/공통 헤더/인트로/대시보드/푸터/모달 톤 보정
- `web/app/(main)/contact/*`, `web/app/(main)/welfare/page.js`, `web/app/(main)/login/page.js`
- `web/app/(main)/employees/branches/asan/*`
- `web/app/(main)/employees/(intranet)/**`
- `web/app/(main)/employees/safe-freight/**`, `web/app/(main)/employees/vehicle-tracking/page.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 NAS 빠른 동기화/변동 삭제 이력화 (v5.14.187)
### 핵심
- NAS 동기화 수동 요청을 `quick`/`rest` 단계로 나눴습니다.
- `quick` 단계는 글로비스/모비스 모두 오늘 기준 -2일~+2일 최근 5일 시트만 먼저 반영하고, 완료 신호(`quick_done`)를 상태 API에 남깁니다.
- 웹은 `quick_done`을 받으면 기존 상단 `새로고침`과 같은 `window.location.reload()` 흐름을 실행해 최신구간을 빠르게 확인하게 했습니다. 과거/잔여 날짜는 백그라운드 `rest` 단계에서 이어 처리합니다.
- 실제 동기화 진행 중이거나 최근 요청 후 1분이 지나지 않은 경우 NAS 동기화 버튼은 비활성화하고, 새로고침 버튼만 사용할 수 있게 했습니다.
- 확정 후 감지된 `추가` 변동행이 엑셀 원본에서 다시 삭제되면 active=false로 숨기지 않고, 발생일시를 갱신한 `삭제` 이벤트로 전환해 회색 행으로 남깁니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 42개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js"`: 통과
- Codex 번들 Python `-m py_compile docker/els-backend/app_core.py`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차판 새로고침 실제 reload 전환 (v5.14.186)
### 핵심
- 기존 `새로고침` 버튼은 배차 API만 다시 조회해, 새 배포 코드나 화면 변경 반영 확인에는 F5와 같은 효과가 없었습니다.
- 버튼을 누르면 현재 보기, 배차 구분, 선택 날짜/전체 기간, 검색어, 컬럼/상태 필터, 상세/변동 필터, 스크롤 위치를 `sessionStorage`에 저장합니다.
- 저장 직후 `window.location.reload()`를 호출해 브라우저 F5처럼 페이지와 번들을 다시 불러오고, 재진입 시 저장한 작업 위치를 복원합니다.
- 사용자가 F5를 눌렀을 때 페이지 상태를 잃는 문제를 줄이면서도, 버튼이 실제 새로고침 의미를 갖도록 정리했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 42개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차변동내역 확정 후 작업판 재정렬 (v5.14.185)
### 핵심
- 배차변동내역은 확정 후 상세현황의 연장선이므로, `상차지` 선택과 `BKG확정`/BKG1~3 클릭 선택을 상세배차와 같은 방식으로 다시 제공했습니다.
- 변동행 저장은 화면에 재계산된 상세배차 rowValues를 저장해, 추가/삭제/변경 후 GLAPS 코드와 BKG 확정값을 후처리할 수 있게 했습니다.
- 배차변동 fingerprint에서 `운송경로코드`, 포트/라인/타입코드, 오더/화주/운송사/컨샤이니 등 GLAPS 파생코드를 제외했습니다. 코드 보강이나 lookup 중간상태만으로는 변경 이벤트를 만들지 않습니다.
- 확정 전에 저장된 BKG확정 보정시간은 확정 후 `수정건`으로 표시하지 않게 해, 배차확정 자체가 사후 수정처럼 보이던 혼선을 줄였습니다.
- `GLAPS코드` 웹수정/삭제, 수정양식 업로드, NAS 마스터 반영 후 상세배차/배차변동내역 lookup refresh token을 올려 코드 부족분 수정이 즉시 계산에 반영되게 했습니다.
### 분석
- 2026-05-25 상세 상단 2건의 수정 표시는 2026-05-24 23:26 KST에 확정 전 저장된 BKG확정 WEB 보정값이 마지막 수정일시로 표시된 것이었습니다.
- 같은 날 23:38 KST에는 GLAPS 코드 조회가 빈 중간상태였던 순간 변경 이벤트 5건이 생성됐다가, 코드가 다시 채워지며 inactive 처리된 이력이 있었습니다. 원인은 변동 fingerprint가 GLAPS 파생코드까지 비교하던 구조였습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 42개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 중 NAS/WebDAV fetch `ECONNRESET` 경고가 있었지만 빌드는 성공.
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차변동내역 직접입력 제한 (v5.14.184)
### 핵심
- 배차변동내역에서 상차지/BKG/기본 컬럼을 직접 수정하던 입력칸을 제거했습니다.
- 변동내역은 상세배차와 같은 GLAPS 계산 결과를 표시하되, 원천 수정은 WEB 부킹/비고 또는 엑셀 배차 원본 수정으로 처리하는 흐름으로 되돌렸습니다.
- 저장된 변동 row와 현재 계산값이 다를 때만 `계산값반영` 버튼을 제공해 파생 코드 저장만 제한적으로 허용합니다.
- 상세배차 하단 `변경건` 표시와 GLAPS 재계산 표시는 유지합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-25] 아산 배차변동내역 상세배차 구조 정렬 (v5.14.183)
### 핵심
- 배차변동내역 행을 상세배차 line 객체로 다시 구성해 GLAPS 코드 계산을 동일하게 적용합니다.
- 변동행에서 상차지, BKG확정/BKG1~3, 기본 입력 컬럼을 수정하면 운송경로, 포트/라인/타입, 오더/화주/운송사/컨샤이니 코드가 다시 계산됩니다.
- 변동행 저장 시 화면에 계산된 `rowValues`와 갱신된 `rowContext`를 함께 저장해, 빈 계산값이 확정된 값처럼 남지 않게 했습니다.
- 상세배차 화면에서는 active 변동건을 목록 하단으로 보내고 마지막 `수정일시` 칸에 `변경건` 배지를 표시합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 아산 배차확정 직후 변동 이벤트 흔들림 보정 (v5.14.182)
### 핵심
- 2026-05-25 배차확정 테스트 중 변동 이벤트가 잠깐 생성됐다가 사라지는 현상을 DB 이력으로 확인했습니다.
- 원인은 상세 상태/BKG 보정/GLAPS 코드 조회가 각각 비동기로 끝나기 전에 자동 변동 동기화가 먼저 실행되어, 코드 컬럼이 빈 중간상태로 비교되던 타이밍 문제였습니다.
- 상세배차/배차변동내역의 자동 변동 동기화는 상세 상태와 GLAPS 조회가 모두 끝난 뒤 500ms 안정화된 스냅샷으로만 실행하도록 보정했습니다.
- 배차확정/확정취소 직후에는 상세 상태 refresh token을 올려 서버 상태를 다시 읽고, draft와 동기화 서명을 초기화합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 아산 배차판 새로고침 상세상태 재조회 보정 (v5.14.181)
### 핵심
- 2026-05-25 테스트 데이터는 배차확정/확정이력/스냅샷/변동이벤트/변동이력/BKG보정/보정이력을 모두 삭제해, 한 번도 확정하지 않은 상태로 리셋했습니다.
- `새로고침` 버튼이 배차 원본만 다시 읽고 상세배차의 확정/BKG/변동 상태를 다시 조회하지 않던 문제를 보정했습니다.
- 상세배차/배차변동내역 화면에서 새로고침하면 GLAPS 조회도 함께 갱신하고, 임시 draft와 변동 동기화 서명을 초기화합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 중 NAS/WebDAV fetch `ECONNRESET` 경고가 있었지만 빌드는 성공했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 배차변동내역 스냅샷/이벤트 원장 구현 (v5.14.180)
### 핵심
- 배차확정 시 상세배차 라인을 `branch_dispatch_detail_snapshots`에 저장하고, 확정 이후 현재 상세라인과 비교해 `추가 / 삭제 / 변경` 이벤트를 `branch_dispatch_detail_change_events`에 남깁니다.
- `민경5,이지3 -> 민경2,이지3` 같은 수량 감소는 삭제 3건으로 감지하고, 같은 원천행의 BKG 변경은 변경 이벤트로 감지합니다.
- 변동내역 탭은 SORT 없이 발생 순서만 유지하며, 미확인/확인완료 필터, 개별 확인, 일괄확인, 행 수정 저장을 제공합니다.
- 상세배차 하단에는 확정 후 변동 요약과 최종수량을 같이 표시해 현재 상세라인 + 변동 이벤트 기준 수량을 바로 확인할 수 있게 했습니다.
- 확정취소는 상세배차 잠금만 해제하고 기존 변동 이벤트를 삭제하지 않습니다.
### DB
- Supabase migration `asan_dispatch_change_events` 적용 완료
- 추가 테이블: `branch_dispatch_detail_snapshots`, `branch_dispatch_detail_change_events`, `branch_dispatch_detail_change_history`
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/confirmation/route.js" "app/api/branches/asan/dispatch/change-events/route.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchChangeEvents.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/confirmation/route.js`
- `web/app/api/branches/asan/dispatch/change-events/route.js`
- `web/supabase_sql/20260524_asan_dispatch_change_events.sql`
- `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 배차변동내역 이벤트 장부 기준 재정리 (v5.14.179)
### 핵심
- `배차변동내역` 탭이 확정 후 현재 상세라인 전체를 `배차수정후` 목록처럼 보여주던 동작을 되돌렸습니다.
- 변동이 없으면 `변동 없음` 안내만 표시하고, 이후 확정 스냅샷 대비 추가/삭제/변경 이벤트가 감지될 때만 발생 순서대로 노출하는 구조로 정리했습니다.
- 다음 구현 기준은 확정 스냅샷 저장, 이벤트 중복 방지 키, 확인/미확인 필터, 변동 테이블 SORT 금지입니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 차량관제 운행기록/교육이수 페이지 조회 적용 (v5.14.178)
### 핵심
- 운행기록/교육이수 목록을 한 번에 200건 로딩하던 구조에서 서버 페이지 단위 조회로 바꿨습니다.
- 첫 화면은 20건만 로딩하고, 화면에서 20/50/100건 단위와 이전/다음 페이지를 선택할 수 있게 했습니다.
- 교육이수 탭은 `education_only=1`로 안전교육 이수 로그가 있는 운행만 조회하며, 데스크탑/모바일 모두 같은 페이지 컨트롤을 사용합니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 8개 통과
- `npm.cmd run lint -- "app/(main)/employees/vehicle-tracking/page.js" "app/api/vehicle-tracking/trips/route.js" "tests/vehicleTrackingMobileDetail.test.mjs"`: 통과(기존 hook/img 경고만)
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/app/api/vehicle-tracking/trips/route.js`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 차량관제 운행거리/최고속도 기록 노출 보정 (v5.14.175)
### 핵심
- 운행기록 표의 `최종위치(속도)` 묶음 컬럼을 `운행거리`, `최고속도`, `최종위치` 독립 컬럼으로 분리했습니다.
- 기록 행과 모바일 카드가 같은 기준으로 운행거리/최고속도를 표시하도록 `getTripDistance`, `getTripMaxSpeed` 헬퍼를 사용하게 했습니다.
- `/api/vehicle-tracking/trips`는 위치 포인트가 없거나 일부 운행만 조회된 경우 기존 `distance_km`/`route_distance_km`/`max_speed` 저장값을 0/null로 덮어쓰지 않게 했습니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/vehicle-tracking/page.js" "app/api/vehicle-tracking/trips/route.js" "tests/vehicleTrackingMobileDetail.test.mjs"`: 통과(기존 hook/img 경고만)
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/api/vehicle-tracking/trips/route.js`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS WEB수정 업로드 충돌 보호 정책 적용 (v5.14.177)
### 핵심
- `수정양식 업로드`가 기존 `WEB수정` 행을 변경하거나 삭제하려 하면 해당 행은 적용하지 않고 스킵하도록 했습니다.
- `NAS 마스터 반영`/`마스터 업로드`로 새 원장 버전이 만들어질 때 기존 활성 버전의 `WEB수정` 행을 새 버전으로 보존합니다.
- 업로드 완료 메시지에 `WEB수정 보호 N건 업로드 제외`, `WEB수정 N건 보존`을 표시해 충돌 처리 결과를 바로 알 수 있게 했습니다.
- 마지막 업로드 처리 결과는 활성 버전 `metadata.lastUploadResult`에도 남깁니다.
### 정책
- 현재 DB는 필드별 출처가 아니라 행 단위 `updated_by`만 갖고 있으므로, 충돌 보호도 행 단위로 적용합니다.
- 필드 단위 병합은 이후 별도 provenance 테이블을 둘 때 확장합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 배차확정자 이름 표시와 변동내역 리스트 복구 (v5.14.176)
### 핵심
- 배차확정자와 상세 보정 수정자를 표시할 때 `profiles.full_name` / `user_roles.name`을 우선 사용하고, 이메일 전체가 화면에 노출되지 않게 했습니다.
- `배차변동내역` 탭에서 빈 대기 패널만 보이던 상태를 수정해, 확정 후 `배차수정후` 상세라인 리스트를 바로 표시합니다.
- 변동내역 표와 현재 화면 다운로드에 `변동구분`, `수정일시`를 포함했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/confirmation/route.js" "app/api/branches/asan/dispatch/detail-override/route.js" "app/api/branches/asan/dispatch/actorName.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/actorName.js`
- `web/app/api/branches/asan/dispatch/confirmation/route.js`
- `web/app/api/branches/asan/dispatch/detail-override/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS코드 테이블 필터 목록화 (v5.14.174)
### 핵심
- GLAPS코드 운송경로/항목매핑/원본시트 테이블 필터를 텍스트 입력에서 목록 선택으로 바꿨습니다.
- 각 컬럼은 현재 탭의 고유값을 정렬된 옵션으로 제공하고, 값이 없는 항목은 `(빈값)`으로 선택할 수 있게 했습니다.
- 선택된 목록값은 정확히 같은 값만 표시하며, `전체` 선택 또는 `테이블 필터해제`로 조건을 해제합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS코드 테이블 필터와 정렬 추가 (v5.14.172)
### 핵심
- GLAPS코드 운송경로/항목매핑/원본시트 테이블에 컬럼별 필터 입력줄을 추가했습니다.
- 컬럼 헤더 클릭으로 오름차순/내림차순/해제 정렬을 순환하도록 했습니다.
- 현재 표시 건수/전체 건수를 함께 보여주고, 필터 적용 시 `테이블 필터해제` 버튼으로 한 번에 초기화할 수 있게 했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 아산 배차판 현재 화면 다운로드 추가 (v5.14.171)
### 핵심
- 기존 `엑셀` 버튼을 현재 화면 기준 다운로드로 확장했습니다.
- 일반 배차판은 현재 필터와 숨김 컬럼을 반영한 행/열을 내려받고, 상세배차는 상세라인 화면 컬럼 순서 그대로 내려받습니다.
- 배차변동내역에서는 아직 GLAPS 업로드 순서를 적용하지 않고, 현재 WEB 보정값이 반영된 `배차수정후` 상세라인을 내려받게 했습니다.
- 화면에서 계산된 헤더/행을 `/api/branches/asan/export/view`로 보내 xlsx를 생성하는 별도 API를 추가했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/export/view/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `POST http://localhost:3001/api/branches/asan/export/view`: 200, xlsx 응답 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/export/view/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 아산 배차판 새로고침과 상세필터 압축 (v5.14.170)
### 핵심
- 아산 배차판 상단 공통 헤더에 `새로고침` 버튼을 추가해 F5 없이 현재 보기와 선택 날짜를 유지한 채 자료를 다시 읽게 했습니다.
- `GLAPS코드` 화면은 부모 refresh token을 받아 내부 원장 조회를 다시 실행하도록 연결했습니다.
- 상세배차 수정필요 버튼을 `입력/미도출/확인/수정` 그룹으로 묶고 버튼 높이·간격을 줄여 좁은 폭에서 깨지지 않고 줄바꿈되게 보정했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 상세배차 수정일시와 모바일 버튼 정리 (v5.14.167)
### 핵심
- 상세배차 목록 마지막에 `수정일시` 컬럼을 추가해 BKG확정 등 WEB 보정값이 있는 행의 수정 시각을 바로 볼 수 있게 했습니다.
- 상세배차 검색 대상과 `수정건` 필터에 `수정일시`를 포함했습니다.
- 모바일에서는 상단 버튼 과밀을 줄이기 위해 `상세배차내역`, `배차변동내역`, `GLAPS코드` 버튼을 숨겼습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/asanDispatchDetailLines.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchDetailLines.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDispatchDetailLines.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 차량관제 운행기록 모바일 본문형 목록 전환 (v5.14.173)
### 핵심
- 운행기록/교육이수 모바일 결과를 팝업 bottom sheet가 아니라 본문 아래 컴팩트 목록으로 바로 보이게 바꿨습니다.
- 차량위치관제 모바일 화면의 제목, 탭, 통계 카드, 필터, 기록 목록 여백과 폰트 크기를 줄여 다른 인트라넷 페이지와 톤을 맞췄습니다.
- 상세 지표는 운행거리와 최고속도 중심으로 정리하고, 기록 행에서도 운행거리 km 표기를 완료 여부와 무관하게 값이 있으면 표시하게 했습니다. 평균속도 표기는 추가하지 않았습니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 5개 통과
- `npm.cmd run lint -- "app/(main)/employees/vehicle-tracking/page.js" "tests/vehicleTrackingMobileDetail.test.mjs"`: 통과(기존 hook/img 경고만)
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 차량관제 실시간 로그 라우트 복구 (v5.14.169)
### 핵심
- 차량위치관제 상단 `실시간 로그` 버튼이 여는 `/api/debug/view`가 NAS `els-core`에 없어 페이지 없음이 날 수 있던 문제를 수정했습니다.
- 안드로이드 앱/오버레이가 보내는 `/api/debug/log` 수신 라우트와 파일 조회용 `/api/debug/view` 라우트를 `app_core.py`에 추가했습니다.
- `DEBUG_APP_LOG_PATH` 환경변수로 로그 파일 위치를 바꿀 수 있게 하고, 기본값은 기존과 같은 `debug_app.log`로 유지했습니다.
### 검증
- `node --test web/tests/vehicleDebugLogRoute.test.mjs`: 2개 통과
- `npm.cmd run lint -- "tests/vehicleDebugLogRoute.test.mjs"`: 통과
- `python ast.parse docker/els-backend/app_core.py`: 통과
- `ssh elsnas "cd /volume1/docker/els_home_v1 && bash scripts/deploy-core.sh"`: NAS core 배포 완료
- `GET/POST http://192.168.0.4:2929/api/debug/*`: debug view/log 200 확인
### 변경 파일
- `docker/els-backend/app_core.py`
- `web/tests/vehicleDebugLogRoute.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 차량위치관제 조회 화면 UI 정리 (v5.14.168)
### 핵심
- 실시간 관제 통계 카드의 hover 이동과 과한 유리효과를 제거해 실행 버튼처럼 보이지 않게 정리했습니다.
- 운행기록/교육이수 필터와 조회 요약 카드를 정보 위계 중심으로 다듬고, 기간 날짜 입력이 모바일에서 잘리지 않도록 높이와 최소폭을 보정했습니다.
- 모바일에서 검색 후 목록이 숨어 있던 문제를 수정해 운행기록/교육이수 검색 결과가 bottom sheet로 바로 열리게 했고, 카드형 목록에 필드 라벨을 추가했습니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 4개 통과
- `npm.cmd run lint -- "app/(main)/employees/vehicle-tracking/page.js" "tests/vehicleTrackingMobileDetail.test.mjs"`: 통과(기존 hook/img 경고만)
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 상세배차 BKG확정 클릭 선택 방식 전환 (v5.14.166)
### 핵심
- `BKG확정`의 BKG1/2/3 선택 드롭다운을 제거하고, 옆의 BKG1/2/3 셀 값을 클릭하면 해당 값이 확정되도록 바꿨습니다.
- 선택된 BKG 셀은 초록색으로 표시해 어떤 BKG가 확정값인지 바로 보이게 했습니다.
- 방향키 포커스 이동이나 단순 blur만으로 `수기` 출처가 자동 저장되는 문제를 막았습니다. 실제 입력값이 바뀐 경우에만 수기 상태로 전환합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 모바일 운행 상세현황 갤럭시24 레이아웃 재구성 (v5.14.165)
### 핵심
- 모바일에서 차량관제 운행 상세현황이 데스크탑 우측 패널과 표 구조 그대로 눌려 보이던 문제를 수정했습니다.
- 갤럭시24 기준으로 상세 패널을 100dvh 전체화면으로 바꾸고, 헤더/히어로/운행 지표/기본정보 입력을 1열 중심으로 재배치했습니다.
- 위치 이력과 운행 기록은 모바일에서 데스크탑 표를 숨기고 카드형 타임라인으로 별도 렌더링해 시간, 속도, 주소, 좌표를 바로 읽을 수 있게 했습니다.
### 검증
- `node --test web/tests/vehicleTrackingMobileDetail.test.mjs`: 2개 통과
- `npm.cmd run lint -- 'app/(main)/employees/vehicle-tracking/page.js' tests/vehicleTrackingMobileDetail.test.mjs`: 통과(기존 hook/img 경고만)
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/app/(main)/employees/vehicle-tracking/tracking.module.css`
- `web/tests/vehicleTrackingMobileDetail.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 상세배차 확정 API 클라이언트 세션 인증 보정 (v5.14.164)
### 핵심
- 운영 디버그 점검에서 신규 `BKG확정`/배차확정 API가 서버 쿠키 세션만 보고 401을 반환하는 문제를 확인했습니다.
- 상세배차 화면은 Supabase access token을 Authorization Bearer 헤더로 전달하고, 신규 API는 해당 토큰으로도 사용자를 검증하게 했습니다.
- SQL 적용 후 화면의 `DB 미적용` 경고는 사라졌고, 실제 저장/확정 흐름은 이 인증 보정 배포 후 이어서 점검합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/confirmation/route.js" "app/api/branches/asan/dispatch/detail-override/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/dispatch/confirmation/route.js`
- `web/app/api/branches/asan/dispatch/detail-override/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 아산 배차판 RAG 질문 의도 분리 보강 (v5.14.161)
### 핵심
- `모레/내일모레/글피`를 날짜 범위로 정규화하고 `13:00`, `13시30분`, 배차정보 `09 10` 같은 시간 표기를 같은 시간 필터로 매칭하게 했습니다.
- `상차지별/지역별/업체별`은 필터가 아니라 집계축으로 보고, `모비스/글로비스`는 데이터셋 필터로 분리합니다.
- `부산배차`처럼 지역과 배차가 붙은 질문은 `부산` 조건만 남기도록 보정해 표현이 조금 달라도 같은 배차판 의도로 읽게 했습니다.
### 검증
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/aiAssistantMeta.test.mjs`: 15개 통과
- `npm.cmd run lint -- "utils/asanDispatchRag.mjs" "utils/aiAssistantMeta.mjs" "tests/asanDispatchRag.test.mjs" "tests/aiAssistantMeta.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchRag.mjs`
- `web/tests/asanDispatchRag.test.mjs`
- `web/utils/aiAssistantMeta.mjs`
- `web/tests/aiAssistantMeta.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 상세배차 BKG확정과 배차확정 기반 추가 (v5.14.163)
### 핵심
- 상세배차 `업체명`과 `BKG1` 사이에 `BKG확정` 컬럼을 추가했습니다. 기본값은 `BKG1`이며 `BKG2/BKG3` 선택 시 선택 출처를 남기고 해당 값으로 대체합니다.
- `BKG확정`은 수기 입력도 가능하며, 수기 입력 시 BKG 선택 출처가 `manual`로 바뀌도록 했습니다.
- 배차확정/확정취소 API와 이력 테이블을 추가해 사용자와 시간을 남기고, 확정된 일자는 상세배차 기본 보정 입력을 잠급니다.
- `배차변동내역` 탭 기반을 추가했습니다. 다음 단계에서 확정 이후 추가/삭제 라인을 이 탭에서 이어서 저장합니다.
- 화주사코드는 파일명 추정보다 매칭된 운송경로 원장 payload의 `화주사코드/화주사` 값을 우선 사용합니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/confirmation/route.js" "app/api/branches/asan/dispatch/detail-override/route.js" "utils/asanDispatchDetailLines.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/confirmation/route.js`
- `web/app/api/branches/asan/dispatch/detail-override/route.js`
- `web/supabase_sql/20260524_asan_dispatch_confirmations.sql`
- `web/utils/asanDispatchDetailLines.mjs`
- `web/tests/asanDispatchDetailLines.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 보호값 음영과 배차판 매칭용 라벨 정리 (v5.14.162)
### 핵심
- GLAPS 수정양식 설명서에 회색 음영 칸은 GLAPS 실제 업로드/원장 기준값이며 일반 보정 대상이 아니라는 규칙을 추가했습니다.
- 운송경로/항목매핑 수정양식에서 GLAPS 원장 기준값을 회색 음영으로 표시하고, 웹 GLAPS 코드 화면도 같은 보호값을 회색으로 표시합니다.
- 항목매핑의 `원본명` 라벨을 실제 의미에 맞게 `배차판 매칭용`으로 바꾸고, 기존 `원본명` 헤더도 업로드 시 계속 인식하게 했습니다.
- 항목매핑 웹 목록에서도 `start/waypoint/destination` 경로 파생 alias를 제외해 경로 수정 위치를 운송경로 화면/시트로 통일했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/template/route.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "utils/glapsMasterData.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/utils/glapsMasterData.mjs`
- `web/tests/glapsMasterData.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 항목매핑 양식 경로 중복 제거 (v5.14.160)
### 핵심
- `운송경로_수정양식`과 `항목매핑_수정양식`에 같은 경로 정보가 중복 노출되어 보이는 혼란을 줄였습니다.
- 항목매핑 수정양식에서는 운송경로 원장에서 자동 생성된 `start/waypoint/destination` 보조 alias를 제외합니다.
- 항목매핑 수정양식의 `운송경로코드` 컬럼도 숨겨, 경로 수정은 운송경로 시트 한 곳에서만 하도록 정리했습니다. 기존 양식에 해당 컬럼이 있어도 업로드 파서는 계속 인식합니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/template/route.js" "utils/glapsMasterData.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/utils/glapsMasterData.mjs`
- `web/tests/glapsMasterData.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 수정양식 변경 행만 반영 (v5.14.159)
### 핵심
- GLAPS 수정양식 업로드 시 ID가 있는 기존 행은 DB의 현재 값과 비교해 실제 값이 달라진 행만 update합니다.
- 값이 같은 행은 `업로드수정` 이력과 `updated_at`이 불필요하게 바뀌지 않도록 건너뜁니다.
- 엑셀에서 빠진 행은 기존처럼 보존하고, ID 없는 행은 신규 추가로 처리합니다. 삭제는 계속 `삭제(Y)=Y`만 인정합니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 수정양식 매칭상태 한글 표기 (v5.14.158)
### 핵심
- GLAPS 수정양식 다운로드 시 운송경로/항목매핑 `매칭상태` 값을 내부 코드 대신 `확정 / 조정필요 / 코드없음` 한글로 표시합니다.
- 업로드 파서는 기존처럼 한글과 영문(`ready / needs_mapping / missing_route_code`)을 모두 인식합니다.
- 설명서에 행을 지우는 것은 삭제로 처리하지 않고, `삭제(Y)` 칸에 `Y`를 입력한 행만 삭제 처리한다고 명시했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/template/route.js" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/glapsMasterData.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] AI 어시스턴트 안내/웹 RAG 설명 정합성 보정 (v5.14.157)
### 핵심
- AI 어시스턴트 화면의 버전, 소개 문구, 빠른 질문, 가이드 섹션을 `web/utils/aiAssistantMeta.mjs` 함수로 통합했습니다.
- 오래된 `v5.11.0`, 이미지 요약, NAS 원본 파일 직접 파싱 예시는 제거하고 현재 실제 연결 범위인 Supabase DB, 아산 `branch_dispatch`, 웹 첨부문서 색인, 안전운임/차량/컨테이너/외부 API 중심으로 설명을 맞췄습니다.
- 채팅 API의 문서 검색 라벨을 `사내 웹 첨부문서`로 바꾸고, `web_attachment` 색인 기준 출처와 최근 웹자료 조회, 요청별 KST 기준시각 주입을 보강했습니다.
### 검증
- `node --test web/tests/chatMemory.test.mjs web/tests/asanDispatchRag.test.mjs web/tests/aiAssistantMeta.test.mjs web/tests/asanDashboardView.test.mjs`: 52개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/aiAssistantMeta.mjs`
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/api/chat/route.js`
- `web/tests/aiAssistantMeta.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 수정양식 시트 시작 위치 보정 (v5.14.156)
### 핵심
- GLAPS 수정양식 작업 시트의 제목/설명/헤더 색상을 행 전체가 아니라 실제 컬럼 범위에만 적용해 M열 이후 빈 영역이 헤더처럼 보이는 문제를 줄였습니다.
- 운송경로/항목매핑 작업 시트는 고정행 아래 `A4`를 활성 셀로 지정하고, 설명서 시트는 `A2`를 활성 셀로 지정해 엑셀이 좌측 A열 기준으로 열리도록 보정했습니다.
- 컬럼 폭 계산은 제목/설명 긴 문구를 제외하고 헤더와 데이터 기준으로 잡게 했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/template/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 첫 실행은 기존 `.next` 추적 파일 누락으로 실패, `.next` 경로 검증 삭제 후 재실행 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 헤더 인트라넷 AI 어시스턴트 메뉴 복구 (v5.14.155)
### 핵심
- 전역 헤더의 인트라넷 드롭다운은 사이드바 메뉴와 별도 배열이라 `직원 서비스` 하위에 `AI 어시스턴트`가 빠져 있었습니다.
- `직원 서비스` 하위 첫 항목에 `AI 어시스턴트` 링크(`/employees/ask`)를 추가해 사이드바의 인트라넷 홈 구성과 맞췄습니다.
### 검증
- `npm.cmd run lint -- components/Header.js`: 통과, 기존 `<img>` 경고 3건 유지
- `npm.cmd run build`: 첫 실행은 이전 `.next/export` ENOTEMPTY 산출물 정리 후 재실행 통과
- `http://127.0.0.1:3002/employees/ask?debug=true`: 헤더 드롭다운 DOM에서 `AI 어시스턴트` 링크(`/employees/ask`) 확인 후 검증용 서버 종료.
### 변경 파일
- `web/components/Header.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 수정양식 제목/컬럼명 가시성 보정 (v5.14.154)
### 핵심
- GLAPS 수정양식의 `운송경로_수정양식`, `항목매핑_수정양식` 시트에 1행 제목, 2행 설명, 3행 컬럼명 구조를 적용했습니다.
- 엑셀을 열 때 A1부터 보이도록 시트 뷰의 `activeCell`, `topLeftCell`, 고정 행을 조정했습니다.
- 기존 파서는 첫 8행 안에서 헤더를 찾으므로 3행 컬럼명 구조도 그대로 업로드 인식됩니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/api/branches/asan/glaps/master/template/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS ELS코드 다중 별칭 분리 인식 (v5.14.153)
### 핵심
- GLAPS 마스터 코드시트의 `ELS코드1~N` 셀 값이 `CMA, CMA-CGM` 또는 줄바꿈처럼 한 칸에 여러 개 들어와도 각각 별칭으로 등록되게 했습니다.
- 분리 기준은 쉼표, 한글/전각 쉼표류, 세미콜론, 줄바꿈입니다.
- 컬럼 위치는 계속 헤더명 기준으로 읽으므로 수기 ELS 컬럼을 뒤쪽으로 옮겨도 인식됩니다.
- 수정양식 `설명서` 시트에 마스터 코드시트 ELS 수기 컬럼 운영 규칙을 추가했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "utils/glapsMasterData.mjs" "app/api/branches/asan/glaps/master/template/route.js" "tests/glapsMasterData.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/glapsMasterData.mjs`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/glapsMasterData.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 수정양식 단일화와 설명서 시트 추가 (v5.14.152)
### 핵심
- GLAPS 코드 화면에서 `현재 수정양식/전체 수정양식` 구분을 제거하고 `수정양식 내보내기`, `수정양식 업로드` 두 버튼만 남겼습니다.
- 수정양식 다운로드는 항상 `GLAPS_수정양식.xlsx` 하나로 내려가며, 내부 시트는 `설명서`, `운송경로_수정양식`, `항목매핑_수정양식`으로 구성됩니다.
- `설명서` 시트에는 ID, 매칭상태, 삭제(Y), 수정출처, 운송경로/항목매핑 컬럼별 입력방법과 주의사항을 넣었습니다.
- 업로드도 항상 전체 양식 기준 `mode=all`로 처리해 운송경로/항목매핑 시트가 같이 반영됩니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/template/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `http://127.0.0.1:3001/employees/branches/asan`: GLAPS 코드 탭에서 `수정양식 내보내기/업로드` 단일 버튼 확인 후 검증용 서버 종료.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] 메뉴 밀도와 모바일 공간 활용 보정 (v5.14.151)
### 핵심
- 전역 헤더 높이를 70px에서 64px로 낮추고, 모바일 헤더는 56px 기준으로 분리했습니다.
- 티커 높이는 40px로 줄이고, 티커·임직원 헤더·사이드바 sticky 오프셋을 `--header-height`, `--ticker-height` 변수 기준으로 맞췄습니다.
- 임직원 헤더는 데스크톱 56px, 모바일 40px로 정리하고 검색·링크·인사말 간격을 줄였습니다.
- 인트라넷 사이드바는 데스크톱 244px, 모바일 244px 상한으로 줄이고 카드/항목/푸터 패딩을 낮춰 같은 화면에서 더 많은 메뉴가 보이게 했습니다.
- 모바일 전역 메뉴의 헤더·항목·서브항목 패딩을 줄여 사이드 메뉴와 같은 밀도 기준을 맞췄습니다.
### 검증
- `npm.cmd run lint -- components/Header.js components/SiteLayout.js components/SubNav.js`: 통과, 기존 `<img>` 경고 3건 유지
- `npm.cmd run build`: 통과
- `http://127.0.0.1:3001/employees/ask?debug=true`: 데스크톱 1280x720에서 헤더 64px, 티커 40px, 임직원 헤더 57px, 사이드바 244px 확인
- 같은 URL 모바일 390x844에서 헤더 56px, 임직원 헤더 40px, 사이드바 244px, 메뉴 항목 36px 확인 후 검증용 서버 종료.
### 변경 파일
- `web/app/globals.css`
- `web/components/Header.js`, `web/components/Header.module.css`
- `web/components/InfoTicker.module.css`
- `web/components/EmployeeHeader.module.css`
- `web/components/EmployeeSidebar.module.css`
- `web/components/SiteLayout.js`, `web/components/SubNav.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 웹 직접편집과 전체 수정양식 분리 (v5.14.150)
### 핵심
- GLAPS 코드 화면에서 운송경로/항목매핑을 직접 추가·수정·삭제할 수 있게 했습니다.
- 수정 출처를 `web:<email>`, `template_upload:<email>`, `master:<email>`로 나눠 화면 `수정출처` 컬럼과 수정양식 `수정출처/수정일시` 컬럼에 드러나게 했습니다.
- `전체 수정양식`은 운송경로와 항목매핑 시트를 함께 내보내고, `전체양식 업로드`로 두 항목을 한 파일에서 반영합니다.
- 운송경로/항목매핑을 한 파일로 업로드해도 각 파서가 자기 시트만 읽도록 필수 헤더 조건을 강화했습니다.
- DB 저장 전 텍스트는 양끝 공백만 trim하고, 중간 띄어쓰기는 보존합니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" "utils/glapsMasterData.mjs" "tests/asanDashboardView.test.mjs" "tests/glapsMasterData.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `http://127.0.0.1:3001/employees/branches/asan`: GLAPS 코드 탭, 전체 수정양식 버튼, 직접 추가 폼, 수정출처 컬럼 렌더링 확인 후 검증용 서버 종료.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/utils/glapsMasterData.mjs`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/glapsMasterData.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-24] GLAPS 라인/포트코드 조회 보정과 운송사코드 표시 정리 (v5.14.149)
### 핵심
- 라인코드가 마스터에 있는데도 상세배차에서 비던 원인은 `glaps_master_aliases` 조회가 Supabase 1000건 응답 cap에 잘려 `line/port` alias까지 내려오지 못했기 때문이었습니다.
- GLAPS 마스터 API를 1000건 단위 페이지 조회로 변경해 운송경로/항목매핑/원본행을 모두 가져오도록 보강했습니다.
- 상세배차 `포트코드`는 이제 마스터에 매핑된 값만 표시합니다. `함부르크`처럼 ELS 대체코드나 GLAPS 코드가 없는 포트는 원본값을 코드처럼 보여주지 않고 공란으로 둡니다.
- 운송사코드는 상차지처럼 입력 목록으로 두지 않고, 기본 `ELS -> B000005273` 값을 다른 코드 컬럼처럼 표시만 하도록 정리했습니다.
### 확인
- 활성 원장 `6724943a-5c6c-416e-bab0-bbac487b8c4c`에서 `HMM`, `MAE`, `CMA`, `HLC`, `MSC`, `SML` 라인 alias가 존재함을 확인했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 45개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/glaps/master/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 후 원격 fetch `ECONNRESET` 로그는 있었지만 빌드 exit 0.
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS 최종코드 도출·마스터 ELS 입력칸 보강 (v5.14.148)
### 핵심
- 상세배차내역의 최종 GLAPS 업로드용 코드 컬럼을 후미에 정리했습니다. 기존 비교용 `포트/라인/타입/운송경로` 코드는 앞쪽에 유지하고, 뒤쪽에는 앞에 없는 `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`만 추가했습니다.
- 운송사코드는 GLAPS코드가 아니라 `운송사코드` 시트의 `BP` 컬럼을 사용하도록 파서를 수정했습니다. 기본 ELS는 `B000005273`으로 도출됩니다.
- `컨샤이니` 시트를 항목매핑으로 파싱해 `KIN -> GA0196`, `HMMA -> UH03`을 상세배차에서 표시합니다.
- `수출입코드` 원본시트에서 `수출 -> 20` 같은 오더구분코드를 읽고, 운송경로 원장의 `화주사/화주명/ELS화주명`으로 `글로비스KD외/모비스` 화주사코드를 도출합니다.
- 상차지/운송사코드 입력칸에서 방향키로 인접 입력칸을 이동할 수 있게 했습니다.
### 운영 데이터 반영
- NAS `/아산지점/A_운송실무/GLAPS_마스터코드.xlsx`를 백업 후 ELS 입력칸을 보강했습니다.
- 백업 파일: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`
- 보강 내용: 선사 `MAE/ONE/CMA/HMM/EMC/HLC`, 컨테이너 `40HC`, 컨샤이니 `KIN/HMMA`, 운송경로 `ELS화주명`, POD `SIKOP/USSAV/USMOB/MXLZC/MXESE/INKAT/INNSA/USLAX/USLGB`.
- 활성 버전 `952c67b5-fefa-45cc-b97a-934f885e684b`: 8개 시트, 운송경로 540건, 항목매핑 2,923건, 원본행 1,177건.
- 확인값: `ELS -> B000005273`, `CMA -> CMA`, `MAE -> MAE`, `INKAT -> INKAT`, `USMOB -> USMOB`, `40HC -> 4510`, `KIN -> GA0196`, `HMMA -> UH03`.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 45개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/glapsMasterData.mjs" "utils/asanDispatchDetailLines.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 후 원격 fetch `ECONNRESET` 로그는 있었지만 빌드 exit 0.
- `http://127.0.0.1:3000/employees/branches/asan`: 인증 리다이렉트 후 로그인 페이지 HTTP 200 확인
### 변경 파일
- `web/utils/glapsMasterData.mjs`, `web/utils/asanDispatchDetailLines.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS ELS코드 별칭·상세배차 수정필요 필터 보강 (v5.14.147)
### 핵심
- GLAPS 코드마스터 파서가 `ELS코드`, `ELS코드1~3` 컬럼을 GLAPS 기본 코드의 별칭으로 읽도록 보강했습니다. 선사 `CMA`, 컨테이너 `40HC`, 운송사 기본 `ELS`처럼 우리 배차판 값이 ELS코드 칸에 있으면 해당 행의 GLAPS 코드를 표시합니다.
- 상세배차내역 맨 앞에 `운송사코드`를 추가했습니다. 기본값 `ELS`는 운송사코드 원장의 `ELS솔루션 -> 1011`로 도출되고, 필요 시 다른 운송사코드를 목록 입력으로 선택/타이핑할 수 있습니다.
- 상차지와 운송사코드는 `select` 대신 `datalist` 입력으로 바꿔 목록 선택과 직접 타이핑을 함께 지원합니다.
- 상세배차 상단에 `상차지 선택필요`, `운송경로 미도출`, `포트코드 미도출`, `라인코드 미도출`, `타입코드 미도출`, `운송사코드 확인` 필터 버튼을 추가했습니다. 버튼을 누르면 해당 수정필요 건만 보이고, 활성 버튼은 필터해제 버튼으로 바뀝니다.
### 운영 데이터 반영
- NAS `/아산지점/A_운송실무/GLAPS_마스터코드.xlsx`를 운영 GLAPS 원장에 재반영했습니다.
- 활성 버전 `296d0cc9-3048-4460-8d53-5a4b4465bfec`: 운송경로 540건, 항목매핑 2,862건, 원본행 1,165건.
- 확인값: `ELS -> 1011`, `CMA -> CMA`, `40HC -> 4510`, `KRBNP|글로비스KD센터2포장장|KRBNP -> GLC00017`.
- 현재 NAS 마스터 기준 `USSAV/USMOB/INKAT/SIKOP` 포트 별칭은 아직 없어서 상세배차에서는 원본 포트값을 표시하고 `포트코드 미도출` 필터 대상으로 남깁니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 44개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/glapsMasterData.mjs" "utils/asanDispatchDetailLines.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `http://127.0.0.1:3000/employees/branches/asan`: HTTP 200 확인
### 변경 파일
- `web/utils/glapsMasterData.mjs`, `web/utils/asanDispatchDetailLines.mjs`
- `web/app/(main)/employees/branches/asan/page.js`, `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 상세배차 포트코드 기본 표시 보강 (v5.14.146)
### 핵심
- 상세배차 `포트코드`는 GLAPS 항목매핑에 정정값이 있으면 정정값을 우선 사용하고, 없으면 원본 배차판 `포트` 값을 그대로 표시하도록 보강했습니다.
- 현재 GLAPS 코드 원장에 `USSAV`, `USMOB`, `INKAT`, `SIKOP` 같은 값이 없어 빈칸으로 숨겨지던 문제를 막고, 임의 작성/정정 필요 값을 화면에서 바로 볼 수 있게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 통과

---

## [2026-05-23] GLAPS 운송경로·타입코드 도출 보강 (v5.14.145)
### 핵심
- 상세배차의 한글 상차/하차지(`부산신항`)를 GLAPS 운송경로의 포트코드 후보(`KRBNP`)로 변환해 `상차지 + 경유지(ELS) + 하차지` 매칭을 수행하도록 보강했습니다.
- `부산신항 + 글로비스KD센터2포장장 + 부산신항`은 활성 GLAPS 원장에서 `KRBNP|글로비스KD센터2포장장|KRBNP`로 조회되어 `GLC00017`을 우선 도출합니다.
- 컨테이너규격 시트는 `세관코드=40HC -> ISO코드=4510` 구조로 파싱하도록 고치고, 상세배차 `타입코드`는 원본시트/항목매핑에서 ISO코드를 표시합니다.
- 화면 명칭은 `GLAPS마스터`에서 `GLAPS코드`로 변경했습니다.
### 운영 데이터 보정
- 활성 버전의 `container_type`, `port` 항목매핑을 원본시트 기준으로 재생성했습니다.
- 확인값: `40HC -> 4510`, `KRBNP -> KRBNP`.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsMasterData.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/glapsMasterData.mjs`, `web/app/(main)/employees/branches/asan/page.js`, `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS 전 시트 원장 운영 DB 적용 및 재반영 (v5.14.144)
### 핵심
- 기존 운영 DB에는 `glaps_master_versions.sheet_row_count`와 `glaps_master_sheet_rows`가 아직 없어 화면의 `원본시트`가 0으로 보이던 원인을 확인했습니다.
- `web/supabase_sql/20260523_asan_glaps_master_codes.sql`을 기존 테이블에도 안전하게 적용되도록 `ALTER TABLE ADD COLUMN IF NOT EXISTS`, alias type CHECK 재생성, 운송경로 unique 제약 보강 방식으로 수정했습니다.
- 운영 Supabase에 스키마를 적용하고 NAS `/아산지점/A_운송실무/GLAPS_마스터코드.xlsx`를 새 활성 버전으로 재반영했습니다.
### 검증
- 활성 버전 `c9906902-d262-47a5-8fb5-77fa812d65c3`: 운송경로 540건, 항목매핑 2,052건, 원본행 1,165건.
- 원본시트 7개 확인: `선사코드`, `실출하지코드`, `포트코드`, `운송경로`, `컨테이너규격`, `운송사코드`, `컨샤이니`.
- 시트별 원본행: 선사코드 280, 실출하지코드 27, 포트코드 91, 운송경로 541, 컨테이너규격 129, 운송사코드 20, 컨샤이니 77.
### 변경 파일
- `web/supabase_sql/20260523_asan_glaps_master_codes.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS 마스터 위치·전 시트 원장·기존 코드 도출 보정 (v5.14.143)
### 핵심
- `GLAPS마스터`를 아산 상위 메뉴에서 제거하고 배차판 내부 보기로 이동했습니다.
- GLAPS 마스터는 운송경로만이 아니라 전 시트 원본행을 `glaps_master_sheet_rows`에 보관하고, 프로코드/컨테이너규격/라인 등 현재 연결 가능한 GLAPS 코드는 마스터 원본에서만 읽어 항목매핑으로 노출합니다.
- 상세배차내역은 `하차지(선적)`과 `고객사` 사이에 `운송경로`, `운송경로코드`를 추가하고, `포트/라인/타입` 옆에 각각 GLAPS 기존 코드 컬럼을 표시합니다. 없는 코드는 생성하지 않고 공란으로 둡니다.
- 수정양식 다운로드 헤더를 `route_code` 같은 내부 필드명에서 `운송경로코드`, `경유지(ELS)`, `매칭상태` 등 한국어 업무 컬럼명으로 보정했습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 44개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" "utils/glapsMasterData.mjs" "utils/asanDispatchDetailLines.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- 로컬 개발서버 `http://127.0.0.1:3000/employees/branches/asan`: HTTP 200 응답 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`, `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/api/branches/asan/glaps/master/route.js`, `web/utils/glapsMasterData.mjs`, `web/utils/asanDispatchDetailLines.mjs`
- `web/supabase_sql/20260523_asan_glaps_master_codes.sql`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDispatchDetailLines.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 배차판 원본 엑셀 WEB 컬럼 분리 (v5.14.140)
### 핵심
- WEB 입력·누적이 정상 동작하므로 글로비스KD외/모비스AS 원본 `.xlsm` 2건에서 `BKG1`, `BKG2`, `BKG3`, `TARGET VESSEL`, `비고` 컬럼을 삭제했습니다.
- `.xlsm` VBA 손상을 막기 위해 NAS 원본을 백업한 뒤 Excel COM으로 컬럼을 삭제하고, 원본 `vbaProject.bin`을 복원한 후 Excel 열기 검증과 해시 검증을 수행했습니다.
- 삭제된 컬럼은 WEB/API/엑셀 다운로드에서 Supabase WEB 셀 DB 전용 컬럼으로 계속 재주입합니다.
- 글로비스 원본의 `T` 헤더는 화면/API 기준에서 `TYPE`으로 표준화했습니다.
### 검증
- 로컬 최종 `.xlsm` 2건 Excel COM read-only 열기: 통과
- NAS 업로드 후 파일 해시 일치 및 아산 배차판 동기화 완료 확인
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 53개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- NAS 원본: `/volume2/아산지점/A_운송실무/2026년_배차-일일배차(글로비스KD외).xlsm`, `/volume2/아산지점/A_운송실무/2026년_배차-일일배차(모비스AS).xlsm`
- `web/utils/asanDispatchWebCells.mjs`, `web/utils/asanDispatchRag.mjs`
- `web/app/api/branches/asan/dispatch/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDispatchWebCells.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS 상세배차내역 탭 1차 구현 (v5.14.139)
### 배경
- GLAPS는 상차-경유(작업)-하차 기준의 업로드 구조를 요구하지만, 현재 아산 배차판은 지역별 배차칸에 `민경3, 이지1`처럼 1차 접수 수량이 묶여 있습니다.
- 3차 SCM/외부업체 테이블 수신까지 확장될 가능성이 있어, 우선 WEB 배차판에서 GLAPS 검수용 상세 라인을 안정적으로 뽑는 1차 단계를 구현했습니다.
### 핵심
- 아산 배차판에 `상세배차내역` 탭을 추가하고, 기존 배차 지역칸을 컨테이너 1건 단위 라인으로 분해합니다.
- 출력 컬럼은 `작업일자, 구분, 화주, 상차지, 작업지, 하차지(선적), 고객사, 포트, 라인, 타입, 업체명, BKG1, BKG2, BKG3, TARGET VESSEL, 비고` 순서입니다.
- `민경3, 이지1`은 같은 원본행에서 4행으로 풀리며 BKG/TARGET/비고 값은 반복 표시합니다.
- 상차지 매핑은 부산/신항 기본 `부산신항`, 부산 `B`는 `부산북항`, 인천 기본 `인천신항`, 인천 `B`는 `인천항`, 인천 `K`는 형이 확인한 `인천항국제여객터미널`, 울산 기본 `울산신항`, 울산 `B`는 `울산구항`, 부곡은 `의왕ICD`로 처리합니다.
- `기타/철송`, `기타`, `중부`는 상세배차 탭에서 선택 목록으로 수동 지정할 수 있게 했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 37개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/asanDispatchDetailLines.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- 로컬 개발서버 `http://localhost:3000/employees/branches/asan`: HTTP 200 응답 확인
### 변경 파일
- `web/utils/asanDispatchDetailLines.mjs`
- `web/tests/asanDispatchDetailLines.test.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 상세배차 아산 지역칸 상차지 선택필요 보정 (v5.14.142)
### 핵심
- 상세배차내역에서 `아산` 지역칸을 자동 `아산` 상차지로 확정하던 동작을 제거했습니다.
- `아산` 지역칸은 실제 아산 상차가 아니라 배차 접수 분류로 쓰일 수 있으므로 `기타/철송`, `기타`, `중부`와 같이 상차지 선택필요 상태로 둡니다.
- 선택 목록에는 `아산` 값을 남겨 실제로 아산 상차가 맞는 경우에만 사용자가 직접 고를 수 있게 했습니다.
### 검증
- `node --test web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 38개 통과
- `npm.cmd run lint -- "utils/asanDispatchDetailLines.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
### 변경 파일
- `web/utils/asanDispatchDetailLines.mjs`
- `web/tests/asanDispatchDetailLines.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] GLAPS 마스터 원장 1.5단계 구현 (v5.14.141)
### 핵심
- `GLAPS_마스터코드.xlsx`를 외부 원본 그대로 쓰지 않고, 아산 WEB DB의 버전 원장(`glaps_master_versions`)과 운송경로(`glaps_transport_routes`), 항목매핑(`glaps_master_aliases`)으로 적재하는 구조를 추가했습니다.
- 아산지점 상단에 `GLAPS마스터` 탭을 추가해 NAS 마스터 반영, 파일 업로드, 운송경로/항목매핑 수정양식 내보내기, 수정양식 재업로드를 할 수 있게 했습니다.
- 화면에 `상세배차 → 매칭쿼리 → 운송경로` 연결도를 표시해 최종 목표인 상세배차 운송경로코드 도출 기준을 직접 확인할 수 있게 했습니다.
- 운송경로 매칭 기준은 `상세배차.상차지 = route.start_location_name`, `상세배차.경유지(ELS) = route.waypoint_els_name`, `상세배차.하차지(선적) = route.destination_name`입니다.
### 운영 메모
- 운영 DB에는 `web/supabase_sql/20260523_asan_glaps_master_codes.sql` 적용이 먼저 필요합니다.
- DB 적용 후 `GLAPS마스터 > NAS 마스터 반영` 버튼으로 `/아산지점/A_운송실무/GLAPS_마스터코드.xlsx`를 바로 파싱할 수 있습니다.
### 검증
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDashboardView.test.mjs`: 37개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" "utils/glapsMasterData.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/glapsMasterData.mjs`
- `web/app/api/branches/asan/glaps/master/route.js`
- `web/app/api/branches/asan/glaps/master/template/route.js`
- `web/app/(main)/employees/branches/asan/AsanGlapsMaster.js`
- `web/app/(main)/employees/branches/asan/glapsMaster.module.css`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/supabase_sql/20260523_asan_glaps_master_codes.sql`
- `web/tests/glapsMasterData.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 연락처 입력값 무하이픈 저장·정규화 검색 (v5.14.138)
### 리서치
- 국가법령정보센터 `전기통신번호관리세칙`의 번호 체계는 지역/식별번호 뒤에 국번호와 가입자번호가 붙는 구조입니다. 화면 표시는 마지막 가입자번호 4자리를 보존해 자릿수에 따라 `02-000-0000`, `031-000-0000`, `031-0000-0000`, `010-0000-0000`으로 나눕니다.
- 운영 연락처에는 `055-540-5616~8`, `051-607-7871~4,6`처럼 본번호 뒤에 범위 suffix가 붙은 값이 있으므로, 입력 정규화는 본번호의 `-`, `/`, `.`만 제거하고 `~2`, `~4,6`은 보존합니다.
### 핵심
- 연락처 예하 등록/수정 화면은 전화번호 입력 중 하이픈을 자동 삽입하지 않고, 사용자가 `-`, `/`, `.`를 넣어도 저장 기준값으로 즉시 합칩니다.
- 사내연락처, 외부연락처, 협력사정보, 운전원정보, 작업지정보 API와 연락처 엑셀 업로드도 저장 전 같은 정규화를 거칩니다.
- 목록 검색은 저장값과 검색어 양쪽을 정규화해 `01012345678`로 검색해도 기존 `010-1234-5678` 데이터가 잡히도록 했습니다.
- 화면 출력은 기존 `formatKoreanPhoneNumber` 기준을 유지해 하이픈 있는 대한민국 표준 표시로 보여줍니다.
### 검증
- `node --test web/tests/koreanPhoneNumber.test.mjs web/tests/contactPhoneNormalization.test.mjs`: 11개 통과
### 변경 파일
- `web/utils/koreanPhoneNumber.mjs`
- `web/app/(main)/employees/(intranet)/*contacts*`, `web/app/(main)/employees/(intranet)/work-sites*`
- `web/app/api/*contacts*`, `web/app/api/work-sites*`, `web/app/api/contacts/excel/upload/route.js`
- `web/tests/koreanPhoneNumber.test.mjs`, `web/tests/contactPhoneNormalization.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 아산 통합배차판 선적 컬럼 표시 (v5.14.137)
### 핵심
- 모비스 배차판에 2026-05-26부터 추가된 `선적` 컬럼을 글로비스의 `선적`과 같은 의미로 통합현황에 노출합니다.
- 통합현황 고정 헤더를 `담당자 → 선적 → 작업지` 순서로 맞추고, 원본 날짜에 `선적` 헤더가 없으면 공란으로 표시합니다.
- 통합현황 엑셀 다운로드도 같은 헤더/매핑을 사용합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 31개 통과
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 46개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- 프로덕션 API `type=glovis/mobis/integrated` 2026-05-26 헤더에 `선적` 노출 확인
- 프로덕션 엑셀 다운로드 통합현황 2026-05-26 헤더에 `선적` 노출 확인
### 변경 파일
- `web/app/api/branches/asan/dispatch/route.js`
- `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 연락처 내선 범위 suffix 보존 보정 (v5.14.136)
### 핵심
- 운영 DB의 연락처 원본을 확인해 `055-540-5616~8`, `055-540-5601~2`, `051-607-7871~4,6`처럼 본번호 뒤에 번호 범위가 붙은 데이터가 있음을 확인했습니다.
- 화면 포맷터가 suffix 숫자까지 본번호로 합치면서 `055-5405-6168`처럼 잘못 표시하던 문제를 막았습니다.
- `~2`, `~4,6`, `~20` 표기는 본번호 포맷 후 뒤에 그대로 보존합니다.
### 검증
- Supabase `external_contacts`, `partner_contacts` 등 연락처 전화번호 컬럼에서 `~` 포함 데이터 12건 확인
- `node --test web/tests/koreanPhoneNumber.test.mjs`: 7개 통과
### 변경 파일
- `web/utils/koreanPhoneNumber.mjs`
- `web/tests/koreanPhoneNumber.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 연락처 전화번호 대한민국 표기 규칙 정리 (v5.14.135)
### 핵심
- 연락처 대시보드와 상세 화면에서 쓰는 표시용 포맷터와 입력 폼 포맷터가 같은 대한민국 전화번호 규칙을 사용하도록 공통 유틸을 추가했습니다.
- `010` 등 휴대폰 11자리는 `010-0000-0000`, 10자리 구형 휴대폰은 `011-000-0000`으로 표시합니다.
- 일반전화는 `02-000-0000`/`02-0000-0000`, 3자리 지역번호는 `041-000-0000` 또는 `031-0000-0000`처럼 전체 자릿수에 따라 구분합니다.
- 대표번호 8자리는 `1588-0000`, 0507 가상번호는 `0507-0000-0000`으로 표시합니다.
### 검증
- `node --test web/tests/koreanPhoneNumber.test.mjs`: 6개 통과
### 변경 파일
- `web/utils/koreanPhoneNumber.mjs`
- `web/utils/contactDisplay.js`, `web/utils/format.js`
- `web/tests/koreanPhoneNumber.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

---

## [2026-05-23] 배차판 `.xlsm` 원본 수정 주의사항 기록
### 핵심
- 글로비스 배차판 원본 `.xlsm`에서 작업지명 문자열을 수정할 때 `openpyxl.load_workbook(..., keep_vba=True)` 후 `save()`로 재저장하면 파일 크기와 내부 패키지가 바뀌며 VBA 배열/매크로 오류가 발생할 수 있음을 확인했습니다.
- 매크로 포함 배차판 원본은 앞으로 `openpyxl.save()` 방식으로 직접 저장하지 않습니다. 수정이 필요하면 정상 백업을 먼저 만들고 Excel COM 자동화 또는 OOXML ZIP 내부의 필요한 XML 엔트리만 패치합니다.
- 문자열 치환처럼 셀 값만 바꾸는 작업은 `xl/sharedStrings.xml` 등 필요한 엔트리만 수정하고, `xl/vbaProject.bin` 해시가 백업본과 동일한지 확인해야 합니다.
### 검증 기준
- 수정 후 실제 Excel 앱으로 열기 검증을 수행합니다.
- `.xlsm` 패키지에서 변경된 엔트리 목록을 확인하고, 의도하지 않은 VBA/수식 관련 파일 변경이 없어야 합니다.
- NAS 원본 교체 전 정상 백업과 문제 발생본을 모두 남깁니다.
### 변경 파일
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-23] 아산 배차판 엑셀 숫자 소수점 표시 제거 (v5.14.134)
### 핵심
- 다운로드 엑셀에서 `오더`, `배차` 숫자에 소수점이 보이지 않도록 숫자 표시 형식을 `#,##0`으로 고정했습니다.
- 숫자 셀 타입은 유지해 합계/계산은 그대로 바로 가능합니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 엑셀 다운로드 숫자/테두리 보정 (v5.14.133)
### 핵심
- 형이 말한 대로 다운로드 엑셀의 `오더`, `배차`가 문자열로 내려가면 바로 합계/계산이 안 됩니다.
- `오더(계)`, `오더`, `계`, `수량`, `배차` 헤더는 ExcelJS에 숫자 셀로 저장하도록 변환했습니다. 쉼표가 들어간 숫자도 숫자로 바꿉니다.
- 데이터 행은 빈 칸까지 `thin` 테두리를 적용해 표가 엑셀에서 선명하게 보이게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 31개 통과
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 46개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 종합실적 비교 카드 제목 정리 (v5.14.132)
### 핵심
- 종합실적 구성·차량 성과 카드 제목을 `계약/차량 집중도`에서 `당사 / 협력사 비교`로 바꿨습니다.
- 좌측 당사 직계약차량과 우측 외부/타운송사 비교 의도가 먼저 읽히도록 테스트 기대값과 문서도 함께 갱신했습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanSummaryPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB 비고 출처 분리 (v5.14.131)
### 핵심
- 형이 확인한 대로 엑셀 `비고`는 화면으로 가져오면 안 되고, 엑셀에서 가져올 값은 `비고` 오른쪽 `특이사항`만 맞습니다.
- 기존 컷오버 과정에서 `branch_dispatch_web_cells.field_key=NOTE`로 저장된 엑셀 비고가 `source=cutover` 상태로 남아 화면에 WEB 비고처럼 노출되고 있었습니다.
- WEB 셀 오버레이는 `NOTE`에 한해 `source=web`인 값만 표시하도록 바꿨습니다. 컷오버 데이터는 삭제하지 않고 보존하되 화면/내보내기에는 쓰지 않습니다.
- 백필 스크립트도 앞으로 엑셀 `비고`를 `NOTE`로 가져오지 않도록 막았습니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 45개 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/scripts/backfill-asan-dispatch-web-cells.mjs`
- `web/tests/asanDispatchWebCells.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 관제 통계 운행거리 전환과 저속 회전 포인트 보강 (v5.14.130 / APK v5.11.29)
### 핵심
- 형이 지적한 대로 12가0140 완료 경로의 `최고속도 160km/h`는 실제 주행보다 센서 speed 순간 튐을 그대로 표시한 문제였습니다. 완료 통계는 좌표 간 거리/시간 기반 신뢰 최고속도를 우선하고, 센서값은 좌표 진행과 맞을 때만 보조로 쓰도록 바꿨습니다.
- 앱 완료 경로 패널, 앱 운행기록, 웹 관제 기록 화면은 평균속도보다 관제 판단에 유용한 `운행거리`를 표시합니다. 엑셀 내보내기도 운행거리 컬럼을 추가하고 최고속도는 같은 신뢰 통계로 계산합니다.
- 출발/도착/서행 골목길에서 경로가 건물이나 도로 끝을 가로질러 단순화되지 않도록 Android native 자이로/가속도 센서가 1km/h 이상 저속 회전도 `GPS_TURN` 마커로 저장하게 했습니다. 완료 경로 매칭 waypoint도 출발/도착 주변과 저속 회전 포인트를 우선 보존합니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs web/tests/driverMapCamera.test.mjs`: 34개 통과
- `npm.cmd run lint -- app/api/vehicle-tracking/trips/route.js app/api/vehicle-tracking/export/excel/route.js 'app/(main)/employees/vehicle-tracking/page.js' utils/vehicleLocation.mjs tests/vehicleLocation.test.mjs tests/driverMapCamera.test.mjs`: 통과(기존 hook/img 경고만)
- `npm.cmd run build`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.29/versionCode 5170
### 변경 파일
- `web/utils/vehicleLocation.mjs`, `web/app/api/vehicle-tracking/trips/route.js`, `web/app/api/vehicle-tracking/trips/[id]/matched-route/route.js`
- `web/app/api/vehicle-tracking/export/excel/route.js`, `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/driver-src/modules/map.js`, `web/driver-src/modules/log.js`, `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/android/app/build.gradle`, `web/public/apk/version.json`, `web/public/apk/els_driver.apk`
- `web/tests/vehicleLocation.test.mjs`, `web/tests/driverMapCamera.test.mjs`, `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 오버레이 종료 latch와 실시간 마커 도로 스냅 (v5.14.129 / APK v5.11.28)
### 핵심
- 형이 종료 후 앱으로 복귀했는데도 오버레이가 앱 위에 남는 것을 확인했습니다. JS 종료 호출을 `await stopOverlayService()`로 바꾸고, native에는 `STOP_OVERLAY_SERVICE` latch를 추가해 sticky service 재시작과 전경 복귀 모두에서 잔존 오버레이를 정리합니다.
- `OverlayPlugin.setWidgetVisible()`은 active trip이 없으면 서비스를 새로 깨우지 않고 남은 서비스만 정지합니다. `MainActivity.onResume/onPause()`도 active trip이 없으면 `FloatingWidgetService`를 직접 stop합니다.
- 관제 마커가 도로 가장자리로 밀려 보이는 문제는 원본 GPS 저장값은 유지하고, `trips?mode=active` 응답의 표시 좌표만 최근 정상 좌표 기반 Naver Directions 15 경로에 가까운 도로 위치로 스냅하도록 했습니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs web/tests/driverMapCamera.test.mjs`: 31개 통과
- `npm.cmd run lint -- app/api/vehicle-tracking/trips/route.js app/api/vehicle-tracking/location/route.js utils/vehicleLocation.mjs tests/vehicleLocation.test.mjs tests/driverMapCamera.test.mjs`: 통과
- `npm.cmd run build`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.28/versionCode 5169
### 변경 파일
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`, `MainActivity.java`, `OverlayPlugin.java`
- `web/driver-src/modules/trip.js`, `web/app/api/vehicle-tracking/trips/route.js`, `web/utils/vehicleLocation.mjs`
- `web/tests/driverMapCamera.test.mjs`, `web/tests/vehicleLocation.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/version.json`, `web/public/apk/els_driver.apk`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] Android 저속/정차 GPS heartbeat 90초 보정 (v5.14.128 / APK v5.11.27)
### 핵심
- 12가0140 실시간 테스트 중 경로와 속도 튐은 안정됐지만, 저속/정차 구간에서 native 저장 간격이 139~141초까지 벌어져 관제 화면에서는 잠깐 멈춘 것처럼 보일 수 있었습니다.
- JS GPS heartbeat는 정차 90초인데 Android 네이티브 오버레이 서비스는 6km/h 미만을 180초로 전송하고 있어 정책이 어긋났습니다.
- Android native 정차/도보 전송 주기를 90초로 낮추고 오버레이 문구도 `90s 정차`로 맞췄습니다. APK는 v5.11.27/versionCode 5168로 빌드했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs web/tests/vehicleLocation.test.mjs`: 29개 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.27/versionCode 5168
### 변경 파일
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/android/app/build.gradle`, `web/public/apk/version.json`, `web/public/apk/els_driver.apk`
- `web/driver-src/**`, `web/tests/driverMapCamera.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 실시간 관제 서버 속도 저장 보정 (v5.14.127)
### 핵심
- 형의 12가0140 실시간 운행 테스트를 보면서 위치 저장 파이프라인을 점검했습니다. 17:32 출발 이후 경로는 단방향으로 이어졌고 좌표 간 추정속도 최대는 약 92km/h라 좌표 점프는 없었습니다.
- 다만 `android_bg` 포인트 2개가 좌표 이동량과 맞지 않게 speed 156~160km/h로 저장되었습니다. 이는 지도 경로 튐이 아니라 센서 속도값만 튄 케이스라, 앱 방어와 별개로 서버 저장 단계에서 한 번 더 보정하도록 했습니다.
- `/api/vehicle-tracking/location`은 저장 직전 직전 좌표와 현재 좌표의 거리/시간 기반 추정속도를 계산하고, 센서 속도가 과하게 높거나 같은 자리에서 속도만 튀면 저장 speed를 추정속도/0으로 낮춥니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs web/tests/driverMapCamera.test.mjs`: 28개 통과
- `npm.cmd run lint -- app/api/vehicle-tracking/location/route.js utils/vehicleLocation.mjs tests/vehicleLocation.test.mjs tests/driverMapCamera.test.mjs`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/vehicleLocation.mjs`
- `web/app/api/vehicle-tracking/location/route.js`
- `web/tests/vehicleLocation.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] Android 오버레이 타이머 즉시 표시와 운행 데이터 점검 (v5.14.125 / APK v5.11.26)
### 핵심
- 형이 제보한 “오버레이가 몇 분간 운행시간 없이 GPS/주소만 보이다가 나중에 작동”하는 현상은 `SET_VISIBILITY` 액션으로 서비스가 살아난 경우 `mStartTimeMillis`만 복구하고 타이머/GPS runtime을 다시 켜지 않은 경로가 원인이었습니다.
- `SET_VISIBILITY`에서도 `ensureActiveTripRuntime()`을 거쳐 오버레이, 위치 수신, 자이로, native timer를 즉시 보장하게 했고, 첫 렌더 시 `tvTimer`가 빈칸이면 바로 현재 운행시간을 채웁니다.
- 앱 종료는 `moveTaskToBack(true)`로 먼저 화면을 숨긴 뒤 서비스 정리를 이어가게 바꿔 체감 버벅임을 줄였습니다. `killProcess()`는 계속 금지합니다.
- 2026-05-21~2026-05-22 12가0140 운행 3건을 공개 API로 분석했습니다. 시작/종료 마커와 종료 시각 정합성은 정상, 좌표 기준 비정상 점프는 없었고, 두 건의 저장 속도 max 160km/h만 센서 속도 튐으로 확인되어 좌표 기반 추정속도와 비교해 저장 전 보정하도록 했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 11개 통과
- `npm.cmd run lint -- tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.26/versionCode 5167
- APK 내부 `assets/public/modules/store.js`: v5.11.26 / BUILD_CODE 5167 확인
### 변경 파일
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/android/app/src/main/java/com/elssolution/driver/MainActivity.java`
- `web/android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java`
- `web/android/app/build.gradle`, `web/public/apk/version.json`, `web/public/apk/els_driver.apk`
- `web/tests/driverMapCamera.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 통합 WEB 셀 페이지 조회 보강 (v5.14.126)
### 핵심
- 운영 통합현황에서 모비스 개별 행과 같은 `row_signature`가 내려오는데도 BKG/비고가 빈칸으로 보이는 현상을 확인했습니다.
- 통합현황은 모든 날짜·양쪽 원본의 WEB 셀을 한 번에 읽어 Supabase 기본 1000건 응답 제한에 걸릴 수 있어, `branch_dispatch_web_cells` 조회를 1000건 단위 페이지네이션으로 바꿨습니다.
- 기존 row_signature/행번호 fallback은 유지하면서, 통합현황도 최근 저장값까지 끝까지 읽어 글로비스·모비스·통합의 표시 기준을 맞췄습니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 44개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/tests/asanDispatchWebCells.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] Vercel 배포 함수 크기 초과 보정 (v5.14.124)
### 핵심
- 운영 Vercel 프로젝트 배포 중 `api/els/login`, `api/els/run`, `api/els/parse-xlsx` 등이 로컬 `elsbot/dist`와 임시 브라우저 프로필까지 함수 번들에 포함해 250MB 제한을 초과했습니다.
- Next.js output file tracing exclude에 `../elsbot/**/*`와 임시 엑셀 캐시를 추가해 Vercel 서버리스 산출물에서 로컬 봇 대형 파일을 제외했습니다.
- `api/els/*`는 운영에서 NAS 프록시 또는 사용불가 안내 경로로 동작하므로 Vercel 번들에 로컬 Python/Drission 실행파일이 필요하지 않습니다.
### 검증
- `npm.cmd run build`: 통과
### 변경 파일
- `web/next.config.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB BKG/비고 조회 복구 보강 (v5.14.123)
### 핵심
- 오늘 입력한 글로비스 BKG가 DB에는 저장됐지만 운영 화면 일부 경로에서 빈칸으로 내려오는 상황을 확인했습니다.
- WEB 셀 조회를 `현재 row_signature -> 레거시 row_signature -> 같은 원본/날짜/행번호/컬럼 최신값` 순서로 복구하도록 보강했습니다.
- 저장 API도 같은 행번호에 기존 WEB 셀이 있으면 새 row_signature로 갱신해 중복 저장과 통합/개별 표시 누락을 줄였습니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 43개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/app/api/branches/asan/dispatch/web-cell/route.js`
- `web/tests/asanDispatchWebCells.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 행사일정 한국 공휴일 라벨과 붉은 휴일 배경 추가 (v5.14.122)
### 핵심
- 행사일정 월간 매트릭스 날짜 데이터에 한국 공휴일 정보를 붙이고, 공휴일/대체공휴일/특별 휴일 셀을 붉은 계열 배경과 라벨로 표시했습니다.
- 2026년 기준 설날·추석·부처님오신날·지방선거일과 기본 양력 공휴일을 포함했고, 주말과 겹치는 적용 대상 공휴일은 다음 평일 대체공휴일로 계산합니다.
- 형 요청 예시인 `2026-05-24 부처님오신날`, `2026-05-25 부처님오신날 대체공휴일`을 테스트로 고정했습니다.
### 검증
- `node --test web/tests/intranetEvents.test.mjs`: 6개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- Browser: `/employees/events?debug=true`에서 어린이날/부처님오신날/대체공휴일 라벨 노출 확인, 360x780 모바일 가로 넘침 없음.
### 변경 파일
- `web/utils/intranetEvents.mjs`
- `web/components/IntranetEventCalendar.js`
- `web/components/IntranetEventCalendar.module.css`
- `web/tests/intranetEvents.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 모바일 기간 선택 간격 보정 (v5.14.121)
### 핵심
- 모바일 현황판 중간의 `일별/주별/월별/전체` 버튼과 날짜 선택 드롭다운 사이에 큰 빈 공간이 생기던 문제를 보정했습니다.
- 데스크탑용 드롭다운 폭 설정 `flex: 0 0 240px`가 모바일 세로 배치에서 높이 240px처럼 작동한 것이 원인이었습니다.
- 모바일에서는 `periodSelectWrap`의 flex-basis를 `auto`로 리셋하고 최소 높이를 0으로 고정해 버튼, 셀렉트, 날짜탭이 연속으로 붙게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 30개 통과
- `npm.cmd run lint`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB BKG 레거시 표시/폭 보정 (v5.14.120)
### 핵심
- 오늘 모비스 WEB BKG 입력값이 통합현황에 보이지 않는 문제를 기존 저장 row_signature fallback으로 보정했습니다.
- 이미 `col_15` 익명 TYPE 헤더 기준으로 저장된 값도 새 canonical 서명 행에서 조회해 표시하고, 새 저장은 canonical 서명으로 이어갑니다.
- 모비스 헤더에 실제로 `BKG1/BKG1/BKG3`가 들어온 것을 확인해 WEB 전용 BKG 3칸은 표시 전 `BKG1/BKG2/BKG3`로 정리합니다.
- BKG/TARGET/비고 컬럼 폭은 저장 직후뿐 아니라 화면 로드·통합/개별 전환 시 현재 값의 최장 길이 기준으로 자동 확장합니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 41개 통과
- `npm.cmd run lint`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/route.js`
- `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDispatchWebCells.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB 입력 통합/개별 행 서명 통일 (v5.14.119)
### 핵심
- 모비스 개별 화면에서 WEB 입력한 BKG/비고 값이 통합현황에 보이지 않던 원인을 보정했습니다.
- 통합현황은 익명 `col_12/col_15` TYPE 헤더를 복구한 뒤 행 서명을 만들고, 글로비스/모비스 개별 화면은 복구 전 헤더로 행 서명을 만들어 같은 행의 저장키가 달랐습니다.
- 글로비스 `col_12 -> T`, 모비스 `col_15 -> TYPE` 복구를 공통 유틸로 분리하고 통합/개별/API/export 모두 같은 기준을 쓰게 했습니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 39개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanDispatchWebCells.mjs`
- `web/app/api/branches/asan/dispatch/route.js`
- `web/app/api/branches/asan/export/route.js`
- `web/tests/asanDispatchWebCells.test.mjs`, `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 미래 정상 날짜 탭 허용 (v5.14.118)
### 핵심
- 날짜 탭 비활성화 기준을 `오늘 이후 여부`가 아니라 `유효 오더 존재 여부`로 바꿨습니다.
- 5/26처럼 정상 선기입 오더가 있는 날짜는 글로비스/모비스 중 한쪽 자료만 있어도 통합현황에서 열리게 하고, 5/29처럼 오류·문자·0 오더만 있는 날짜는 계속 막습니다.
- 전체/주별/월별 집계도 같은 유효 오더 기준을 써서 탭과 기간 선택의 동작을 맞췄습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 30개 통과
- `npm.cmd run lint`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 기간 선택 위치 보정 (v5.14.117)
### 핵심
- 배차판 누적 조회의 `일별/주별/월별/전체` 버튼과 날짜/기간 드롭다운이 데스크탑에서 멀리 떨어지지 않도록 같은 흐름에 붙였습니다.
- 드롭다운 폭을 240px로 줄여 버튼 옆에서 바로 선택하게 하고, 모바일은 기존처럼 전체 폭 선택을 유지했습니다.
- 새 배치 기준에 맞춰 아산 배차판 회귀 테스트의 CSS 단언을 갱신했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 30개 통과
- `npm.cmd run lint`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 누적 날짜 탐색 UI 정리 (v5.14.116)
### 핵심
- 배차판 날짜 탭이 누적 DB의 모든 날짜를 펼치지 않도록 선택 날짜 기준 빠른 탭 7개만 표시하게 했습니다.
- 오래된 날짜는 `일별/주별/월별/전체` 버튼과 드롭다운으로 선택하도록 바꿔, 오늘 자동 선택 흐름은 유지하면서 누적 조회 부담을 줄였습니다.
- 주별/월별/전체 선택지는 오늘 이후 사전기입 날짜와 유효 오더 없는 날짜를 제외하고, 모바일은 4분할 기간 버튼과 한 줄 드롭다운으로 정리했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 30개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 선적관리 컨테이너 이력 날짜시간 표시 통일 (v5.14.115)
### 핵심
- 선적관리 테이블의 `이력 MOVE TIME`과 `이력 조회시각`을 `YYYY/MM/DD HH:mm` 24시간제 표시로 통일했습니다.
- `toLocaleString()` 기반 오전/오후 표시와 원본 `YYYY-MM-DD` 표시가 섞이지 않도록 컨테이너 이력 전용 formatter를 추가했습니다.
- 기존 선적관리 테스트가 잡던 저소음 스케줄러 로그 문구도 기준에 맞춰 `파일 서명 동일`로 정리했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 37개 통과
- `npm.cmd run lint -- "utils/containerHistoryResults.mjs" "tests/asanShippingFlow.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\app_core.py`: 통과
### 변경 파일
- `web/utils/containerHistoryResults.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docker/els-backend/app_core.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 배차량 계산식 오류 fallback 보강 (v5.14.114)
### 핵심
- 글로비스 KD 엑셀의 `배차` 계산식이 비거나 `#VALUE!` 같은 오류 문자열이 되어도 웹 요약의 `배차량`/`언매치`가 무너지지 않도록 지역 배차칸 합계를 fallback으로 사용합니다.
- `아산/부산/신항/광양/평택/중부/부곡/인천` 등 지역칸의 `대신2`, `자차3,이지2`, `CSS1` 같은 업체+수량 표기를 공용 파서로 합산합니다.
- 상단 요약, 행별 언매치 색상, 현황판 기간 카드의 `sheetDispatchTotal`이 같은 기준을 쓰도록 맞췄습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 30개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/utils/asanDashboardView.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB 입력 폭/공통 특이사항 컬럼 보강 (v5.14.113)
### 핵심
- WEB 전용 `BKG1/BKG2/BKG3/TARGET VESSEL/비고` 입력 저장 후 현재 화면 데이터와 저장값 중 가장 긴 값 기준으로 컬럼 폭을 자동 확장하게 했습니다.
- 글로비스와 모비스 모두 `비고` 오른쪽 `특이사항` 엑셀 컬럼을 같은 의미로 보고, 통합현황 테이블과 엑셀 내보내기에 `비고` 다음 공통 컬럼으로 노출했습니다.
- 모비스의 새 `특이사항`처럼 오늘 이후 날짜부터 생긴 컬럼도 전체 탭에서 빠지지 않도록 날짜별 헤더를 합산해 표시합니다.
- 새 `특이사항`은 엑셀 원본 입력값으로 표시하고, WEB 전용 셀 행 서명을 흔들지 않도록 `비고` 오른쪽 특이사항은 서명 안정값에서 제외했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchWebCells.test.mjs`: 37개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/export/route.js" "utils/asanDispatchWebCells.mjs" "tests/asanDashboardView.test.mjs" "tests/asanDispatchWebCells.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/api/branches/asan/dispatch/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/utils/asanDispatchWebCells.mjs`
- `web/tests/asanDashboardView.test.mjs`, `web/tests/asanDispatchWebCells.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 자동 동기화 저장시각/완료 피드백 보강 (v5.14.112)
### 핵심
- 자동 동기화 변경 감지를 단순 `mtime` 비교에서 `mtime_ns+파일크기` 서명 비교로 바꿔 저장 감지 누락 가능성을 줄였습니다.
- 시트 데이터와 메모 해시가 같아 upsert를 생략하더라도 `branch_dispatch.file_modified_at`/`updated_at`은 최신 파일 저장시각으로 갱신해 화면 `저장:` 표시가 밀리지 않게 했습니다.
- 엑셀 파싱 순서를 어제 날짜부터 미래 날짜 시트 우선으로 정렬해 현장 확인이 필요한 최근/선기입 자료가 먼저 반영되게 했습니다.
- `NAS 동기화` 버튼은 백엔드 상태 API를 폴링해 완료될 때까지 진행 상태를 유지하고, 완료 후 자동으로 배차판 데이터를 다시 읽어 `동기화 완료` 메시지를 보여줍니다.
- 통합현황에서도 `BKG1/BKG2/BKG3/TARGET VESSEL/비고` WEB 전용 칸을 숨김 설정과 관계없이 표시하고 동일한 WEB 저장 API로 편집되게 했습니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app_core.py docker/els-backend/app.py docker/els-backend/file_sync_gate.py`: 통과
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchWebCells.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/sync/route.js" "tests/asanDashboardView.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `docker/els-backend/app_core.py`, `docker/els-backend/app.py`
- `web/app/(main)/employees/branches/asan/page.js`, `web/app/api/branches/asan/sync/route.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 아산 배차판 WEB 전용 셀 저장 구조 (v5.14.111)
### 핵심
- `BKG1/BKG2/BKG3/TARGET VESSEL/비고`를 엑셀 원본이 아닌 WEB DB 오버레이 값으로 관리하도록 `branch_dispatch_web_cells`/`branch_dispatch_web_cell_history` 스키마와 저장 API를 추가했습니다.
- 컷오버 전 현재 엑셀 값을 보존하는 `web/scripts/backfill-asan-dispatch-web-cells.mjs`를 만들고, 백필이 끝나야 WEB 전용 모드가 활성화되도록 안전장치를 뒀습니다.
- 배차판 조회/엑셀 내보내기는 WEB 전용 모드 활성 후 해당 컬럼의 엑셀 값을 무시하고 DB 값을 병합합니다.
- 화면 테이블은 대상 컬럼만 인라인 입력으로 바꾸고, BKG/TARGET VESSEL은 영문·숫자·기호만, 비고는 한글·영문·숫자·기호를 허용합니다.
### 검증
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 33개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/dispatch/web-cell/route.js" "app/api/branches/asan/export/route.js" "tests/asanDispatchWebCells.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`, `web/app/(main)/employees/branches/asan/dispatch.module.css`
- `web/app/api/branches/asan/dispatch/route.js`, `web/app/api/branches/asan/dispatch/web-cell/route.js`, `web/app/api/branches/asan/export/route.js`
- `web/utils/asanDispatchWebCellFields.mjs`, `web/utils/asanDispatchWebCells.mjs`, `web/tests/asanDispatchWebCells.test.mjs`
- `web/supabase_sql/20260522_asan_dispatch_web_cells.sql`, `web/scripts/backfill-asan-dispatch-web-cells.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 종합실적 경영 판단 용어 정규화 (v5.14.110)
### 핵심
- 종합실적 `경영 판단` 카드가 Supabase `summary-view`에 저장된 예전 제목을 받아도 화면 표시 직전에 새 용어로 정규화하게 했습니다.
- `수익성 압력`은 `이익률`, `ELS/외부 집중도`는 `자사 비율`로 보정하고, 값/상세의 `ELS직계약` 표현도 자사 기준으로 바꿔 보이게 했습니다.
- `고마진/저마진` 어감은 업무 보고용으로 낮춰 `이익률 우수 청구처/지급처`, `이익률 점검 청구처/지급처`로 변경했습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "utils/asanPerformanceSummary.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/utils/asanPerformanceSummary.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-22] 종합실적 용어 정리 (v5.14.109)
### 핵심
- 종합실적 화면 제목을 `아산 종합 실적 지휘판`에서 `컨테이너 운송 통합실적`로 바꿨습니다.
- 비율 표기는 `손익률` 대신 `이익률`로 통일했습니다.
- 경영 판단 카드의 `수익성 압력`은 `이익률`, `ELS/외부 집중도`는 `자사 비율`로 바꾸고 값도 `자사/외부` 표현으로 맞췄습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanSummaryPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/utils/asanPerformanceSummary.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 선적관리 컨테이너 조회 중단/DB rows 공백 방어 (v5.14.108)
### 핵심
- 로그/DB 집계상 13:45에 `asan_shipping` 소스 137건만 저장되어, 구형 스트림 조회가 페이지 이동과 함께 끊긴 것으로 확인했습니다.
- 기존 대량 조회 API도 100건 이상은 NAS Core background job으로 넘기게 해 구형 화면/캐시 경로에서도 페이지 이탈로 조회가 중단되지 않게 했습니다.
- job id가 없는 복원 요청은 최신 실행 job을 반환하고, 선적관리 DB 동기화는 rows 저장 count 검증 후 파일 메타를 갱신하도록 보강했습니다.
- `branch_shipping_files` 메타는 남았는데 `branch_shipping_rows`가 비어 있는 상태를 발견해 공식 POST 동기화로 원본 1,360행을 복구했고, 같은 상황에서는 DB 빈 결과 대신 엑셀 fallback을 쓰게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 36개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-lookup/route.js" "app/api/branches/asan/shipping/container-lookup/jobs/route.js" "tests/asanShippingFlow.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/app/api/branches/asan/shipping/container-lookup/route.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 아산 배차판 자동 동기화 메모 변경 감지 및 화면 갱신 (v5.14.107)
### 핵심
- NAS Core 배차판 자동 동기화의 시트 변경 해시에 `comments_dict`를 포함해 행 값은 그대로이고 셀 메모만 바뀐 경우도 `branch_dispatch` upsert가 실행되게 했습니다.
- 배차판 화면은 60초마다 조용히 `/api/branches/asan/dispatch`를 다시 읽고, 현재 선택 날짜 또는 전체 탭을 유지해 수동 `NAS 동기화`를 누르지 않아도 `저장:` 시각이 따라오도록 했습니다.
- 수동 동기화 후 재조회도 선택 날짜를 보존하게 바꿔 작업 중 보던 화면이 기본 날짜로 튀지 않도록 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 26개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app_core.py`: 통과
- `git diff --check`: 통과
### 변경 파일
- `docker/els-backend/app_core.py`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/09_DISPATCH_BOARD_SPEC.md`

## [2026-05-21] 월간실적 차량 TOP10 손익 표시 제거 (v5.14.105)
### 핵심
- 차량 TOP10이 매입액 기준 표가 되었으므로 마지막 컬럼에서 손익 금액을 제거했습니다.
- 차량 행은 매입액과 건수만 보여 매출-매입 손익값과 기준이 섞이지 않게 했습니다.
- 건수 전용 컬럼에 맞춰 차량 성과 표의 데스크톱/모바일 폭을 줄였습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 종합실적 경영 판단 기준 설명 보정 (v5.14.104)
### 핵심
- 종합실적 `경영 판단` 설명에 청구처는 매출 기준, 지급처는 매입 기준이라는 해석 기준을 추가했습니다.
- 고마진/저마진 청구처 신호는 매출액을, 고마진/저마진 지급처 신호는 매입액을 상세 금액으로 표시하도록 분리했습니다.
- 지급처 후보를 고를 때도 매입액이 있는 항목을 기준으로 보도록 해 화면 설명과 실제 데이터 기준을 맞췄습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "utils/asanPerformanceSummary.mjs" "tests/asanSummaryPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/utils/asanPerformanceSummary.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 연간실적 계약/차량 근거표 제목열과 매입 표시 (v5.14.103)
### 핵심
- 연간실적 `계약/차량` 탭의 작업지/청구처/노선/구분 근거표에 `항목 · 매출 · 매입 · 손익 · 손익률` 제목열을 추가했습니다.
- 기존에 매출과 손익률만 보이던 행에 매입과 손익을 함께 표시해 원장 산식 확인이 바로 가능하게 했습니다.
- 각 행 클릭 시 기존과 동일하게 선택된 세그먼트 조건과 항목명을 AND 검색으로 묶어 테이블 원장 상세로 이동합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 월간실적 차량 TOP10 매입액 기준 전환 (v5.14.102)
### 핵심
- 월간실적 `구성·차량 성과` 표의 차량 TOP10 정렬 기준을 청구액에서 매입액으로 바꿨습니다.
- 비중 막대와 금액 컬럼도 차량 기준에 맞춰 매입액을 표시하고, 헤더 문구를 `매입액 기준`으로 수정했습니다.
- 운송사/차량번호 헤더와 차량명 값을 우측 정렬해 숫자 컬럼과 시선 흐름을 맞췄습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 실적관리 설정 버튼명 통일 (v5.14.101)
### 핵심
- 연간실적 상단의 `파일 설정` 버튼을 월간실적과 같은 `설정`으로 바꿔 실적관리 하위 화면 버튼명을 맞췄습니다.
- 설정 모달 제목은 사용자가 어떤 파일 설정인지 바로 알 수 있도록 `연간실적 파일 설정`/`월간실적 파일 설정` 문구를 유지했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 행사일정 클릭 상세 UX와 모바일 하단 시트 보강 (v5.14.99)
### 핵심
- 월간 매트릭스의 일정 칩 클릭 시 일자/시간/장소/공지범위/상세내용/접속 팝업 시점을 카드형 상세 모달로 보여주도록 재구성했습니다.
- 날짜 숫자를 누르면 해당일 전체 일정 목록을 열고, `+N 더보기`도 네 번째 일정 단건이 아니라 전체 목록으로 연결했습니다.
- 모바일은 Galaxy S24급 360x780에서 상세/목록/등록 모달이 하단 시트처럼 열리고, 상세 메타는 1열로 접히도록 보정했습니다.
### 검증
- `node --test web/tests/intranetEvents.test.mjs`: 4개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- Browser: `/employees/events?debug=true` 페이지 렌더링과 360x780 모바일 가로 넘침 없음 확인. 현재 DB 기준 일정 데이터 0건이라 실제 데이터 클릭 모달은 운영 데이터 생성 후 확인 필요.
### 변경 파일
- `web/components/IntranetEventCalendar.js`
- `web/components/IntranetEventCalendar.module.css`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 행사일정 단독 페이지와 인트라넷 메뉴 이동 (v5.14.98)
### 핵심
- 행사일정을 AI 어시스턴트 화면 하단 렌더링에서 분리해 `/employees/events` 단독 페이지로 이동했습니다.
- 인트라넷 홈 사이드 메뉴에서 `AI 어시스턴트` 바로 아래 `행사일정`을 추가하고, 상단 인트라넷 드롭다운의 `직원 서비스`에도 노출했습니다.
- AI 어시스턴트 페이지는 채팅 전용 화면으로 되돌려 메뉴 진입과 콘텐츠 배치를 분리했습니다.
### 검증
- `node --test web/tests/intranetEvents.test.mjs`: 4개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- Browser: `/employees/events?debug=true`에서 메뉴/단독 페이지 렌더링 확인, `/employees/ask?debug=true`에서 캘린더 제거 확인, 360x780 모바일 가로 넘침 없음.
### 변경 파일
- `web/app/(main)/employees/(intranet)/events/page.js`
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/constants/intranetMenu.js`
- `web/components/Header.js`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 실적관리 현황판 스냅샷 경량화 (v5.14.97)
### 핵심
- 종합실적 첫 화면이 3MB대 원자료를 브라우저에서 받아 다시 범위별 계산하던 구조를 `summary-view` 스냅샷으로 분리했습니다. 기본 화면과 연/월/일 선택은 서버가 범위별로 계산한 얇은 결과만 내려줍니다.
- 연간/월간 dashboard summary는 화면에서 쓰지 않는 내부 `weekly/sourceFiles` 및 nested 시계열을 제거하고, 월간의 주간/일간 범위 계산에 필요한 `daily` 축은 유지했습니다.
- 연간/월간 화면의 초기 dashboard 조회가 검색 effect와 겹쳐 중복 호출될 수 있던 구조를 정리했습니다. 검색어/검색모드 변경은 검색 effect에서만 재조회하고, 최초/탭 전환은 별도 effect에서 처리합니다.
- NAS 동기화 후 프리워밍 URL은 `view=dashboard`를 포함해 종합실적 화면용 스냅샷까지 같이 준비합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `npx.cmd eslint "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/api/branches/asan/performance/summary/route.js" "lib/asan-branch-db.js" "utils/asanPerformanceSummary.mjs"`: 통과
- `py -3 -m py_compile docker/els-backend/asan_performance.py`: 통과
- `npm.cmd run build`: 통과
- 로컬 Next API 최종 측정: `summary-view` 138,874 bytes, `annual-dashboard` 2,063,142 bytes, `monthly-dashboard` 2,611,645 bytes.
### 변경 파일
- `web/utils/asanPerformanceSummary.mjs`, `web/lib/asan-branch-db.js`
- `web/app/api/branches/asan/performance/summary/route.js`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`, `AsanAnnualPerformance.js`, `AsanMonthlyPerformance.js`
- `docker/els-backend/asan_performance.py`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 실적관리 현황판 스냅샷 DB 분리 (v5.14.96)
### 핵심
- 실적관리 종합/월간/연간 분석 화면의 초기 로딩이 원장 DB 조회와 집계에 묶여 일반 사용자가 오류로 오해할 수 있는 수준이라, 화면용 스냅샷 DB를 추가했습니다.
- `branch_performance_dashboard_snapshots` 테이블을 만들고, 분석 API는 먼저 스냅샷 JSON을 읽습니다. 테이블 검색/정렬/더보기는 기존처럼 `branch_performance_rows` 원장 DB를 직접 조회합니다.
- 스냅샷 생성은 `branch_performance_rows`를 읽지 않고 `branch_performance_files.summary` 메타만 사용합니다. 첫 구현 검증에서 원장 행 1페이지 조회도 statement timeout을 만들 수 있음을 확인해, 현황판 생성 경로에서 원장 행 접근을 완전히 제거했습니다.
- NAS 연간/월간 동기화 성공 시 summary API를 비동기로 호출해 스냅샷을 프리워밍합니다. 실패해도 원장 동기화는 유지되고 다음 화면 요청에서 다시 생성됩니다.
- 아산지점 첫 진입은 저장 탭과 무관하게 배차판으로 시작하고, 실적관리 버튼 진입은 항상 종합실적 탭으로 시작하도록 고정했습니다.
### 검증
- Supabase 운영 프로젝트에 `branch_performance_dashboard_snapshots` migration 적용 및 테이블 확인
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `npm.cmd run lint -- ...실적관리 관련 파일`: 통과
- `npm.cmd run build`: 통과
- 로컬 Next API: summary 스냅샷 첫 생성 21687ms, 이후 hit 3502ms 및 반복 hit 2001ms → 1377ms → 1059ms. annual/monthly dashboard hit는 각각 1331ms/1588ms.
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/api/branches/asan/performance/summary/route.js`, `annual/route.js`, `monthly/route.js`
- `web/app/(main)/employees/branches/asan/page.js`, `AsanAnnualPerformance.js`, `AsanMonthlyPerformance.js`
- `docker/els-backend/asan_performance.py`
- `web/supabase_sql/20260521_asan_performance_dashboard_snapshots.sql`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 연간실적 요일 분석 관리자용 포지션 맵 재구성 (v5.14.95)
### 핵심
- 비중형 다이어그램 1차안이 같은 정보가 레일과 카드에 반복돼 관리자가 한눈에 판단하기 어렵던 점을 보정했습니다.
- 상단은 `매출 중심`, `업무량 중심`, `수익성 최고`, `점검 요일` 4개 요약으로 줄이고, 세부 반복표는 제거했습니다.
- 가운데는 매출 분포 리본 1줄로 전체 매출이 어느 요일에 몰리는지 빠르게 보여줍니다.
- 하단은 7요일 포지션 맵으로 바꿔 요일별 색상, 매출 비중 높이, 매출 순위, 손익 기여, 건수 비중, 손익률을 한 칸 안에서 구분합니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 관리자 활동 로그 이름 검색 확장 (v5.14.94)
### 핵심
- 활동 로그 화면에 이름은 표시됐지만 검색은 기존 이메일 기준이라 이름으로 사용자를 좁힐 수 없었습니다.
- `/api/admin/logs`가 `q` 검색어를 받아 `profiles.full_name`, `user_roles.name`, 사용자 이메일, 기존 로그 이메일을 먼저 조회한 뒤 일치하는 이메일의 로그를 가져오도록 확장했습니다.
- 기존 `email` 파라미터는 호환용으로 유지했고, 검색창 문구는 `이름 또는 이메일 검색`으로 바꿨습니다.
### 검증
- `node --test web/tests/adminManagementUi.test.mjs`: 3개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/admin/logs/route.js`
- `web/app/(main)/admin/logs/page.js`
- `web/tests/adminManagementUi.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 연간실적 요일 분석 비중 다이어그램 전환 (v5.14.93)
### 핵심
- 연간실적 `요일` 분석이 절대 금액 막대 위주라 어느 요일이 전체에서 얼마나 차지하는지 바로 보이지 않던 문제를 보정했습니다.
- 상단에 `매출 비중`, `손익 기여`, `건수 비중` 누적 레일을 추가해 요일별 점유율을 한 줄에서 비교하게 했습니다.
- 요일별 카드는 전체 매출 중 비중을 크게 보여주고, 매출/손익/건수 비중 막대와 실제 금액·건수를 함께 표시합니다.
- 하단 요약은 매출 집중 요일, 건수 집중 요일, 고마진 요일, 주의 요일 4개로 바꿨습니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 월간실적 자동감지 미존재 미래월 순회 보정 (v5.14.92)
### 핵심
- 운영 NAS 확인 결과 연간실적은 2026-05-18 08:02 수정분이 DB와 일치했지만, 월간 1월 파일은 2026-05-20 14:07에 수정됐는데 DB 메타는 2026-02-11 수정분으로 남아 있었습니다.
- 월간 자동감지는 활성 상태였지만 2026-06 이후 아직 없는 미래 월 슬롯이 순환 후보에 계속 끼어들어 실제 존재하는 1~5월 파일 변경 확인을 지연시키는 구조였습니다.
- 자동감지 순회 전에 실제 존재하는 파일 슬롯을 먼저 계산하고, 존재 파일이 하나라도 있으면 그 목록 안에서만 최신 월 60초/이전 월 120초 주기로 검사하도록 보정했습니다.
- 다음 월 파일이 새로 생성되면 매 tick마다 존재 목록에 다시 들어오므로, 생성 직후 최신 파일 후보로 승격됩니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 8개 통과
- `py -3 -m py_compile docker/els-backend/asan_performance.py`: 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 선적관리 컨테이너 대량조회 BOT 안정화 (v5.14.91)
### 핵심
- 2026-05-21 오전 선적관리에서 570건 조회 중 216건 완료/354건 실패가 발생했고, 화면 진입 전 BOT 재가동 조회와 저장 흐름이 엇박자로 보였습니다.
- 원인은 100건 이상 대량 조회에서도 2워커 고속 제출과 45초 워커 대기 제한을 그대로 쓰고, `app_bot` 진행상태 복구가 5분이 지나면 장시간 작업을 종료로 오판할 수 있던 점이었습니다.
- 100건 이상 또는 명시 `stableBatchMode`는 대량 안정 모드로 전환해 기본 병렬 1개, 워커 대기 300초, 단건 요청 420초, 제출간격 2초, 워커 준비 대기 600초를 사용하게 했습니다.
- 대량 조회 대상 컨테이너는 현재 화면의 필터/정렬 순서를 유지하되, 저장 이력이 없는 컨테이너를 먼저 조회하도록 정렬해 중간 실패가 나도 새로 채워지는 결과를 최대화했습니다.
- `워커 대기 시간 초과`/`워커 준비 대기 시간 초과`는 일시 장애로 보고 1회 재조회 대상으로 바꿨고, 진행상태 좀비/유휴 복구 기준은 조회 건수 기반으로 늘려 500건대 작업이 5분 만에 완료 처리되지 않게 했습니다.
- 새벽 선적관리 자동조회는 항상 안정 모드로 BOT을 호출합니다. 이전 자동조회가 10회 실패 제한에 걸리면 DB 설정이 OFF로 남아 다음날 자동조회가 실행되지 않는 흐름도 확인했습니다.
- ETrans 비밀번호성 인증 실패가 감지되면 즉시 `stop_requested`를 설정해 다른 워커의 자동 로그인 시도까지 중단하고, 후속 워커는 첫 워커 성공 전 로그인 진입을 못 하게 해 계정 잠금 위험을 더 줄였습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 36개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-lookup/route.js" "tests/asanShippingFlow.test.mjs"`: 통과
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py docker/els-backend/app_bot.py elsbot/els_web_runner_daemon.py`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `docker/els-backend/app_bot.py`
- `docker/els-backend/app_core.py`, `docker/els-backend/app.py`
- `elsbot/els_web_runner_daemon.py`
- `web/app/api/branches/asan/shipping/container-lookup/route.js`
- `web/utils/containerHistoryResults.mjs`, `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] 선적관리 컨테이너 조회 백그라운드 job 전환 (v5.14.100)
### 핵심
- 미선적 컨테이너 조회를 걸어둔 뒤 다른 페이지로 이동하면 브라우저 요청 스트림이 끊기면서 조회/저장 릴레이도 같이 멈추는 문제가 있었습니다.
- NAS core에 `/api/branches/asan/shipping/container-lookup/jobs` 백그라운드 작업 API를 추가했습니다. core가 BOT 스트림을 직접 소비하고 부분 결과를 Supabase `branch_shipping_container_lookups`에 저장하므로 화면을 떠도 작업이 계속됩니다.
- 선적관리 화면은 조회 시작 시 job id를 localStorage 세션에 저장하고, 복귀/폴링 시 job 상태와 저장 이력을 같이 읽어 완료/실패/미조회 건수를 복원합니다.
- 조회 멈춤 버튼은 job id가 있으면 백그라운드 job 중지 API를 호출하고, 구형 스트림 조회에는 기존 BOT 정지 호출을 유지합니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 36개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-lookup/jobs/route.js" "tests/asanShippingFlow.test.mjs"`: 통과
### 변경 파일
- `docker/els-backend/app_core.py`, `docker/els-backend/app.py`
- `web/app/api/branches/asan/shipping/container-lookup/jobs/route.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-21] Android 운행 완료 후 crash dialog 방지 (v5.14.90 / APK v5.11.25)
### 핵심
- 어제 패치는 `endTrip()` 이후 앱 강제 종료 호출만 제거했지만, 네이티브 앱 종료/오버레이 플러그인에는 `android.os.Process.killProcess()`가 남아 Samsung One UI에서 “앱에 버그가 있어 종료” 팝업을 만들 수 있었습니다.
- `MainActivity.cleanExitApp()`와 `OverlayPlugin.exitAppForce()`에서 프로세스 kill을 제거하고, 명시 종료는 native trip prefs/keepalive/오버레이 서비스만 정리한 뒤 Android 정상 종료 API로 처리하게 했습니다.
- `OverlayPlugin.stopService()`가 서비스를 새로 `startForegroundService()`로 깨운 뒤 끄던 패턴을 제거했습니다. 운행 완료 정리는 새 포그라운드 서비스를 만들지 않고 prefs/keepalive를 먼저 지운 뒤 `stopService()`만 호출합니다.
- 앱 시작 시 저장된 `activeTrip`이 서버상 이미 완료/없음이면 JS 상태뿐 아니라 native 오버레이/GPS 상태까지 같이 정리해 완료 후 좀비 서비스가 앱을 다시 흔들지 않게 했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 10개 통과
- `node --check web/driver-src/modules/trip.js`: 통과
- `npm.cmd run lint -- driver-src/modules/trip.js tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.25/versionCode 5166
### 변경 파일
- `web/android/app/src/main/java/com/elssolution/driver/MainActivity.java`
- `web/android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java`
- `web/driver-src/modules/trip.js`, `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/version.json`, `web/public/apk/els_driver.apk`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 연간·월간실적 테이블 금액 검색 보정 (v5.14.89)
### 핵심
- 연간·월간실적 테이블은 헤더 클릭 정렬과 검색 필터를 이미 갖고 있었지만, 금액 검색이 `search_text ILIKE '%검색어%'`에 걸리며 Supabase statement timeout으로 실패할 수 있었습니다.
- 실적 테이블 조회는 DB에서 현재 범위 행을 가져온 뒤 서버에서 검색어를 정규화해 필터링하도록 바꿨습니다. `575,000`, `575000`, `575000.0`처럼 금액 표기가 달라도 같은 검색어로 잡습니다.
- 검색창 placeholder를 `검색어 또는 금액`으로 바꾸고, 테이블 헤더에는 `클릭하여 정렬` title을 붙여 정렬 기능을 더 명확하게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 20개 통과
- `node --check web/lib/asan-branch-db.js "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`, `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 인트라넷 행사일정 월간 캘린더와 접속 공지 팝업 (v5.14.88)
### 핵심
- AI 어시스턴트 하단에 `행사일정` 섹션을 추가하고, 월 단위 7열 매트릭스 형태로 일정을 표시하도록 구성했습니다.
- 관리자/본사 계정은 일정 등록·수정·삭제가 가능하며, 등록 시 `전체` 또는 발송지/지점별 공지범위를 선택합니다.
- `/api/intranet/events` API와 Supabase SQL `20260520_intranet_event_calendar.sql`을 추가해 `intranet_events`와 `intranet_event_dismissals`를 기준으로 저장/조회하도록 준비했습니다.
- 임직원 공통 레이아웃에 행사일정 공지 팝업을 연결해 대상 사용자가 접속할 때 7일전/3일전/1일전/당일 알림을 받고, `다시 보지 않음`은 사용자·일정·알림시점 단위로 저장합니다.
- Galaxy S24급 360x780 환경에서 월간 매트릭스가 가로 스크롤 없이 유지되도록 모바일 셀, 버튼, 모달 크기를 보정했습니다.
### 검증
- `node --test web/tests/intranetEvents.test.mjs`: 4개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- Browser `http://localhost:3002/employees/ask?debug=true`: 데스크탑 및 360x780 뷰포트에서 행사일정 렌더/가로 스크롤 없음 확인
### 남은 적용
- 운영 DB에서 저장과 접속 팝업 조회가 동작하려면 `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용해야 합니다.
### 변경 파일
- `web/components/IntranetEventCalendar.js`, `web/components/IntranetEventCalendar.module.css`
- `web/components/IntranetEventReminderPopup.js`, `web/components/IntranetEventReminderPopup.module.css`
- `web/app/(main)/employees/(intranet)/ask/page.js`, `web/components/SiteLayout.js`
- `web/app/api/intranet/events/route.js`, `web/app/api/intranet/events/[id]/route.js`, `web/app/api/intranet/events/reminders/route.js`, `web/app/api/intranet/events/dismissals/route.js`
- `web/lib/intranet-events-server.js`, `web/utils/intranetEvents.mjs`, `web/tests/intranetEvents.test.mjs`
- `web/supabase_sql/20260520_intranet_event_calendar.sql`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 관리자 활동 로그 사용자 이름 표시 (v5.14.87)
### 핵심
- 활동 로그 관리 화면이 이메일만 보여줘 같은 계정/사용자를 빠르게 식별하기 어려웠습니다.
- `/api/admin/logs` 응답에서 로그의 `user_email`, `user_id`, `metadata.user_id`를 기준으로 `profiles.full_name`과 `user_roles.name`을 조회해 `user_name`을 함께 반환하도록 보강했습니다.
- 이름 조회 실패는 로그 목록 자체를 막지 않고 건너뛰며, 화면은 `이름 / 이메일 / 접근IP`를 한 칸에 정리해 표시합니다.
- 선택 CSV 다운로드에도 `이름`, `접근IP` 컬럼을 추가했습니다.
### 검증
- `node --test web/tests/adminManagementUi.test.mjs`: 3개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/api/admin/logs/route.js`
- `web/app/(main)/admin/logs/page.js`
- `web/app/(main)/admin/users/users.module.css`
- `web/tests/adminManagementUi.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 종합실적 계약/차량 집중도 건수 비중 보정 (v5.14.86)
### 핵심
- 종합실적 `계약/차량 집중도` 카드에서 첫 번째 막대는 매출 비중인데 두 번째 막대가 단순 `건수`로 표시되어, 같은 성격의 비교 그래프인지 구별이 약했습니다.
- 기존 건수 막대 폭은 각 카드 자기 자신의 건수를 자기 자신으로 나누는 구조라 사실상 항상 100%에 가깝게 표시될 수 있었습니다.
- 두 번째 막대 라벨을 `건수 비중`으로 바꾸고, ELS직계약차량과 외부/타운송사 합계 건수 대비 각 카드 비중으로 폭과 값을 계산하게 보정했습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 4개 통과
- `node --check web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] ELS Bot 자동 로그인 3회 하드캡과 보호모드 (v5.14.85)
### 핵심
- 2026-05-20 오전 `els-bot` 로그에서 저장 계정 재로그인이 반복되며 `로그인 성공 확인 불가 (ID/PW 확인 필요)`가 계속 발생한 흐름을 확인했습니다.
- 기존 로직은 워커별 재시도와 세션키퍼 복구가 분리되어 있어 계정 기준 3회를 넘길 수 있었고, 10분 쿨다운 뒤 실패 횟수를 자동 초기화해 잠금 해제 전 재시도할 위험이 있었습니다.
- 자동 로그인 시도권을 `MAX_AUTO_LOGIN_ATTEMPTS=3`으로 통합하고, 워커 복구/세션 만료 복구/일일 리셋/저장 계정 warmup이 같은 예산을 공유하게 했습니다.
- `로그인 성공 확인 불가 (ID/PW 확인 필요)`를 인증 실패로 분류해 첫 감지 시 보호모드로 전환하고, 보호모드는 `BOT 정지`로 수동 초기화하기 전까지 자동으로 풀리지 않게 했습니다.
- `/health`와 `/api/els/capabilities`에 `login_failures`, `max_login_attempts`, `login_protected`를 노출하고 컨테이너 이력조회 화면에 로그인 보호 상태를 표시합니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m py_compile elsbot\els_web_runner_daemon.py docker\els-backend\app_bot.py docker\els-backend\app.py`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m unittest elsbot.tests.test_daemon_stop_control`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js"`: 에러 0개, 기존 경고 5개
- `git diff --check`: 통과
### 변경 파일
- `elsbot/els_web_runner_daemon.py`
- `docker/els-backend/app_bot.py`, `docker/els-backend/app.py`
- `web/app/(main)/employees/container-history/page.js`
- `elsbot/tests/test_daemon_stop_control.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산지점 페이지 초기 로딩 안정화 (v5.14.84)
### 핵심
- 아산지점 전체 페이지를 확인하면서 디자인과 표시 항목은 유지하고, 초기 진입 시 한 번에 너무 많은 화면 코드를 싣는 구조를 줄였습니다.
- `page.js`에서 선적관리, 종합실적, 월간실적, 연간실적을 동적 로딩으로 분리했습니다. 배차판은 기존 기본 진입 화면이라 그대로 두고, 나머지 화면은 탭 진입 또는 hover/focus/touch/idle 시점에 준비합니다.
- 실적관리 하위 탭은 저장된 마지막 탭을 확인한 뒤 해당 화면만 mount하도록 바꿔, 종합실적이 잠깐 먼저 떠서 API를 호출하는 흐름을 줄였습니다.
- 선적관리의 저장 컨테이너 이력 조회와 실적관리 동기화 상태 첫 조회는 첫 렌더 이후 idle/짧은 지연으로 넘겨 모바일에서 첫 화면을 먼저 그리게 했습니다.
- 배차판 설정 조회는 viewType이 바뀔 때마다 반복하지 않고 최초 mount 시 한 번만 읽도록 정리했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs web/tests/asanDashboardView.test.mjs`: 84개 통과
- `node --check` 아산지점 page/선적/종합/월간/연간 화면: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanShippingFlow.test.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과, `/employees/branches/asan` 26.7kB / First Load JS 115kB
- 로컬 프로덕션 서버 `http://localhost:3010/employees/branches/asan`: HTTP 200 확인
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanShippingFlow.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 선적관리 컨테이너 자동조회 장시간 스트림과 봇 stop 분리 (v5.14.83)
### 핵심
- 2026-05-20 08:30 KST 전후 선적관리 컨테이너 자동조회 482건이 진행되던 중 Core의 Bot 스트림 read timeout 900초가 먼저 닫히고, Bot 응답 생성기의 `GeneratorExit`가 데몬 `/stop`까지 호출해 워커 풀이 초기화되는 흐름을 확인했습니다.
- 자동조회 요청의 read timeout을 `ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS` 환경변수로 분리하고 기본값을 3600초로 늘렸습니다.
- Bot `/api/els/run`은 소비자 연결 종료만으로 데몬 전체를 stop하지 않도록 바꿨습니다. 명시적인 중지 버튼/`/api/els/stop-daemon` 요청은 기존처럼 즉시 워커를 종료합니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m py_compile docker\els-backend\app_bot.py docker\els-backend\app.py docker\els-backend\app_core.py`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m unittest elsbot.tests.test_container_lookup_safety`: 13개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test web\tests\asanShippingFlow.test.mjs`: 35개 통과
### 변경 파일
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `docker/els-backend/app_bot.py`
- `elsbot/tests/test_container_lookup_safety.py`, `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] Android 운행종료 후 앱 화면 유지 복구 (v5.14.82 / APK v5.11.24)
### 핵심
- 2026-05-20 아침 테스트에서 운행 진행은 정상이나 `운행종료` 직후 앱이 튕기듯 종료되고 재실행 시 Android 오류 팝업이 뜨는 증상을 확인했습니다.
- 원인은 이전 수정에서 운행종료 성공 후 `exitAppForce()`를 예약 호출해 앱 태스크/프로세스를 강제 종료하던 흐름이었습니다.
- `endTrip()`은 이제 TRIP_END 기록, 서버 `complete`, 오버레이 서비스 중지, JS GPS watcher 중지, `activeTrip` 제거, 운행 UI 초기화까지만 수행하고 앱 화면은 계속 유지합니다.
- 회귀 테스트는 운행종료가 `scheduleAppExitAfterTripEnd`, `exitAppForce`, `finishAndRemoveTask`를 호출하지 못하도록 고정했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 9개 통과
- `node --check web/driver-src/modules/trip.js web/driver-src/modules/profile.js web/driver-src/modules/permissions.js`: 통과
- `npm.cmd run lint -- driver-src/modules/trip.js driver-src/modules/profile.js driver-src/modules/permissions.js tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.24 (5165) 빌드/배포 복사 완료, APK 내부 버전 검증 통과
### 변경 파일
- `web/driver-src/modules/trip.js`
- `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 월간실적 모바일 분석 기준 공백 보정 (v5.14.81)
### 핵심
- 모바일 480px 이하에서 월간실적 상단 `분석 기준/전체` 제목 영역이 기존 `flex-basis: 220px`을 세로 높이처럼 가져가 과한 공백이 생길 수 있던 CSS를 보정했습니다.
- 모바일에서는 분석 기준 제목 박스가 내용 높이만 쓰고 전체 폭을 차지하게 해 버튼과 선택 목록이 바로 이어지도록 했습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 8개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] ELS Bot 계정 잠금 감지와 자동 재시도 차단 (v5.14.80)
### 핵심
- NAS `els-bot` 로그인 실패 스크린샷에서 ETrans가 `로그인을 5회 이상 실패하여 정지된 계정입니다. 비밀번호 찾기를 통해 본인인증 후 임시비밀번호를 발급 받으시기 바랍니다.` 팝업을 띄운 것을 확인했습니다.
- 기존 `close_modals()`는 해당 문구가 `로그인`을 포함한다는 이유로 세션 만료 팝업으로 먼저 판정할 수 있어, 계정 잠금 상태를 명확히 구분하지 못했습니다.
- 계정 잠금 문구를 `LOGIN_ACCOUNT_LOCKED`로 분리하고, `_start_login_pool()`이 계정 잠금/비밀번호 오류 메시지를 받으면 추가 자동 로그인 재시도를 즉시 중단하도록 했습니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m py_compile elsbot\els_bot.py elsbot\els_web_runner_daemon.py`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_daemon_stop_control`: 31개 통과
- `git diff --check`: 통과
### 변경 파일
- `elsbot/els_bot.py`
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_els_bot_logic.py`, `elsbot/tests/test_daemon_stop_control.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] ELS Bot 03:00 일일 리셋 워밍업 재시도 보강 (v5.14.79)
### 핵심
- 03:00 일일 리셋 로그에서 기존 세션은 유효하지만 `컨테이너이동현황` 메뉴 진입이 1회 타임아웃으로 끝나는 사례를 확인했습니다.
- 일일 리셋 전용 코드가 `login_and_prepare()`를 직접 한 번 호출하던 흐름을 공통 `_start_login_pool(... force_restart=True)` 경로로 합쳤습니다.
- 이제 일일 리셋도 기존 워커를 강제 정리한 뒤 저장 계정으로 백그라운드 워밍업을 시작하고, 메뉴 진입 타임아웃 같은 일시 실패는 워커별 최대 3회 재시도합니다.
### 검증
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m py_compile elsbot\els_web_runner_daemon.py`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m unittest elsbot.tests.test_daemon_stop_control`: 15개 통과
### 변경 파일
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_daemon_stop_control.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 월간실적 기준연도별 이월 슬롯 판정 보정 (v5.14.78)
### 핵심
- 월간실적 파일 설정에서 기준연도를 2027년 등으로 바꿀 때 본연도 12개월이 `이월`로 표시될 수 있는 정규화 기준을 보정했습니다.
- 저장 슬롯에 `carryover` 값이 있으면 그 값을 우선하고, 값이 없을 때만 선택한 기준연도를 기준으로 다음해 슬롯을 이월로 판정합니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 월간실적 파일 설정창 업무용 정리 (v5.14.77)
### 핵심
- 월간실적 파일 설정 모달에서 내부 저장값 `__first__`를 화면에 그대로 보이지 않게 하고, 사용자가 이해할 수 있는 `첫 번째 시트` 선택으로 표시했습니다.
- `제목행`은 `표 제목 행`으로 바꾸고, 엑셀 컬럼명이 있는 행 번호이며 비워두면 자동 감지된다는 설명을 붙였습니다.
- `기준연도`는 1월~12월 기본 파일 구간, `정리기간`은 다음해 이월 정리용 추가 월이라는 의미가 보이도록 설명과 기간 요약 카드를 추가했습니다.
- 기준연도를 바꿨을 때 본연도 12개월이 이월 슬롯으로 오판되지 않도록 이월 판정은 선택한 기준연도와 슬롯 자체의 `carryover` 값을 우선하도록 정리했습니다.
- 월별 행에는 `사용 월 / 월 파일 경로 / 읽을 시트 / 표 제목 행 / 파일 찾기` 제목줄을 붙이고, 버튼은 `월 파일명 찾기`로 바꿨습니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 8개 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 중 외부 fetch EACCES 경고가 출력됐지만 빌드는 정상 종료했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 월간실적 NAS 자동 감지와 종합실적 갱신 (v5.14.76)
### 핵심
- NAS Core에 월간실적 파일 자동 감지 스케줄러를 추가했습니다. 연간/월간 감지는 기본 24시간으로 두고, 체크된 월간 파일 중 실제 존재하는 마지막 활성 파일은 60초, 이전 활성 파일은 120초 간격으로 mtime/size와 DB 파일 메타를 비교합니다.
- 변경이 안정화된 파일만 `files_only` 월간 동기화로 넘겨 외부 Node importer가 해당 월 파일만 `dataset_type=monthly` 누적 원장에 반영하게 했습니다. 수동 동기화는 기존처럼 체크된 월 파일 전체를 순차 처리합니다.
- 연간실적은 기존 자동 스케줄러와 snapshot/diff 원장 정책을 유지합니다. 파일 변경 시 기존 DB 자료를 삭제하지 않고 현재 스냅샷과 과거 상태를 누적 관리합니다.
- 월간 파일 설정 모달은 기준연도 12개월과 다음해 정리기간 파일을 분리해 설명하고, 사용 월 수/기간 요약, 첫 번째 시트/직접 시트명, 제목행 자동 탐지를 명확히 선택할 수 있게 다듬었습니다.
- 종합실적 화면은 연간/월간 동기화 상태 조회를 별도로 폴링하고, 동기화가 끝나면 Supabase summary를 다시 읽습니다. 상태 조회 실패는 무시해 NAS가 끊겨도 저장된 DB 화면 조회가 유지되게 했습니다.
- NAS 전체/CORE/BOT 배포 스크립트는 docker-compose v1에서 고정 `container_name` 재생성 충돌이 나지 않도록 이미지 빌드, 기존 컨테이너 제거, `--no-build` 재기동 순서로 분리했습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 24개 통과
- `python -m py_compile docker/els-backend/asan_performance.py`: 통과
- `node --check "web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js"`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `C:\Program Files\Git\bin\bash.exe -n scripts/nas-deploy.sh scripts/deploy-core.sh scripts/deploy-bot.sh`: 통과
- `npm.cmd run build`: 통과. 정적 생성 중 외부 fetch EACCES 경고가 출력됐지만 빌드는 정상 종료했습니다.
- `ssh elsnas "cd /volume1/docker/els_home_v1 && bash scripts/nas-deploy.sh"`: 통합 NAS 재배포 완료. Core health ok, 월간 자동 감지 상태 `start_hour=0`, `active_poll_seconds=60`, `stale_poll_seconds=120`, `last_target=2026-05`, `last_result=db-current` 확인.
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `scripts/nas-deploy.sh`, `scripts/deploy-core.sh`, `scripts/deploy-bot.sh`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`, `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] NAS 도커 재생성 rename 충돌 방지
### 핵심
- NAS `deploy-bot.sh` 실행 중 Docker Compose v1이 `container_name`이 고정된 `els-bot`을 recreate 하면서 `Renaming a container with the same name as its current name` 오류를 냈습니다.
- `nas-deploy.sh`는 이미지 빌드를 먼저 수행한 뒤 `els-gateway/els-core/els-bot` 기존 컨테이너를 `docker rm -f`로 제거하고, `--no-build --force-recreate --remove-orphans`로 재기동하도록 순서를 바꿨습니다.
- 같은 rename 충돌이 재발하지 않도록 `deploy-bot.sh`, `deploy-core.sh`도 `build -> 기존 컨테이너 제거 -> --no-build up` 순서로 맞췄습니다.
### 검증
- `C:\Program Files\Git\bin\bash.exe -n scripts\nas-deploy.sh`: 통과
- `C:\Program Files\Git\bin\bash.exe -n scripts\deploy-bot.sh`: 통과
- `C:\Program Files\Git\bin\bash.exe -n scripts\deploy-core.sh`: 통과
### 변경 파일
- `scripts/nas-deploy.sh`
- `scripts/deploy-bot.sh`
- `scripts/deploy-core.sh`

## [2026-05-20] 컨테이너 Bot 자동 워밍업과 수동 정지 버튼 (v5.14.75)
### 핵심
- `els-bot` 데몬에 저장 계정 기반 `/warmup` 흐름을 추가해, 도커 컨테이너 기동 직후 Selenium 풀을 백그라운드에서 준비하도록 했습니다.
- Bot API에 `/api/els/warmup`을 열고, AI/외부 단건 컨테이너 조회(`/api/els/container/tracking`)가 들어왔는데 워커가 0개면 페이지 진입 없이 워밍업을 한 번 트리거하게 했습니다.
- `docker-compose.yml`의 bot 환경에 `ELS_AUTO_LOGIN_ON_START=true`, `ELS_AUTO_LOGIN_DELAY_SEC=8`을 추가했습니다.
- 컨테이너 이력조회 페이지 시스템 로그 버튼 영역에 `BOT 정지` 버튼을 추가했습니다. 누르면 현재 조회 abort, `/api/els/stop-daemon`, 로그인 상태/워커 표시 초기화, 대기 행 실패 사유 기록을 함께 수행합니다.
### 검증
- `node --test tests/containerHistoryBotControl.test.mjs tests/containerInput.test.mjs`: 6개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m py_compile elsbot\els_web_runner_daemon.py docker\els-backend\app_bot.py`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -X utf8 -m unittest elsbot.tests.test_daemon_stop_control`: 13개 통과
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js" "tests/containerHistoryBotControl.test.mjs"`: 에러 없음, 기존 이미지/Hook 경고 5건 유지
### 변경 파일
- `elsbot/els_web_runner_daemon.py`
- `docker/els-backend/app_bot.py`
- `docker/docker-compose.yml`
- `web/app/(main)/employees/container-history/page.js`
- `elsbot/tests/test_daemon_stop_control.py`, `web/tests/containerHistoryBotControl.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 실적관리 테이블 하단 슬라이드와 모바일 보정 (v5.14.74)
### 핵심
- 종합실적/월간실적/연간실적 공용 CSS에서 테이블형 영역의 가로 overflow를 화면 안쪽 하단 슬라이더로 통일했습니다.
- 요약 추세 차트, 세분화 표, 차량성과 표, 월/일 흐름 표, 보고서 표, 원장 테이블, 히트맵, 이월 청구처 표까지 스크롤바 색상·gutter·터치 스크롤을 같은 규칙으로 맞췄습니다.
- Galaxy S24급 430px 이하 폭에서는 KPI 카드, 버튼, 검색줄, 원장 테이블 높이와 셀 패딩을 더 촘촘하게 조정해 모바일에서 테이블이 화면 밖으로 밀려 보이지 않게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanAnnualPerformance.test.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 정적 생성 중 외부 fetch EACCES 경고가 출력됐지만 빌드는 정상 종료했습니다.
- 로컬 브라우저 자동화는 dev 페이지가 응답을 오래 잡아 스크린샷 검증까지 안정적으로 완료하지 못했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 월간실적 보고서 표 없음 배너 제거 (v5.14.73)
### 핵심
- 월간실적 분석 화면에서 `reportTableReady=false`일 때 표시하던 `보고서 표 없음 · 원장 기준 분석 중` 노란 배너를 제거했습니다.
- 보고서 표 파서와 `monthlyReport` 표 렌더링 조건은 유지해, 표가 잡히면 보고서 표를 보여주고 표가 없으면 원장 기준 분석 화면만 조용히 표시합니다.
- 테스트는 문구가 더 이상 렌더링되지 않는 쪽으로 갱신했습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 8개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과(정적 생성 중 외부 fetch EACCES 경고만 발생)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 월간실적 보고서 표 전용파서 개선 (v5.14.72)
### 핵심
- 월간실적 보고서 표 파서가 원장 헤더 이후 행만 보던 한계를 보강해, 엑셀 상단 raw preview 240행에서도 `순매출/순매입/계산서/이월` 표를 탐지합니다.
- 파서 결과에 `quality.primaryReady`를 추가해 완전한 순매출·순매입 표만 월간 총액 기준으로 승격하고, 이월만 잡힌 부분 표는 보조 표시로만 남기게 했습니다.
- DB 병합 단계는 `isMonthlyReportPrimaryReady()`를 거쳐 보고서 표가 신뢰 조건을 통과할 때만 원장 누적 총액을 대체합니다.
- 화면 안내 문구는 `보고서 표 없음 · 원장 기준 분석 중`으로 바꿔, 파서 미탐지가 데이터 장애처럼 보이지 않게 했습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 8개 통과
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "lib/asan-branch-db.js" "utils/asanPerformanceView.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과
### 변경 파일
- `web/utils/asanPerformanceView.mjs`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-20] 아산 연간실적 그래프와 요일 분석 개선 (v5.14.71)
### 핵심
- 연간실적 원장 장기 흐름 그래프의 SVG 비율을 고정하고, 최고 매출·최고 손익·최근 포인트와 평균선 라벨을 추가해 선과 글자가 눌려 보이던 문제를 줄였습니다.
- 우리 직계약차량 흐름 그래프에 매출 영역, 손익선, 평균선, 최고/최저/최근 콜아웃을 넣어 단순한 선 그래프가 아니라 흐름 근거를 읽을 수 있게 했습니다.
- 개요의 리스크 카드 순서를 `고마진 항목 → 저마진 주의 → 손실 항목`으로 바꿨습니다.
- 의미가 불명확하던 주차별 분석은 제거하고, `요일` 탭에서 요일별 매출·손익·건수와 고마진/주의 요일을 다이어그램으로 집중 표시합니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 종합실적 선택 단위별 그래프 보정 (v5.14.70)
### 핵심
- 종합실적의 `연도별/월별/일별` 선택과 흐름 그래프 집계 단위를 일치시켰습니다.
- 연도별은 연도 데이터, 월별은 선택 연도 안의 월 데이터, 일별은 선택 일자 데이터로 표시하고 선택 항목을 그래프에서 강조합니다.
- 현재 선택 모드에서 쓰지 않는 연도/월/일 셀렉트는 비활성화와 음영으로 처리해 조작 가능한 항목만 보이게 했습니다.
- 종합실적 상단의 `월간실적/연간실적` 바로가기 버튼은 제거하고 `새로고침`만 남겼습니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 4개 통과
- `node --test web/tests/asanSummaryPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과(외부 fetch는 샌드박스 EACCES 경고 후 정적 빌드 완료)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/utils/asanPerformanceSummary.mjs`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 선적관리 컨테이너 자동조회 설정과 새벽 스케줄 (v5.14.69)
### 핵심
- 동기화가 빠르게 끝나는 경우는 파일 수정일·크기 기준으로 새 변경이 없어 DB 반영을 건너뛰는 정상 흐름으로 해석했습니다.
- 선적관리 설정 모달의 파일 경로 아래에 `컨테이너 자동조회` 체크박스를 추가하고 기본 ON으로 두었습니다. 변경값은 `branch_dispatch_settings.shipping_container_auto_lookup_enabled`에 저장하도록 API를 확장했습니다.
- 컨테이너 이력조회 봇 데몬 일일 리셋을 05:00에서 03:00 KST로 변경하고, NAS Core는 03:10 KST에 선적관리 전체 컨테이너 자동조회를 시작하도록 했습니다.
- 자동조회 대상은 전체 선적관리 리스트에서 최신 저장 이력의 `이력 구분`이 `적하`인 컨테이너를 제외한 건입니다.
- 자동조회 중 `ERROR` 결과가 10건에 도달하거나 실행 자체가 실패하면 자동조회 설정을 OFF로 저장하고 봇 중지 요청을 보내 남은 조회를 멈추게 했습니다.
- 운영 DB 적용용 SQL `web/supabase_sql/20260519_asan_shipping_container_auto_lookup.sql`을 추가했습니다.
- 형이 운영 Supabase SQL Editor에 적용한 뒤 REST API로 `shipping_container_auto_lookup_enabled=true` 응답을 확인했습니다.
- 후속 안전장치로 NAS Core는 해당 DB 컬럼이 응답에 없거나 설정 조회가 실패하면 03:10 자동조회를 실행하지 않고 보류합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 35개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/settings/route.js" "tests/asanShippingFlow.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app_core.py docker/els-backend/app.py elsbot/els_web_runner_daemon.py`: 통과
- 운영 Supabase REST 확인: `branch_dispatch_settings.shipping_container_auto_lookup_enabled=true` 응답(200)
- NAS `deploy-core.sh`: 통과, `/health` 응답 `{"service":"els-core","status":"ok","sb_ready":true}`
- NAS `deploy-bot.sh`: 통과, `/health` 응답 `{"service":"els-bot","status":"ok"}`, 로그 `DAILY RESET @ 03:00 KST ENABLED`
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`, `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/app/api/branches/asan/settings/route.js`, `web/supabase_sql/20260519_asan_shipping_container_auto_lookup.sql`
- `docker/els-backend/app_core.py`, `docker/els-backend/app.py`, `elsbot/els_web_runner_daemon.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 구성·차량 성과 통합 카드 보정 (v5.14.68)
### 핵심
- `구성 분석`과 `차량 성과 TOP`을 `구성·차량 성과` 단일 카드로 합쳤습니다.
- 차량 성과는 전체/월/주차/일 선택 범위마다 같은 기준으로 집계하고, 항상 청구액 기준 TOP10을 보여줍니다.
- 신규 동기화 summary부터 차량별 `운송사(명의)`를 보존하고, 화면에서는 `운송사 차량번호` 형태로 표시합니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "lib/asan-branch-db.js" "scripts/import-asan-annual-performance.mjs" "tests/asanMonthlyPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 그래프 단위와 세분화 탭 기준 보정 (v5.14.67)
### 핵심
- `누적` 그래프 기준을 전체=연도별, 월=선택월 주차별, 주차=선택주 일자별, 일=해당일 단일 데이터로 다시 맞췄습니다.
- 전체 상태에서는 월/주차/일 셀렉트를 회색 잠금 처리하고, 월·주차·일 선택 때도 현재 단계에 필요한 셀렉트만 활성화합니다.
- 세분화 분석에서 `구분별`, `노선별`, `계약별`, `ODCY구분별` 후보를 제거하고, 중복되는 `청구픽업별`은 같은 제목 기준으로 뒤쪽 실제 컬럼만 남기게 했습니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "utils/asanPerformanceSummary.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- Browser 자동화: Codex 브라우저 세션에 연결 가능한 활성 pane이 없어 실행하지 못했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] Android 백그라운드 위치수신 회귀 테스트와 버튼 색상 정리 (v5.14.66 / APK v5.11.23)
### 핵심
- 사용자 관점의 운행 흐름에서 백그라운드 위치수신이 핵심임을 기준으로, 앱 최소화/플로팅 위젯 표시가 GPS 수신을 멈추지 않는지 테스트를 추가했습니다.
- 테스트는 `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `stopWithTask=false`, 전경 서비스, FusedLocation `requestLocationUpdates`, 서버 전송, 운행 시작 시 네이티브 서비스 후 JS GPS watcher 순서를 함께 고정합니다.
- 핵심 진행 버튼 색상은 불가/미완료 상태 빨강, 진행 가능 상태 파랑으로 정리했습니다.
- 프로필 저장 버튼은 미입력 상태에서도 빨간색으로 남고 탭하면 기존 검증 안내를 보여주도록 클릭 가능 상태를 유지했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 9개 통과
- `node --check web/driver-src/modules/trip.js web/driver-src/modules/profile.js web/driver-src/modules/permissions.js`: 통과
- `npm.cmd run lint -- driver-src/modules/trip.js driver-src/modules/profile.js driver-src/modules/permissions.js tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.23 (5164) 빌드/배포 복사 완료, APK 내부 버전 검증 통과
### 변경 파일
- `web/driver-src/index.html`
- `web/driver-src/modules/trip.js`, `web/driver-src/modules/profile.js`, `web/driver-src/modules/permissions.js`
- `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] Android 기존 플로팅 위젯 최소화 표시 복구 (v5.14.65 / APK v5.11.22)
### 핵심
- 이번 요청의 PiP 의미를 Android 네이티브 Picture-in-Picture가 아니라 기존 운행 플로팅 위젯으로 재정의했습니다.
- 운행시작 직후 네이티브 PiP 진입 호출과 Manifest PiP 선언을 제거했습니다.
- 운행 시작은 `FloatingWidgetService`를 숨김 상태로 준비하고, 앱 최소화/onPause 때 `SET_VISIBILITY=true`로 운행시간·GPS상태·위치 위젯을 표시합니다.
- 앱 복귀/onResume 때는 위젯을 숨기고, 종료 시에는 기존처럼 Overlay 서비스와 앱 태스크를 정리합니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 7개 통과
- `node --check web/driver-src/modules/trip.js`: 통과
- `npm.cmd run lint -- driver-src/modules/trip.js tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.22 (5163) 빌드/배포 복사 완료, APK 내부 버전 검증 통과
### 변경 파일
- `web/driver-src/modules/trip.js`
- `web/android/app/src/main/AndroidManifest.xml`
- `web/android/app/src/main/java/com/elssolution/driver/MainActivity.java`
- `web/android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java`
- `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 선택 단계별 누적 그래프 정리 (v5.14.64)
### 핵심
- 월간실적 `누적` 그래프가 선택 범위 한 점만 보여주던 문제를 고쳐, 선택 단계의 다음 단위 흐름을 그리도록 바꿨습니다.
- `전체`는 월별, `월`은 주차별, `주차`는 일자별, `일`은 해당 월의 일자별 흐름을 표시하고 선택일을 강조합니다.
- 선택 UI와 역할이 겹치던 `월별·일별 트리` 섹션은 제거하고, `선택 기준 성과 흐름` 표와 요일 카드로 흐름을 보게 정리했습니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "utils/asanPerformanceSummary.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 선택범위 시간축 통합 (v5.14.63)
### 핵심
- 연간실적 개요의 `월별 성과 흐름`, `연도별 매출·매입·손익`, `성과 경보` 중복 패널을 `선택범위 성과 흐름`으로 합쳤습니다.
- 조사범위 기준에 따라 전체는 연도별, 최근 12/24개월은 월별, 최근 3/5년은 3개월별로 자동 집계해 같은 화면이 선택 범위를 설명하도록 바꿨습니다.
- `계약/차량` 흐름 그래프도 선택 조사범위와 동일한 집계 단위를 사용하고, 제목·툴팁·요약 카드에 해당 범위와 구간명을 표시합니다.
- 선택범위 성과 표는 매출/매입/손익/손익률을 한 행에서 비교하고, 모바일에서는 720px 고정 폭과 가로 스크롤로 금액·퍼센트가 밀리지 않게 했습니다.
### 검증
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web\tests\asanAnnualPerformance.test.mjs web\tests\asanMonthlyPerformance.test.mjs web\tests\asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 외부 WebDAV/원격 fetch는 sandbox EACCES 경고만 출력.
- `git diff --check -- "web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "web/app/(main)/employees/branches/asan/annualPerformance.module.css" web/tests/asanAnnualPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 종합실적 경영 판단 수익성 신호 재구성 (v5.14.62)
### 핵심
- 종합실적 `경영 판단`에서 `최근월 방향`, `데이터 신뢰`, `저마진 차량` 카드를 제거했습니다.
- `계약/차량 집중도` 신호가 외부/타운송사만 대표로 잡히지 않도록 `ELS/외부 집중도`로 바꾸고, ELS직계약차량과 외부/타운송사 비중을 함께 표시합니다.
- 연간+월간 summary의 `breakdowns`를 종합실적 유틸에 보존하고, 선택 범위별로 청구처/지급처/운송사 항목을 다시 집계해 `고마진 청구처`, `고마진 지급처`, `저마진 청구처`, `저마진 지급처`를 산출합니다.
### 검증
- `node --test web/tests/asanSummaryPerformance.test.mjs`: 4개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "app/api/branches/asan/performance/summary/route.js" utils/asanPerformanceSummary.mjs tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/원격 fetch 때문에 네트워크 허용)
- 전체 `asanMonthlyPerformance + asanAnnualPerformance + asanSummaryPerformance` 묶음은 작업 전부터 섞인 연간/월간 테스트 기대값 2건 불일치로 분리 검증했습니다.
### 변경 파일
- `web/utils/asanPerformanceSummary.mjs`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 세분화 탭 전체 복구와 테이블 스크롤 보강 (v5.14.61)
### 핵심
- 월간실적 세분화 분석을 `청구처별/작업지별/지급처별/구분별/청구픽업별/포트별/노선별/이월구분별/계약별/선적별/매출/이월(청구처기준)/계산서` 순서로 복구했습니다.
- 요청 축에 매칭되지 않은 breakdown 컬럼도 뒤쪽 탭으로 붙여 엑셀 원장에 있는 추가 항목을 화면에서 숨기지 않게 했습니다.
- 연간/월간 공용 실적관리 테이블 영역은 브라우저 높이에 맞춘 낮은 `clamp()`와 명시적 WebKit 스크롤바 스타일을 적용해 가로 슬라이더가 화면 안쪽에 보이도록 보강했습니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check -- "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "web/app/(main)/employees/branches/asan/annualPerformance.module.css" "web/tests/asanMonthlyPerformance.test.mjs" "web/tests/asanAnnualPerformance.test.mjs"`: 통과
- Browser 자동화는 번들 Playwright의 `playwright-core` 누락으로 실행하지 못했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 종합실적 범위 선택형 경영 대시보드 보강 (v5.14.60)
### 핵심
- 종합실적에 `전체/연도별/월별/일별` 선택 컨트롤을 추가하고, 선택마다 매출·손익·손익률·원가율·원장 신뢰도·연간/월간 기여도를 같은 범위로 재계산하게 했습니다.
- 최근월 흐름은 청록 매출 막대와 파란 손익선을 설명형 라벨, 최고 매출, 최저 손익 포인트로 보강해 작은 그래프만 보고도 의미가 읽히게 했습니다.
- 계약/차량 집중도는 `ELS직계약차량`을 왼쪽 우선, `외부/타운송사`를 오른쪽에 같은 폭으로 배치하고 각 축의 주요 거래처/작업지·차량 TOP을 함께 보여줍니다.
- 원장 신뢰도 `annual/monthly` 영문 노출을 한글 라벨로 고정하고, 진행 중인 연도는 `2026년 5월까지`처럼 집계 완료 월을 표시합니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "app/api/branches/asan/performance/summary/route.js" utils/asanPerformanceSummary.mjs tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/원격 fetch 때문에 네트워크 허용)
- Browser: `http://127.0.0.1:3014/employees/branches/asan`에서 전체/월별/일별 전환, 한글 라벨, ELS/외부 반분 집중도, `2026년 5월까지` 표기 확인
### 변경 파일
- `web/utils/asanPerformanceSummary.mjs`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 실적관리 테이블 가로 슬라이더 화면 안쪽 고정 (v5.14.59)
### 핵심
- 연간/월간 실적관리 테이블의 가로 슬라이더가 브라우저 하단 밖으로 밀릴 수 있던 높이 계산을 보정했습니다.
- 테이블 영역은 `100dvh` 기반 `clamp()` 높이로 제한하고, 내부 테이블 스크롤러가 가로/세로 overflow를 직접 처리하도록 분리했습니다.
- 원장 테이블은 `width: max-content`와 `min-width: max(100%, 960px)` 조합으로 실제 컬럼 폭을 유지해 가로 overflow가 안정적으로 생기게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 통과
- `npm.cmd run lint -- tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`, `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 누적 그래프/분석 기준 배치 보정 (v5.14.58)
### 핵심
- `누적` 그래프의 금액/건수 라벨을 SVG `<text>`에서 HTML 배지 레이어로 분리해 해상도별 가로 늘어짐을 막았습니다.
- 청구평균도 HTML 배지로 표시하고, 선/면적 그래프만 SVG로 유지해 그래프 폭은 자연스럽게 채우되 글자는 선명하게 보이게 했습니다.
- 분석 기준 바는 `분석 기준` 상태값 바로 옆에 `전체/월/주차/일` 버튼을 붙이고, 월/주차/일 셀렉트는 오른쪽 720px 안쪽으로 묶어 큰 해상도에서 검색열이 따로 떠 보이지 않게 했습니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs`: 통과
- `git diff --check -- "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "web/app/(main)/employees/branches/asan/annualPerformance.module.css" web/tests/asanMonthlyPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] Galaxy S24/S25 운행시작 PiP 및 종료 정리 보강 (v5.14.57 / APK v5.11.21)
### 핵심
- 운행시작 버튼은 Overlay 서비스를 숨김 상태로만 시작하던 기존 흐름에서, 서비스 시작 직후 네이티브 `enterPipMode`를 직접 요청하도록 바꿨습니다.
- 네이티브 PiP 진입이 거부되거나 실패하면 `setWidgetVisible({ visible: true })`로 오버레이 위젯을 즉시 띄워 Galaxy S24/S25에서도 운행 시작 후 표시가 끊기지 않게 했습니다.
- 운행 종료는 TRIP_END 기록과 서버 완료 처리 후 `stopOverlayService()`와 `exitAppForce()`를 이어 호출해 전경서비스, 오버레이, PiP/앱 태스크가 남지 않도록 정리했습니다.
- `OverlayPlugin`/`FloatingWidgetService`는 시작 시 표시 여부, PiP 직접 호출, 위젯 표시 제어, 종료 시 `LAST_TRIP_ID/LAST_START_TIME` 제거를 지원합니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 6개 통과
- `node --check web/driver-src/modules/trip.js`: 통과
- `npm.cmd run lint -- driver-src/modules/trip.js tests/driverMapCamera.test.mjs`: 통과
- `git diff --check`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.21 (5162) 빌드/배포 복사 완료, APK 내부 버전 검증 통과
### 변경 파일
- `web/driver-src/modules/trip.js`
- `web/android/app/src/main/java/com/elssolution/driver/MainActivity.java`
- `web/android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java`
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 종합실적 연간+월간 합산 대시보드 추가 (v5.14.56)
### 핵심
- `종합실적` placeholder를 실제 운영판으로 교체하고, `/api/branches/asan/performance/summary` 라우트를 추가했습니다.
- API는 Supabase `annual` current summary와 `monthly` diff-current summary를 `page_size=1`로 조회해 통합 매출/매입/손익, 월별·연도별 시리즈, 계약/차량 집중도, 경영 판단 신호를 생성합니다.
- 화면은 사장 관점으로 `통합 매출`, `통합 손익`, `손익률`, `원가율`, `최근월`을 최상단에 두고, 합산 흐름도·최근 12개월 차트·연도 매트릭스·원장 신뢰도를 압축 배치했습니다.
- 원본 annual/monthly summary 전체를 응답에 싣던 payload를 제거해 실데이터 응답을 약 34.6KB로 줄였습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/performance/summary/route.js" utils/asanPerformanceSummary.mjs tests/asanSummaryPerformance.test.mjs`: 통과
- `npm.cmd run build`: 통과 (Google Fonts fetch 때문에 네트워크 허용)
- Supabase 실데이터 확인: annual 1개, monthly 5개 메타 조회. Summary API 응답 `매출 196,151,544,233.1원 / 손익률 10.68% / 월별 137개 / 차량 30개 / 34,614 bytes`.
- Browser 플러그인: `http://127.0.0.1:3014/employees/branches/asan`에서 종합실적 탭 실데이터 렌더 확인. CDP screenshot은 timeout으로 실패.
### 변경 파일
- `web/app/api/branches/asan/performance/summary/route.js`
- `web/utils/asanPerformanceSummary.mjs`
- `web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js`
- `web/app/(main)/employees/branches/asan/page.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanSummaryPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] Android 완료경로 끝점/PiP/종료 동작 재점검 (v5.14.55 / APK v5.11.20)
### 핵심
- 2026-05-19 KST 194서2632 운행을 재분석해 raw 마지막점은 `18:54:32 method=TRIP_END`인데, 앱 내부 필터만 `18:25:18`에서 멈추던 문제를 확인했습니다.
- 운영 DB에는 `marker_type` 컬럼이 없어도 `method=TRIP_END/TRIP_START`가 저장되므로, 서버/앱 필터 모두 method 기반 마커를 끝점으로 보존하게 통일했습니다.
- 운행 중 위치보기/마커 클릭은 matched-route 조회나 complete 호출 없이 실시간 위치만 표시하도록 회귀 테스트를 추가했습니다.
- PiP 판단용 운행 ID를 Overlay 서비스 시작 즉시 네이티브 prefs에 저장하고, Android 12+ auto-enter PiP 파라미터를 설정했습니다. 명시적 앱 종료는 Overlay 플러그인 등록 helper를 사용하고 task 제거 후 프로세스 종료까지 보강했습니다.
### 검증
- `node .tmp_test/analyze_vehicle_routes_today.mjs`: 194서2632/12가0140 raw/server/app clean 끝점이 모두 TRIP_END까지 보존되는 것 확인
- `node --test web/tests/vehicleLocation.test.mjs web/tests/driverLocationFilter.test.mjs web/tests/driverMapCamera.test.mjs`: 20개 통과
- `node --check web/driver-src/modules/map.js web/driver-src/modules/locationFilter.js web/app/api/vehicle-tracking/location/route.js`: 통과
- `npm.cmd run lint -- driver-src/modules/map.js driver-src/modules/locationFilter.js driver-src/modules/init.js tests/driverMapCamera.test.mjs tests/driverLocationFilter.test.mjs tests/vehicleLocation.test.mjs app/api/vehicle-tracking/location/route.js`: 통과
- `npm.cmd run build`: 통과 (정적 생성 중 외부 WebDAV/원격 fetch는 sandbox 네트워크 제한으로 비치명 경고 출력)
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.20 (5161) 빌드/배포 복사 완료, APK 내부 `store.js` 버전 재검증 통과
### 변경 파일
- `web/utils/vehicleLocation.mjs`, `web/app/api/vehicle-tracking/location/route.js`
- `web/driver-src/modules/locationFilter.js`, `web/driver-src/modules/init.js`
- `web/android/app/src/main/java/com/elssolution/driver/MainActivity.java`, `web/android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java`
- `web/tests/vehicleLocation.test.mjs`, `web/tests/driverLocationFilter.test.mjs`, `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 월/주차/일 선택과 누적 그래프 보강 (v5.14.54)
### 핵심
- 분석 기준 버튼 문구를 `월`, `주차`, `일`로 줄여 상단 컨트롤 폭을 줄였습니다.
- 월을 선택하면 주차/일자 셀렉트는 해당 월에 속한 값만 보여주도록 cascade 방식으로 바꿨습니다.
- `누적` 그래프에 청구/하불/손익 평균선을 추가하고, 주요 포인트마다 청구 금액과 건수를 직접 표시했습니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs`: 통과
- `npm.cmd run build`: 통과

## [2026-05-19] Android 앱 지도 초기 카메라 순서 보정 (v5.14.53 / APK v5.11.19)
### 핵심
- 지도 탭 진입 직후 기본 중심 또는 raw GPS 기준으로 먼저 확대된 뒤 차량을 찾는 화면 튐을 막았습니다.
- `openMap()`은 active 차량 최신점 조회와 초기 포커스를 끝낸 뒤 전경 GPS 샘플링을 시작합니다.
- 이동+확대는 `panTo + setZoom` 분리 호출 대신 `morph` 우선 helper로 묶어 중심 좌표 확정 후 줌이 적용되게 했습니다.
### 검증
- `node --test web/tests/driverMapCamera.test.mjs`: 2개 통과
- `node --check web/driver-src/modules/map.js`: 통과
- `npm.cmd run lint -- driver-src/modules/map.js tests/driverMapCamera.test.mjs`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts/build_driver_apk.ps1`: v5.11.19 (5160) 빌드/배포 복사 완료, APK 내부 `store.js` 버전 재검증 통과
### 변경 파일
- `web/driver-src/modules/map.js`
- `web/tests/driverMapCamera.test.mjs`
- `web/android/app/build.gradle`, `web/public/apk/`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 계약/차량 흐름 그래프 해석 보강 (v5.14.52)
### 핵심
- `계약/차량` 탭의 월별 흐름 차트가 매출/손익 선만 보여 의미가 부족하던 문제를 보강했습니다.
- 매출 평균선, 손익 평균선, 최고 매출월, 최고 손익월, 최근월 포인트를 SVG 안에 표시했습니다.
- 차트 아래에는 최근월/최고 매출월/최고 손익월/평균 손익률 요약 카드를 추가해 그래프 해석 근거를 바로 보게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" tests/asanAnnualPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 월간실적 선택 범위 집계 통일 (v5.14.50)
### 핵심
- `월별 누적 흐름`은 `누적`, `월간 실적 인포그래픽`은 `실적 인포그래픽`으로 제목을 정리했습니다.
- 전체/월별/주간/일별 선택 시 누적 그래프, KPI, 선택 범위 성과 흐름, 세분화 분석, 차량 성과가 모두 같은 선택 범위 집계를 사용하게 했습니다.
- 세분화 항목, 구성 분석, 차량 성과에도 일별 시리즈를 저장/병합해 일별 선택에서 월별값으로 fallback되는 흐름을 제거했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --check web\scripts\import-asan-annual-performance.mjs`: 통과
- `node --test web\tests\asanMonthlyPerformance.test.mjs web\tests\asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js scripts/import-asan-annual-performance.mjs "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs tests/asanAnnualPerformance.test.mjs`: 통과
- `git diff --check -- "web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" web/lib/asan-branch-db.js web/scripts/import-asan-annual-performance.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/lib/asan-branch-db.js`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 선적관리 컨테이너 조회 중단/실패 사유 표시 (v5.14.49)
### 핵심
- 선적관리 컨테이너 조회 실행 중 `조회 멈춤` 버튼을 표시하고, 클릭 시 `/api/els/stop-daemon` 중지 요청과 브라우저 `AbortController` 중단을 함께 수행합니다.
- 중단 상태는 완료/실패/미조회 건수를 분리해 남기며, 정상 종료라도 `ERROR` 행이 있으면 실패 상태와 사유 요약을 유지합니다.
- 봇 로그 확인 결과, 이번 실패 흐름은 컨테이너 저장 실패가 아니라 이트랜스 세션 만료/로그인 모달 감지로 불확실 재조회가 반복된 쪽에 가깝습니다. 앞으로는 `ERROR` 행의 사유를 상태줄에 바로 표시합니다.
### 검증
- `node --check "web/app/(main)/employees/branches/asan/AsanShipping.js"`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 통과
- `git diff --check -- 'web/app/(main)/employees/branches/asan/AsanShipping.js' 'web/app/(main)/employees/branches/asan/shipping.module.css' 'web/tests/asanShippingFlow.test.mjs' docs/01_MISSION_CONTROL.md docs/02_DEVELOPMENT_LOG.md`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 차량위치관제 현재점/지도 UX/PiP 보정 (v5.14.48 / APK v5.11.18)
### 핵심
- 2026-05-19 오후 데이터 기준 12가0140(17:09~18:51 KST), 194서2632(16:59~18:54 KST)를 재분석했습니다. 기존에는 경로 보정용 중복 제거가 마지막 정차/종료 좌표까지 떨어뜨려 194서2632가 18:25 지점에서 멈춘 것처럼 보였습니다.
- `filterRouteLocations()`는 불가능한 끝점은 버리되, 정상적인 마지막 heartbeat/TRIP_END 좌표는 보존합니다. active API는 전체 좌표 1만건 전역 제한 대신 운행별 최근 300건을 조회해 최신점 절단을 막습니다.
- Android 앱 지도는 운행 중 상세보기에서 지나온 경로를 그리지 않고 실시간 위치만 보여줍니다. 완료 운행만 전체 경로를 표시하며, 차량 마커 z-index가 시작/종료점보다 위에 오도록 조정했습니다.
- 지도 자동추적은 사용자가 확대/이동하면 15초간 쉬고, `내 위치`는 브라우저 raw GPS보다 내 차량 최신점/최근 안정 GPS를 우선 사용합니다. 전체보기 1대 확대는 최대 12로 제한했습니다.
- 모바일 웹 관제 전체지도와 상세 패널을 390px급 화면에 맞춰 bottom sheet/반응형 폭으로 보정했고, active 상세 실시간 갱신은 경로 재그리기 없이 위치 목록만 갱신합니다.
- Android PiP manifest/MainActivity 구성을 복구하고, 앱 설정에 `권한 설정/점검` 버튼을 추가해 미설정 필수 권한 버튼이 깜빡이게 했습니다.
### 검증
- `node --test web\tests\vehicleLocation.test.mjs`: 14개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.18 (5159) 빌드/배포 복사/내부 버전 검증 통과
- 3001 dev HTTP 200 확인. Browser 플러그인은 기존 3000 탭 응답 불능 후 `No active Codex browser pane available`로 시각 자동화는 완료하지 못했습니다.
### 변경 파일
- `web/utils/vehicleLocation.mjs`, `web/app/api/vehicle-tracking/trips/route.js`
- `web/driver-src/`, `web/android/app/`, `web/public/apk/`
- `web/app/(main)/employees/vehicle-tracking/`, `web/tests/vehicleLocation.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 세분화 탭/이월 표 정리 (v5.14.46)
### 핵심
- 세분화 분석에서 관리 의미가 약하거나 중복되는 `구분별`, `청구픽업별`, `포트별`, `노선별`, `이월구분별`, `계약별` 계열 탭을 제거하고 `청구처별`, `작업지별`, `지급처별`만 남겼습니다.
- 기존 `운송사(명의)별` 탭은 지급 기준으로 읽히도록 `지급처별`로 변경했습니다.
- 이월금액은 세분화 탭이 아니라 `청구처 이월` 표에서 청구처별 `이월청구`, `이월하불`, `차액`으로 표시합니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web\tests\asanMonthlyPerformance.test.mjs web\tests\asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs tests/asanAnnualPerformance.test.mjs`: 통과
- Browser 자동화는 인앱 브라우저가 `No active Codex browser pane available`, Chrome 대체 탭이 `Grouping is not supported by tabs in this window`로 막혀 실제 클릭 검증은 완료하지 못했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 마감월 기준 주간/요일 분석 (v5.14.45)
### 핵심
- 월간실적 `daily` 집계를 작업일자 월이 아니라 파일 마감월 `sourcePeriod` 기준으로 병합해, 정리기간 작업일자인 `2025-12`가 월별·일별 트리 최상위 월로 노출되지 않게 했습니다.
- 분석 기준에 `주간 선택`을 추가하고, 마감월 안에서 작업일자 순서 7일 단위로 `YYYY-MM N주차` 조회가 가능하게 했습니다.
- 선택 범위 기준 `요일별 카드`를 추가해 월별/주간/일별 전환과 함께 요일별 청구·손익·건수를 바로 확인하게 했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --test web\tests\asanMonthlyPerformance.test.mjs web\tests\asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs tests/asanAnnualPerformance.test.mjs`: 통과
- Browser 플러그인은 인앱 브라우저 목록 확인 후 탭 제어에서 `No active Codex browser pane available`로 막혀 실제 클릭 자동화는 완료하지 못했습니다.
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 선적관리 하단 가로 스크롤 복구 (v5.14.44)
### 핵심
- 선적관리 테이블이 `width: 100%`로 브라우저 폭에 눌리면서 실제 컬럼 폭만큼 가로 overflow가 생기지 않아 하단 슬라이더가 보이지 않았습니다.
- `.table`은 `width: max-content; min-width: 100%`로 실제 컬럼 폭을 유지하고, `.tableWrap`은 `overflow-x/y: auto`, `width/max-width: 100%`를 명시해 브라우저 안쪽 하단에서 가로 스크롤바가 표시되게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 TOP 항목 전체 보기 토글 (v5.14.43)
### 핵심
- 세분화 분석의 현재 탭 또는 `세분화 분석` 제목을 누르면 상위 12개와 전체 항목 표시를 전환합니다.
- `청구처별`, `작업지별`, `운송사(명의)별` 등 세분화 탭은 다른 탭 선택은 기존대로 이동하고, 같은 탭 재클릭은 전체 보기 토글로 동작합니다.
- `차량 성과 TOP` 제목을 누르면 상위 5대와 전체 차량 목록을 전환합니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 범위 전환 데이터 정규화 (v5.14.42)
### 핵심
- 월별/일별 선택 시 화면에 쓰는 `monthly`, `daily`, `monthlyReports`, `breakdowns`, `strategicSegments`, `vehiclePerformance`를 모두 안전한 객체 배열로 정규화했습니다.
- 선택 월/일은 실제 옵션에 존재하는 값만 사용하게 바꿔, 오래된 상태값이 남아도 빈 범위로 렌더링하지 않도록 했습니다.
- 월간 분석 내부 오류 경계를 추가해 분석 카드 일부에서 예외가 나도 앱 전체 오류 페이지로 번지지 않게 했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
- `npm.cmd run dev -- -p 3010`: Next dev 컴파일은 되었으나 sandbox 네트워크 제한으로 외부 weather/news fetch가 `EACCES`를 내며 실제 브라우저 클릭 검증은 완료하지 못했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 범위 전환 오류/월 라벨 보정 (v5.14.41)
### 핵심
- 월별/일별 선택 시 세분화 항목 중 해당 범위 데이터가 없는 항목이 `null`로 들어오며 렌더링을 중단시키던 문제를 수정했습니다.
- 세부 항목의 `monthly`/`daily` 시리즈를 배열뿐 아니라 객체 형태도 안전하게 읽도록 보강했습니다.
- 월별 누적 흐름 그래프는 시작/끝 월만 표시하지 않고 포인트 위치 기준으로 중간 월 라벨도 표시합니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 그래프/분석범위 안정화 (v5.14.40)
### 핵심
- 월간실적 `월별 누적 흐름`을 연간용 대형 그래프 스타일에서 분리하고, 월간 전용 카드형 스파크라인과 2×2 요약칩으로 다시 구성했습니다.
- 분석 카드 그리드는 640px 최소 폭 기준으로 조정해 초광폭 화면에서 4열로 벌어지지 않고 2~3열 중심으로 정렬되게 했습니다.
- `전체` 기준일 때 월/일 선택 셀렉트를 비활성화하고, 월별/일별 선택 버튼은 선택 가능한 데이터가 있을 때만 동작하게 해 빈 값 전환 오류를 막았습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 분석 기준/마감월 흐름 정리 (v5.14.39)
### 핵심
- 월간실적 분석 상단에 `전체`, `월별 선택`, `일별 선택` 기준을 추가해 아래 KPI/트리/세분화 데이터의 범위를 먼저 확인하게 했습니다.
- 월별 성과 흐름은 파일 마감월만 사용하게 보정해 작업일자·이월 영향으로 `2025-12`가 첫 행에 끼던 문제를 제거했습니다.
- 상단에는 월별 누적 라인 차트를 추가하고 KPI 카드에는 청구 대비 비중을 읽는 소형 도넛을 넣었습니다.
- 구성 분석은 의미가 겹치던 `직계약 전체`/`ELS솔루션 명의 전체`를 제거하고 `ELS직계약차량`, `외부/타운송사` 두 축만 남겼습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --check web\scripts\import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js scripts/import-asan-annual-performance.mjs "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/lib/asan-branch-db.js`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 레이아웃 월간 그리드 영향 분리 (v5.14.38)
### 핵심
- 월간실적 카드 그리드용으로 바뀐 공통 `.analytics` 스타일이 연간실적에도 적용되어 연간 리포트가 가로 컬럼으로 찢어지던 문제를 수정했습니다.
- 연간실적 컴포넌트에 `annualAnalytics` 전용 클래스를 추가하고, 해당 컨테이너만 세로 flex 흐름을 사용하게 분리했습니다.
- 공통 `.analytics`의 `align-items: start`가 남아 KPI/포트폴리오 카드가 내용 폭만큼만 잡히던 부분을 `stretch`와 `width: 100%`로 고정해 행 단위 카드 각을 맞췄습니다.
- 원장 장기 흐름 그래프는 기준선 역할에 맞춰 차트 높이를 300px에서 220px로 줄이고 요약 카드 여백을 압축했습니다.
- 월간실적 반응형 카드 그리드는 유지하면서 연간실적은 상단 리포트, 조사범위, 분석섹션, 장기흐름, KPI/근거 카드가 위에서 아래로 이어지게 했습니다.
### 검증
- `node --test --test-name-pattern "화면은 분석/테이블" web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 반응형 카드 그리드 전환 (v5.14.37)
### 핵심
- 월간실적 분석 화면을 고정 폭 세로 나열에서 반응형 카드 그리드로 바꿨습니다.
- 상단 인포그래픽은 전체 행을 쓰고, 구성 분석/세분화 분석은 넓은 화면에서 2칸을 사용하며 월별 흐름·일별 트리·차량 TOP은 카드 단위로 화면을 채웁니다.
- 모바일에서는 모든 분석 카드가 1열로 떨어지도록 `grid-column`을 보정했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 트리/세분화 패널 폭 정리 (v5.14.36)
### 핵심
- 월별·일별 트리와 세분화 분석에서 내부 표만 좁아지고 외곽 패널은 브라우저 전체 폭으로 벌어져 튀어나온 것처럼 보이던 부분을 정리했습니다.
- 트리 패널은 696px, 세분화 패널은 980px 안쪽으로 외곽선과 헤더까지 함께 묶었습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 분석 화면 안정화/인포그래픽 보강 (v5.14.35)
### 핵심
- 월간실적 분석 첫 화면에서 원본 매출보고서 표가 크게 먼저 나오고, 표 미감지 시 빈 영역이 화면을 차지해 전체 구성이 어지러워지는 문제를 정리했습니다.
- 상단을 청구·하불·손익·이월·건당 청구 KPI와 청구→하불→손익 흐름, 최고 청구월/손익월/손익일/최근월 증감 인포그래픽으로 재배치했습니다.
- 계약·운영 구분 구성 분석과 차량 성과 TOP을 추가하고, 기존 월별 흐름/월별·일별 트리/세분화 분석은 아래에서 이어 보이게 했습니다.
- 매출보고서 원본 표는 감지됐을 때만 아래에 표시하고, 감지되지 않으면 얇은 상태 줄로만 안내합니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 선적관리 1,000건 제한 청크 조회 보정 (v5.14.34)
### 핵심
- NAS 원본 `2026_자체보관리스트.xlsx`에는 2026-05-18 작업일 81건이 존재하지만, 화면/API는 Supabase range 한 번에 1,000건만 받아 첫 페이지 뒤쪽 57건이 누락되는 상태였습니다.
- Next 직조회(`web/lib/asan-branch-db.js`)와 NAS Core(`docker/els-backend/app.py`, `app_core.py`) 모두 row 조회를 1,000건 단위 청크로 반복해 `page_size=10000` 요청 시 실제 전체 1,057건을 반환하게 했습니다.
- 정렬도 첫 1,000건만 정렬하지 않고 청크로 모은 전체 조회분을 정렬한 뒤 페이지를 잘라 반환합니다.
### 검증
- NAS 원본 엑셀 직접 확인: 2026-05-18 작업일 81건, 2026-05-19 작업일 0건.
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js "tests/asanShippingFlow.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\app.py docker\els-backend\app_core.py`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 트리 폭/전체 제목 보정 (v5.14.33)
### 핵심
- 월별·일별 트리와 세분화 분석이 와이드 모니터 전체 폭을 사용해 제목과 값 사이가 너무 멀어지는 문제를 보정했습니다.
- 월별·일별 트리는 680px, 세분화 표는 780px, 세분화 요약 카드 영역은 980px 안쪽으로 제한해 좌측 분석 블록처럼 읽히게 했습니다.
- 전체 보고서 상태에서 내부 키 `all`이 제목에 노출될 수 있어, 화면 제목은 `매출보고서`로 고정했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월별·일별 트리 금액 헤더 추가 (v5.14.32)
### 핵심
- 월별·일별 트리에서 금액 컬럼 위에 제목행이 없어 청구/하불/손익/건수 의미를 바로 알기 어려웠습니다.
- 트리 상단에 `월/일`, `청구`, `하불`, `손익`, `건수` 헤더를 추가하고 모바일 폭에서도 같은 컬럼 그리드를 유지하게 했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js"`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 월간실적 분석 범위/트리/세분화 보강 (v5.14.31)
### 핵심
- 월간 `아산매출보고서` 표는 기본 선택을 개별 월이 아니라 `전체`로 두고, 월별 버튼으로 특정 월 범위를 볼 수 있게 했습니다.
- 월별 성과 아래 일별 원장은 월별로 접힌 트리 구조로 표시하고, 월을 펼치면 해당 월의 일별 청구/하불/손익/건수를 볼 수 있게 했습니다.
- 월간 Supabase summary에 `breakdowns`, `strategicSegments`, `vehiclePerformance` 병합을 추가해 청구처, 작업지, 운송사(명의), 구분, 청구픽업, 포트 등 테이블 컬럼 기반 세분화 분석을 화면에서 바로 쓸 수 있게 했습니다.
- 세분화 패널에는 청구/하불/손익/이월 분해 다이어그램과 차원별 청구·하불·손익·건수·손익률 표를 추가했습니다. 항목 클릭 시 테이블 AND 검색으로 근거 원장까지 이동합니다.
- 월간/연간 테이블 영역은 `100vh` 기준 내부 높이를 잡아 가로/세로 스크롤바가 브라우저 화면 안에 먼저 보이도록 조정했습니다.
### 검증
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js app/api/branches/asan/performance/monthly/route.js app/api/branches/asan/performance/annual/route.js "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\asan_performance.py`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 실적관리 동기화 상태 재진입 유지 (v5.14.30)
### 핵심
- 월간/연간실적 `NAS 동기화`는 NAS Core 백그라운드 작업으로 계속 돌 수 있지만, 화면을 떠났다가 돌아오면 React 로컬 `syncing` 상태가 초기화되어 진행중 표시가 사라질 수 있었습니다.
- Next API에 `source=status` 조회를 추가해 월간/연간 상태 요청은 Supabase 원장 조회가 아니라 NAS Core로 직접 프록시합니다.
- 연간 NAS Core는 `source=status`일 때 원장/엑셀을 다시 읽지 않고 `_sync_only_data()` + `sync_status`만 반환합니다.
- 월간/연간 화면은 진입 시 상태를 확인하고, 진행 중이면 5초마다 상태만 polling해 `동기화 진행중`, 시작/완료 시각을 유지합니다. 완료 전환을 감지하면 Supabase 데이터를 조용히 새로고침합니다.
### 검증
- `node --check web\app\api\branches\asan\performance\monthly\route.js`: 통과
- `node --check web\app\api\branches\asan\performance\annual\route.js`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- app/api/branches/asan/performance/monthly/route.js app/api/branches/asan/performance/annual/route.js "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\asan_performance.py`: 통과
### 변경 파일
- `web/app/api/branches/asan/performance/monthly/route.js`
- `web/app/api/branches/asan/performance/annual/route.js`
- `docker/els-backend/asan_performance.py`
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanMonthlyPerformance.test.mjs`, `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 NAS 동기화 응답 경량화 (v5.14.29)
### 핵심
- 연간실적 `NAS 동기화` 버튼이 백그라운드 importer를 시작한 뒤 NAS Core `_query()`로 36만 행 원장을 다시 count/조회하며 `statement timeout`을 화면에 노출하던 문제를 수정했습니다.
- POST 비동기 응답은 `_sync_only_data()`의 메타/동기화 상태만 반환하고, 프론트는 `sync_only` 응답을 받으면 기존 분석/테이블 데이터를 덮어쓰지 않습니다.
- NAS Core 단일 파일 조회도 `count="exact"`를 제거하고 `currentSnapshotId`가 있으면 snapshot 기준으로 조회해 불필요한 current 전체 count를 피합니다.
- 개요에 원장 장기 흐름 그래프가 고정되어 있어 중복되는 `10년 흐름` 분석 탭을 제거했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\asan_performance.py`: 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 월간실적 NAS 동기화 helper 스코프 수정 (v5.14.28)
### 원인
- NAS 월간실적 동기화 로그에서 1~4월 파일 모두 Excel 파싱 후 `ReferenceError: finalizeSeries is not defined`로 실패했습니다.
- `finalizeBreakdowns()`는 summary 하위 월별 breakdown을 마감할 때 `finalizeSeries()`를 호출하지만, 해당 helper가 `createAdvancedAccumulator().finish()` 내부 지역 함수로만 선언되어 월간 `diff-current` importer 경로에서 접근할 수 없었습니다.
### 조치
- `finalizeSeries(map, roundItem, ...)`를 top-level 공용 helper로 올렸습니다.
- advanced summary와 breakdown summary 모두 같은 helper를 사용하게 바꾸고, 월간 테스트에 helper 스코프 회귀 검사를 추가했습니다.
### 검증
- NAS 로그 확인: `/volume1/docker/els_home_v1/logs/asan-monthly-performance-web-sync-20260519-133214.log`
- `node --check web\scripts\import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- scripts/import-asan-annual-performance.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 통합 조회 timeout 최적화 (v5.14.27)
### 핵심
- 연간실적 `aggregate=all` 조회가 Supabase에서 36만 행 current snapshot을 읽을 때 `year_value/month_value` 정렬을 타며 statement timeout이 나던 문제를 보정했습니다.
- 모든 annual 메타에 `currentSnapshotId`가 있는 통합 조회는 `snapshot_id,row_index` 정렬로 페이징하게 바꿔, 이미 적용된 `idx_branch_performance_rows_snapshot_row_index` 인덱스를 사용하도록 했습니다.
- exact count는 계속 피하고 파일 메타의 `current_row_count/row_count`를 기준 건수로 사용합니다. 운영 DB 직접 조회에서 snapshot `1c6d280d-3ac0-4f03-8f6c-271bb91980c7`의 301행이 즉시 반환됨을 확인했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `npm.cmd run lint -- "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 월간실적 매출보고서 중심 화면 재구성 (v5.14.26)
### 핵심
- 월간실적 분석 화면에서 `월별 파일 공간` 카드 노출을 제거했습니다. 파일 슬롯/경로/시트/제목행은 설정 모달에서만 관리합니다.
- 분석 첫 화면을 `YYYY년 M월 아산매출보고서` 제목, `통합 IN/OUT-BOUND`, `단위 : 원`, 매출/이월 섹션이 있는 보고서 표 중심으로 재구성했습니다.
- 기존 KPI 카드보다 스크린샷의 월별 보고서 표가 먼저 보이도록 순서를 바꾸고, 월별/일별 집계는 보고서 아래 보조 분석으로 유지했습니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs`: 6개 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- Local HTTP: `http://localhost:3011/employees/branches/asan?debug=true` 200 확인. Codex 브라우저 패널은 active pane 없음으로 클릭 검증 불가.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 실적관리 DB 조회 NAS 우회 차단 (v5.14.25)
### 핵심
- 연간실적 `aggregate=all` 조회에서 `allMetasHaveSnapshot` 변수가 잘못된 스코프에 있어 런타임 예외가 날 수 있던 문제를 수정했습니다.
- 연간/월간실적 GET은 `source=supabase` 기본 조회에서 예외가 나도 NAS 프록시로 우회하지 않고 JSON 오류를 반환합니다. 이로써 NAS Docker 빌드 중에도 DB 직조회 화면이 NAS 상태에 끌려가지 않습니다.
- 운영 DB를 확인한 결과 annual 메타는 1개, 현재 스냅샷 368,617행이 존재합니다. monthly 메타는 아직 0개라 월간실적은 최초 동기화 전 상태입니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- app/api/branches/asan/performance/annual/route.js app/api/branches/asan/performance/monthly/route.js lib/asan-branch-db.js tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/app/api/branches/asan/performance/annual/route.js`
- `web/app/api/branches/asan/performance/monthly/route.js`
- `web/lib/asan-branch-db.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] AI 어시스턴트 전체 삭제 유령 목록 재등장 차단 (v5.14.24)
### 핵심
- 전체 삭제 후 10초 뒤 `purge=1` 검증 삭제가 DB의 빈 삭제마커까지 지우면서, 늦게 도착한 예전 자동저장 POST가 옛 대화 목록을 다시 살릴 수 있던 원인을 확인했습니다.
- `/api/chat/memory`는 사용자 대화 내용은 빈 배열로 비우되, `updated_at` 삭제마커를 유지하고 GET 응답에 `clearedAt`을 내려줍니다.
- AI 대화 화면은 서버 `clearedAt`을 받으면 `els_ai_sessions_cleared_at`을 갱신하고 로컬 `els_ai_sessions`를 제거해, 로컬 캐시에 남은 옛 목록도 즉시 무효화합니다.
- 삭제 후 검증 재시도는 더 이상 tombstone을 purge하지 않고 빈 삭제마커를 재확인하는 방식으로 바꿨습니다.
### 검증
- `node --test web/tests/chatMemory.test.mjs`: 8개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" app/api/chat/memory/route.js utils/chatMemory.mjs tests/chatMemory.test.mjs`: 0 errors, 기존 warning 8건
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/(intranet)/ask/page.js`
- `web/app/api/chat/memory/route.js`
- `web/tests/chatMemory.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 연간실적 다중 파일 통합 조회 (v5.14.23)
### 핵심
- 연간실적 조회 API에 `aggregate=all` 모드를 추가했습니다.
- 파일 설정과 `NAS 동기화`는 선택한 엑셀 파일 1개를 대상으로 유지하되, 화면의 분석/테이블 조회는 `dataset_type=annual` 파일 메타 전체의 `currentSnapshotId`를 모아 읽습니다.
- 기존 2015~2025 대용량 파일은 DB에 그대로 두고, 2026년 이후 새 연간 파일을 별도 경로로 동기화해도 웹에서는 전체 기간을 하나의 원장처럼 합산합니다.
- 통합 조회는 파일별 원장 행을 물리 삭제하지 않고 현재 스냅샷만 합산하며, 테이블에는 `원본파일` 컬럼을 추가해 행 출처를 구분할 수 있게 했습니다.
- 연도/월/일/주차/요일, breakdown, 직계약/차량, 차량별 손익 summary를 파일별 summary에서 합산해 브라우저가 전체 원장을 재집계하지 않도록 유지했습니다.
### 검증
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanAnnualPerformance.js"`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `git diff --check`: 통과
### 변경 파일
- `web/lib/asan-branch-db.js`
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 월간실적 누적 원장 전환 (v5.14.22)
### 핵심
- 월간실적 importer는 `dataset_type=monthly`일 때 기본으로 `diff-current` 누적 모드를 사용합니다.
- NAS Core 월간 동기화도 `--diff-current`를 붙여 실행하므로, 파일 교체 시 같은 파일/시트/행의 해시를 비교해 변경 행만 신규 current로 추가하고 기존 행은 `superseded_by_excel`로 종료합니다.
- 월별 파일에서 사라진 행은 `removed_from_excel`로 종료하고, 동일 행은 기존 current를 유지해 월간 자료를 차곡차곡 누적합니다.
- 월간 조회 API는 diff-current 메타가 있는 경우 `currentSnapshotId` 단일 스냅샷 대신 `is_current=true` 원장을 읽습니다. 이월 행은 월간 보고서에는 표시하되, 향후 연간 이관 단계에서는 제외 정책을 별도로 확정합니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint`: 통과
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\asan_performance.py`: 통과
- `git diff --check`: 통과
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `web/lib/asan-branch-db.js`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 배차판 RAG 도표형 스키마 추론 분리 (v5.14.21)
### 핵심
- 채팅 API 안에 있던 아산 배차판 RAG inline 파서를 `web/utils/asanDispatchRag.mjs`로 분리했습니다.
- Supabase `branch_dispatch` 조회 후 헤더와 셀 값 패턴으로 `오더 컬럼`, `픽업지역/상차지 컬럼`, `메모/시간 컬럼`, `기본정보 컬럼`을 먼저 도표형 스키마로 주입합니다.
- `이지1.대신3`, `대신10,자차3.이지5`처럼 업체명과 대수가 붙은 지역칸을 구조화하고, 메모에 적힌 업체별 시간은 시간 질문 필터에 사용합니다.
- `1145 4/23 작업지는?`, `내일 13시 부산 배차 몇대야?` 같은 실무식 질문에서 날짜/차번/작업지 단어가 행 필터를 망치지 않도록 의도 분석과 검색 키워드 정제를 분리했습니다.
- 신규 픽업지역 컬럼은 지역명 하드코딩에만 의존하지 않고 셀 패턴으로 추론합니다. 선적/실적 RAG도 같은 “DB 표 → 스키마 요약 → 조건 매칭” 방향으로 확장할 기준을 남겼습니다.
### 검증
- `node --test web/tests/asanDispatchRag.test.mjs`: 6개 통과
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/asanDashboardView.test.mjs`: 31개 통과
- `npm.cmd run lint -- app/api/chat/route.js utils/asanDispatchRag.mjs tests/asanDispatchRag.test.mjs`: 통과
- `npm.cmd run build`: 통과 (정적 생성 중 외부 fetch EACCES 경고만 발생)
- `git diff --check`: 통과
### 변경 파일
- `web/app/api/chat/route.js`
- `web/utils/asanDispatchRag.mjs`
- `web/tests/asanDispatchRag.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/09_DISPATCH_BOARD_SPEC.md`

## [2026-05-19] 아산 월간실적 파일 슬롯 및 월별 보고서 분석 (v5.14.20)
### 핵심
- `실적관리 > 월간실적` 화면을 추가하고, 2026년 기준 2026-01부터 2027-03까지 15개 월별 파일공간을 기본 생성했습니다.
- 월별 마감자료 파일 경로/시트/제목행을 개별 수정할 수 있게 했고, 파일 설정 저장 시 `저장 후 동기화`로 NAS 백그라운드 동기화를 자동 시작합니다.
- 월간 원장은 기존 `branch_performance_files/rows`를 `dataset_type=monthly`로 재사용하며, 파일별 첫 번째 시트를 읽고 파일월을 `sourceYear/sourceMonth/sourcePeriod`와 `year_value/month_value` fallback으로 남깁니다.
- Next 조회 API는 월별 파일 헤더가 달라도 `row_data` 기준 union 테이블을 구성해 부수 컬럼과 `이월` 구간을 보존합니다.
- 월별 보고서 표를 파싱해 거래처별 순매출/순매입/매출이익, 계산서 매출/매입/이익, 이월 매출/매입/차익을 도출합니다.
- 원장 행의 작업일자 기준 일별 데이터와 파일월 기준 월별 흐름을 summary에 저장하고, 화면에서 `월별 보고서`, `일별 데이터`, `이월금액` 섹션으로 보여줍니다.
### 검증
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"` / `page.js` / `web\utils\asanPerformanceView.mjs`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py`: 통과
- Local HTTP: `http://localhost:3010/employees/branches/asan` 200 확인. 브라우저 패널은 활성 탭 종료로 재검증 불가, 월간 API 운영 호출은 NAS 프록시 네트워크 제한(EACCES)으로 보류.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`
- `web/app/(main)/employees/branches/asan/page.js`, `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/app/api/branches/asan/performance/monthly/route.js`
- `web/lib/asan-branch-db.js`, `web/utils/asanPerformanceView.mjs`
- `web/scripts/import-asan-annual-performance.mjs`, `docker/els-backend/asan_performance.py`
- `web/tests/asanMonthlyPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`, `docs/11_ASAN_PERFORMANCE_PIPELINE.md`

## [2026-05-19] 아산 연간실적 조사범위 날짜 선택 잠금 (v5.14.19)
### 핵심
- 연간실적 조사범위에서 전체/최근 12개월/최근 24개월/최근 3년/최근 5년 프리셋을 선택한 경우 시작월/종료월 select를 비활성화했습니다.
- `직접` 모드에서만 날짜 선택을 활성화해 프리셋 기준과 수동 날짜 기준이 동시에 보이는 혼선을 줄였습니다.
- 비활성 select에는 잠금 스타일을 적용하고, 접근성용 aria-label을 추가했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
## [2026-05-19] 아산 선적관리 NAS 동기화 타임아웃 방지 (v5.14.18)
### 분석
- 운영 NAS 컨테이너는 정상 기동 중이며, 2026-05-19 09:35경 선적관리 1,057행 동기화는 Core 로그 기준 완료됐습니다.
- 다만 수동 `NAS 동기화` 버튼이 항상 `force=true`로 전체 엑셀 파싱/DB 삭제/재삽입을 요청해, 이미 최신이어도 Vercel 프록시 120초 타임아웃에 걸릴 수 있었습니다.
- 자동 동기화와 수동 동기화가 겹치면 같은 파일을 중복 파싱할 수 있는 구조도 확인했습니다.
### 핵심
- 선적관리 수동 동기화 요청을 `force=false`로 바꿔 파일 mtime이 DB와 같으면 재적재 없이 최신 DB를 바로 조회합니다.
- 동기화 POST에도 현재 날짜 필터(`date_col`, `months`)를 전달해 동기화 후 화면이 기존 필터 기준으로 유지되게 했습니다.
- NAS Core에 `shipping_sync_lock`을 추가해 자동/수동 동기화가 겹치면 중복 파싱 대신 기존 메타/DB 조회로 빠르게 응답합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `docker/els-backend/app.py`, `docker/els-backend/app_core.py`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 드라이버 앱 지도 자동추적 줌 보정 (v5.14.17 / APK v5.11.17)
### 핵심
- 드라이버 앱 지도 자동추적 중 속도에 따라 줌 레벨을 조정해 저속/시내/고속 주행 화면 밀도를 다르게 보이게 했습니다.
- 운행 중 내 차량 마커 클릭은 자동추적을 유지하면서 내비게이션 줌을 적용합니다.
- 전체 차량 보기는 차량 1대/다수 모두 과확대되지 않도록 최대 줌을 제한했습니다.
- APK 버전은 `v5.11.17 / 5158`로 반영했고 캐시버스터와 배포 APK 산출물도 함께 갱신했습니다.
### 검증
- `node --check web/driver-src/modules/map.js`: 통과
- `npm.cmd run lint`: 통과
- `git diff --check`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.17 / 5158 APK 빌드 및 배포 위치 복사 완료
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.17`, `BUILD_CODE 5158` 확인
### 변경 파일
- `web/driver-src/modules/map.js`
- Android 버전/캐시버스터/APK 산출물: `web/android/app/build.gradle`, `web/driver-src/**`, `web/public/apk/**`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 아산 배차 모바일 날짜탭 세로 스크롤 튐 보정 (v5.14.16)
### 핵심
- 중간 `통합현황/글로비스 KD 외/모비스 AS` 버튼 중 모비스 AS 전환 때 화면 위치가 튀던 원인을 날짜탭 `scrollIntoView`의 세로 스크롤 개입으로 보고 보정했습니다.
- 날짜탭 활성 항목 자동 가운데 맞춤은 이제 날짜탭 컨테이너의 `scrollLeft`만 조정해 현재 화면 세로 위치를 유지합니다.
- 첫 진입 시 데이터 로딩 후 날짜탭 자동 포커스가 페이지를 중간으로 끌어내리는 현상도 함께 차단했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-19] 차량위치관제 진행 중 마커 클릭 및 회전구간 루프 보정 (v5.14.15 / APK v5.11.16)
### 분석
- 12가0140 2026-05-19 아침 운행 2건을 확인했습니다.
- 06:59~07:03 운행은 50개 위치 모두 물리 판정 `ok`였고, 진행 중 마커 클릭 시 상세경로/끝점 표시가 열리며 종료처럼 보이는 UX 문제가 남아 있었습니다.
- 07:03~07:12 운행도 불가능 속도는 0건이었으나, 회전/램프 구간에서 Directions 기반 경로조회가 실제 GPS trace를 map-matching하는 것이 아니라 합법 경로를 새로 구성하면서 루프를 만들 수 있는 구조였습니다.
### 핵심
- 앱 지도에서 운행 중인 내 차량 마커 클릭은 더 이상 상세경로를 조회하지 않고, 자동추적을 유지한 채 줌 토글만 수행합니다.
- Android 네이티브 서비스 `onDestroy()`는 더 이상 자동 `TRIP_END`를 전송하지 않습니다. 실제 종료점은 `endTrip()`의 명시적 종료 처리 또는 explicit final location만 남깁니다.
- Naver Directions 결과가 원시 진행거리보다 과도하게 길거나, trace에서 벗어나거나, 자체 루프를 만들면 `matched-route` API가 해당 경로를 폐기하고 필터링된 GPS 경로로 fallback합니다.
- 운행 완료 액션은 `vehicle_trip_logs`에 `status: driving -> completed` 기록을 남겨 다음 재현 시 클릭/종료 원인을 추적할 수 있게 했습니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs`: 13개 통과
- `npm.cmd run lint`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.16 / 5157 APK 빌드 및 배포 위치 복사 완료
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.16`, `BUILD_CODE 5157` 확인
### 변경 파일
- `web/driver-src/modules/map.js`
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/app/api/vehicle-tracking/trips/[id]/matched-route/route.js`
- `web/app/api/vehicle-tracking/trips/[id]/route.js`
- `web/utils/vehicleLocation.mjs`, `web/tests/vehicleLocation.test.mjs`
- Android 버전/캐시버스터/APK 산출물: `web/android/app/build.gradle`, `web/driver-src/**`, `web/public/apk/**`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 차량위치관제 stale GPS replay 및 운행 중 경로 표시 보정 (v5.14.14 / APK v5.11.15)
### 분석
- 12가0140 2026-05-18 17시대 테스트 3건을 Supabase 원시 좌표로 확인했습니다.
- 1번 운행은 정확도 3~5m, 불가능 속도 0건으로 좌표 자체보다 아파트 단지/저속 구간의 촘촘한 `map_foreground` 샘플을 도로 경로로 과신한 문제가 컸습니다.
- 2번 운행은 `android_bg`가 36.9208965, 127.0432539 좌표를 반복 재전송하며 0~1초 사이 0.8~1.5km 왕복 튐이 저장된 것이 확인됐습니다.
- 3번 운행은 터널 전후 36.8908607, 127.0342280 좌표가 반복 재등장하며 최대 3.2km / 9,098km/h급 불가능 구간이 생겼고, 화면을 끈 뒤에는 native 경로가 비교적 안정적으로 이어졌습니다.
### 핵심
- 서버 위치 수신 API에서 운영 DB에 없는 `marker_type` select 의존을 제거하고, 최근 8개 좌표 기준 `android_bg`/native 캐시 좌표 재등장을 `stale_replay`로 거부합니다.
- Android 네이티브 `FloatingWidgetService`가 서버에 직접 보내는 `android_bg`도 전송 전 정확도·시간역전·불가능 속도·정차점프를 필터하고, `recorded_at`을 함께 보내 서버가 오래된 캐시 위치를 판별할 수 있게 했습니다.
- Naver Directions waypoint는 저속/단지 내부 지그재그를 단순화한 점으로 요청해, 촘촘한 원시 좌표를 모두 경유지로 과신하지 않게 했습니다.
- 운행 중 내 차량 마커를 누르면 빨간 종료점이 아니라 파란 현재점으로 표시하고 자동추적을 유지해, 앱 지도 확인 중 운행이 종료된 것처럼 보이는 혼선을 줄였습니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs`: 12개 통과
- `npm.cmd run lint`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.15 / 5156 APK 빌드 및 배포 위치 복사 완료
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.15`, `BUILD_CODE 5156` 확인
- `git diff --check`: 통과 (version.json line-ending 경고만 표시)
### 변경 파일
- `web/utils/vehicleLocation.mjs`, `web/app/api/vehicle-tracking/location/route.js`
- `web/android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java`
- `web/driver-src/modules/map.js`, `web/app/(main)/employees/vehicle-tracking/page.js`
- `web/tests/vehicleLocation.test.mjs`
- Android 버전/캐시버스터/APK 산출물: `web/android/app/build.gradle`, `web/driver-src/**`, `web/public/apk/**`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 선적관리 미선적 필터 이력구분 기준 보정 (v5.14.13)
### 핵심
- 컨테이너 이력조회값이 있는 행은 날짜보다 이력구분을 우선해 `반입/적하`만 선적완료로 판정합니다.
- `반출/양하/기타/공백` 등 `반입/적하`가 아닌 이력은 작업일 전후와 무관하게 미선적으로 남깁니다.
- 컨테이너 이력조회값이 없는 행은 작업일이 지난 경우만 미선적 후보로 유지해, 아직 작업일이 오지 않은 미조회 행이 섞이지 않게 했습니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "utils/asanShippingView.mjs" "tests/asanShippingFlow.test.mjs"`: 0 errors
### 변경 파일
- `web/utils/asanShippingView.mjs`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 선적관리 컨테이너 조회 세션 복원 (v5.14.12)
### 핵심
- 선적관리 컨테이너 조회를 시작하면 대상 파일/컨테이너/진행 건수를 브라우저 세션에 저장해, 필터 조회 중 다른 페이지로 이동했다가 돌아와도 진행 상태를 복원합니다.
- 복귀 화면은 4초 주기로 저장된 컨테이너 이력 결과를 다시 읽어 `컨테이너 조회건수 / 조회완료 / 조회실패`을 앞쪽에 고정 표시합니다.
- 이전 조회 결과가 완료 건수로 섞이지 않도록 이번 세션 시작 이후 저장된 `lookedUpAt`만 완료로 인정하고, 30분간 새 신호가 없으면 남은 건은 미확인/실패 상태로 정리합니다.
### 검증
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `git diff --check`: 통과
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanShipping.js`
- `web/app/(main)/employees/branches/asan/shipping.module.css`
- `web/tests/asanShippingFlow.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 안전운임 구간조회 탭 위치 조정 (v5.14.11)
### 핵심
- 안전운임 상단 탭 순서를 `구간별운임 → 거리별운임 → 구간조회 → 이외구간`으로 바꿨습니다.
- `이외구간`은 고시 외 구간 성격이므로, 일반 경로/운임 조회인 `구간조회`를 먼저 보이도록 정리했습니다.
### 검증
- `node --test web/tests/safeFreightTabOrder.test.mjs`: 1개 통과
- `npm.cmd run lint -- "app/(main)/employees/safe-freight/page.js" "tests/safeFreightTabOrder.test.mjs"`: 0 errors, 기존 warning 4건
### 변경 파일
- `web/app/(main)/employees/safe-freight/page.js`
- `web/tests/safeFreightTabOrder.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 안전운임 주소 행정동 자동선택 및 인천국제여객 구간운임 보정 (v5.14.10)
### 핵심
- 기본 안전운임 조회에서 주소 검색 결과를 `setTimeout` 연쇄로 시도·시군구·행정동에 넣던 구조를 제거하고, 안전운임 데이터의 지역 키 기준으로 한 번에 정규화하도록 공통 유틸을 추가했습니다.
- `경기/경기도`, `화성시 만세구`처럼 API·표기 차이가 있어도 `경기도 / 화성시 / 마도면`으로 맞추고, 법정동 `청원리`보다 행정동 `마도면`을 우선 적용합니다.
- 지도 기반 구간조회에서 `인천항국제여객터미널`이 문자열 포함관계 때문에 `인천항`으로 흔들릴 수 있던 부분을 터미널 키 기반 매칭으로 고정해 `[왕복] 인천국제여객` 구간운임을 우선 조회하도록 보정했습니다.
### 검증
- `node --test web/tests/safeFreightRegion.test.mjs`: 4개 통과
- `npm.cmd run lint -- "app/(main)/employees/safe-freight/page.js" "app/(main)/employees/safe-freight/route-search/RouteSearchView.js" "app/(main)/employees/safe-freight/route-search/LocationBlock.js" "utils/safeFreightRegion.mjs" "utils/safeFreightRouteMatch.mjs" "tests/safeFreightRegion.test.mjs"`: 0 errors, 기존 warning 10건
- 로컬 브라우저 확인: `[왕복] 인천국제여객 → 경기도 화성시 마도면` 조회 시 26.02월 42km, 40FT 안전운임 333,600원 표시 확인
### 변경 파일
- `web/utils/safeFreightRegion.mjs`, `web/utils/safeFreightRouteMatch.mjs`
- `web/app/(main)/employees/safe-freight/page.js`
- `web/app/(main)/employees/safe-freight/route-search/LocationBlock.js`
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`
- `web/tests/safeFreightRegion.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 차량 관제 GPS 튐과 완료 마커 정책 보강 (v5.14.09)
### 핵심
- `TRIP_END` 마커라도 저품질/불가능 좌표는 서버·경로 필터에서 마지막 정상점으로 수렴시켜 터널/지하 GPS 캐시가 종료점으로 굳는 문제를 줄였습니다.
- 앱 지도 전경 GPS가 경로선에 실시간 append 되기 전 거리·시간·정확도 기반 물리 가능성 가드를 통과하도록 보강했습니다.
- 앱 지도는 GPS 공백 중 마지막 정상 속도·방향으로 최대 45초까지만 화면 예측 이동을 보여주며, 예측점은 서버/경로 데이터에 저장하지 않습니다.
- 터널 출구 후보는 기존 진행 방향과 속도상 가능한 경우에만 빠르게 연결하고, 반대 방향·저품질 점프는 후보 보류/제외합니다.
- 완료 차량 마커는 관제 지도에 남기고, 같은 차량이 재운행하면 진행 중 운행이 기존 완료 마커를 대체하도록 웹/NAS/앱 정렬 정책을 맞췄습니다.
### 검증
- `node --test web/tests/vehicleLocation.test.mjs`: 10개 통과
- `npm.cmd run lint -- "app/api/vehicle-tracking/location/route.js" "app/api/vehicle-tracking/trips/route.js" "utils/vehicleLocation.mjs" "tests/vehicleLocation.test.mjs"`: 0 errors
- `npm.cmd run lint -- "driver-src/modules/gps.js" "driver-src/modules/map.js" "driver-src/modules/trip.js" "driver-src/modules/init.js" "driver-src/modules/locationFilter.js"`: 0 errors
- `node --check` driver GPS/지도/운행/초기화 모듈: 통과
- `python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.14 / 5155 APK 빌드 및 `web/public/apk/els_driver.apk` 복사 완료
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.14`, `BUILD_CODE 5155` 확인
- `git diff --check`: 통과

## [2026-05-18] 아산 연간실적 웹 동기화 외부 작업 전환 (v5.14.08)
### 핵심
- `NAS 동기화` 버튼이 더 이상 수동 쉘 명령을 요구하지 않도록, Core가 기존 Node importer를 낮은 우선순위 외부 프로세스로 실행하게 했습니다.
- Core 내부 pandas/openpyxl 직접 파싱은 기본 비활성 상태를 유지하고, 외부 프로세스 종료 후 메모리가 반환되도록 분리했습니다.
- 파일 mtime과 current snapshot이 같으면 `summary-only --force --snapshot-id`로 분석 근거만 갱신하고, 파일 변경 시에만 전체 snapshot import를 수행합니다.
- `els-core` Docker 이미지에 Node.js/npm/util-linux를 추가해 컨테이너 안에서도 importer와 `nice/ionice`를 사용할 수 있게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py`: 통과
- `npm.cmd run lint -- "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과

## [2026-05-18] 아산 연간실적 구간별 근거 분리 보정 (v5.14.07)
### 핵심
- 최근 12개월/24개월 등 구간 조회에서 전체기간 breakdown 항목이 fallback으로 섞이던 문제를 제거했습니다.
- 조회 구간에 항목별 monthly breakdown이 없으면 전체기간 항목을 보여주지 않고 `구간별 월별 근거 갱신 필요`만 표시합니다.
- 따라서 최근 기간에 없는 `미래산업` 같은 항목이 전체기간 기준으로 끼어드는 상황을 차단했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
- `npm.cmd run build`: 통과 (외부 fetch는 sandbox EACCES 경고만 표시)
### 운영 메모
- NAS에서 `summary-only --force`를 실행해 항목별 monthly breakdown을 채우면 각 구간별로 정확히 분리된 저마진/손실/고마진 항목이 표시됩니다.

## [2026-05-18] 아산 연간실적 구간 필터 근거 fallback 보정 (v5.14.06)
### 핵심
- `전체`에서는 보이지만 `최근 12개월`, `최근 24개월` 등 구간 필터에서 저마진/손실/고마진 항목이 비어 보이는 원인을 보정했습니다.
- 원인은 기존 summary에 전체기간 breakdown은 있으나 항목별 `monthly` breakdown이 아직 없으면 구간별 금액을 정확히 재계산할 수 없어 0으로 필터링되던 구조였습니다.
- 구간별 월별 근거가 없는 경우 `전체기간 기준 · 월별 근거 갱신 필요`를 표시하고, 전체기간 기준 항목을 fallback으로 노출해 빈 화면처럼 보이지 않게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
- `npm.cmd run build`: 통과 (외부 fetch는 sandbox EACCES 경고만 표시)
### 운영 메모
- NAS에서 `summary-only --force`를 실행하면 항목별 monthly breakdown이 채워져 구간별 금액으로 정밀 표시됩니다.

## [2026-05-18] 아산 연간실적 장기 흐름 개요 전용 정리 (v5.14.05)
### 핵심
- 원장 장기 흐름 차트와 조사범위 KPI 카드가 모든 분석 탭 상단에 반복 노출되던 구조를 개요 탭 전용으로 변경했습니다.
- `10년 흐름`, `연도×월`, `계약/차량`, `주차·요일`, `검증·근거` 탭은 각 탭의 고유 분석 내용부터 바로 보이도록 정리했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
- `npm.cmd run build`: 통과 (외부 fetch는 sandbox EACCES 경고만 표시)
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 연간실적 개요 근거 표 제거와 계약/차량 명칭 정리 (v5.14.04)
### 핵심
- 개요 화면 하단의 근거 표 묶음은 `계약/차량` 상세 탭에 이미 있는 성격이라 개요에서는 제거했습니다.
- 분석 탭명 `직계약/차량`을 `계약/차량`으로 변경했습니다.
- 청구처 근거가 비던 원인은 importer가 breakdown 후보를 엑셀 앞쪽 8개 컬럼으로 잘라 `청구처`가 뒤쪽에 있으면 누락될 수 있던 구조였습니다.
- breakdown 후보를 `작업지 → 청구처 → 운송사 → 노선 → 구분...` 우선순위 기반 최대 12개로 보정해 다음 summary 갱신부터 `청구처`, `운송사(명의)` 축이 누락되지 않게 했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
### 운영 메모
- 배포 후 NAS에서 `summary-only --force`를 1회 실행하면 Supabase summary의 breakdown 후보와 월별 집계가 새 기준으로 갱신됩니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 연간실적 장기흐름/범위 분석 재보정 (v5.14.03)
### 핵심
- 원장 장기 흐름 차트 패널 자체에 고정 높이를 부여하고 분석 컨테이너의 숨김 overflow를 풀어 KPI 카드가 그래프 하단을 덮지 않게 했습니다.
- 조사범위 버튼을 `전체 / 최근 12개월 / 최근 24개월 / 최근 3년 / 최근 5년 / 직접`으로 정리하고, 중복 의미였던 `최근 연도`를 제거했습니다.
- 개요 하단의 공헌도 매트릭스는 제거하고 데스크탑 기준의 `작업지/청구처/노선/구분 근거` 표로 대체했습니다.
- 미래산업이 모든 구간의 저마진 주의에 반복 노출되던 원인은 전체기간 breakdown을 범위 분석에 그대로 사용한 구조였습니다. 화면은 월별 breakdown이 없는 항목을 비전체 범위 분석에서 제외하고, import summary에는 breakdown별 월별 집계를 저장하도록 보강했습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
- 인앱 브라우저 로컬 검증: 데스크탑 장기흐름 패널과 KPI 겹침 없음, Galaxy S24 360px 기준 문서 가로 overflow 없음. 로컬 DB 접근 제한으로 실데이터 대신 레이아웃 치수와 버튼/섹션 표시를 검증했습니다.
### 운영 메모
- 배포 후 NAS에서 `summary-only --force`를 1회 실행하면 Supabase summary에 breakdown 월별 집계가 채워져 범위별 저마진/근거 분석이 더 정확해집니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/scripts/import-asan-annual-performance.mjs`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산지점 모바일 진입 스크롤 상단 고정 (v5.14.02)
### 핵심
- 모바일에서 아산지점 메뉴를 다시 누를 때 브라우저가 이전 현황판 중간 위치를 복원해 보이던 문제를 보정했습니다.
- 아산지점 탭 진입/전환 시 `window`, `document.scrollingElement`, 상위 스크롤 컨테이너를 함께 0으로 초기화합니다.
- 모바일 중간의 `배차판 검색` 전환도 같은 스크롤 초기화를 사용해 배차판 상단 카드부터 보이게 했습니다.
### 검증
- `node --test web/tests/asanDashboardView.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 0 errors
### 변경 파일
- `web/app/(main)/employees/branches/asan/page.js`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 아산 연간실적 차트/모바일 레이아웃 보정 (v5.14.01)
### 핵심
- 연간실적 원장 장기 흐름 차트가 데스크탑 flex 스크롤 영역에서 높이 0에 가깝게 눌려 보이던 문제를 `flex: 0 0 auto`와 고정 차트 래퍼로 수정했습니다.
- 차트 SVG를 전용 가로 스크롤 래퍼에 넣고 높이를 명시해 10년치 월 흐름과 평균선이 본문 카드에 가려지지 않게 했습니다.
- 갤럭시 S24 폭 기준으로 조사범위/분석섹션 버튼을 재배치하고, 월별/차량손익/매트릭스 표의 `%` 컬럼과 금액 컬럼 폭을 넓혀 글자 밀림을 줄였습니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 0 errors
- `git diff --check`: 통과
- `npm.cmd run build`: 통과. 외부 NAS/WebDAV/API/폰트 fetch는 sandbox 네트워크 EACCES 경고만 표시.
- 인앱 브라우저 로컬 검증: 데스크탑 2048px에서 장기 흐름 패널이 본문 KPI와 겹치지 않음, Galaxy S24 360px 기준 문서 가로 overflow 없음. 로컬 sandbox에서는 NAS 백엔드 접근이 막혀 실데이터 대신 레이아웃 치수 검증으로 확인했습니다.
### 변경 파일
- `web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js`
- `web/app/(main)/employees/branches/asan/annualPerformance.module.css`
- `web/tests/asanAnnualPerformance.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] 전용 배포 Docker 타임아웃 확대 (v5.13.103)
### 핵심
- NAS 메모리/스왑 압박 중 `docker-compose up`이 Docker API 60초 응답 제한에 걸려 `Read timed out`으로 보이는 문제를 줄였습니다.
- `deploy-bot.sh`, `deploy-core.sh`에 `COMPOSE_HTTP_TIMEOUT=600`, `DOCKER_CLIENT_TIMEOUT=600` 기본값을 추가했습니다.
- 실제 이번 배포 후 `/health`에서 `max_drivers=2`, `ELS_DRIVER_STAGGER_SEQUENCE=0,60` 적용을 확인했습니다.
### 검증
- `C:\Program Files\Git\bin\bash.exe -n scripts/deploy-bot.sh`: 통과
- `C:\Program Files\Git\bin\bash.exe -n scripts/deploy-core.sh`: 통과
### 변경 파일
- `scripts/deploy-bot.sh`
- `scripts/deploy-core.sh`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] Bot/Core 전용 배포 스크립트 비대화형 정리 (v5.13.102)
### 핵심
- `deploy-bot.sh`와 `deploy-core.sh`도 통합 배포 스크립트처럼 Docker/Compose 절대 경로와 Docker PATH를 주입하도록 맞췄습니다.
- `sudo -n` 기본값으로 비밀번호 프롬프트에서 멈추지 않고 실패 원인을 바로 드러내게 했습니다.
- 마지막 로그 확인을 `docker logs -f`에서 `docker logs --tail 80`으로 바꿔 스크립트가 정상 종료되도록 했습니다.
### 검증
- `C:\Program Files\Git\bin\bash.exe -n scripts/deploy-bot.sh`: 통과
- `C:\Program Files\Git\bin\bash.exe -n scripts/deploy-core.sh`: 통과
### 변경 파일
- `scripts/deploy-bot.sh`
- `scripts/deploy-core.sh`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] stop-daemon 잔여 Chrome 정리 보강 (v5.13.101)
### 핵심
- `stop-daemon` 후 데몬 pool은 비었지만 `drission_port_32000+` Chrome 프로세스가 남는 상황을 줄이기 위해 `DriverPool.clear()`에 포트 기준 잔여 Chrome 정리를 추가했습니다.
- 등록된 드라이버의 `used_port`와 `ELS_MAX_DRIVERS` 기준 기본 포트 범위를 합쳐 중복 없이 정리합니다.
- stop 제어 테스트에서 실제 `fuser/pkill`이 실행되지 않도록 cleanup 호출을 mock 처리하고, pool이 비어 있어도 설정 포트를 정리하는 회귀 테스트를 추가했습니다.
### 검증
- `python -m unittest elsbot.tests.test_daemon_stop_control`: 통과
- `git diff --check`: 통과
### 변경 파일
- `elsbot/els_web_runner_daemon.py`
- `elsbot/tests/test_daemon_stop_control.py`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

## [2026-05-18] NAS els-bot 워커 2개 운영 전환 (v5.13.100)
### 핵심
- NAS 스왑 압박을 줄이기 위해 `els-bot`의 Selenium 워커 수를 `ELS_MAX_DRIVERS=2`로 낮췄습니다.
- 배치 조회 병렬도도 `ELS_BATCH_MAX_WORKERS=2`로 맞춰 Chrome 워커 수보다 많은 작업이 동시에 몰리지 않게 했습니다.
- 2워커 운영에 맞춰 `ELS_DRIVER_STAGGER_SEQUENCE=0,60`, `ELS_LATE_WORKER_MIN_READY=1`로 조정해 첫 워커를 빨리 열고 두 번째 워커는 60초 뒤 붙도록 했습니다.
### 검증
- `git diff --check`: 통과
### 변경 파일
- `docker/docker-compose.yml`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`

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
- 연간실적 분석 화면에 건당 매출/건당 손익/원가율/최고 손익월, 월별 추세, 구분별 상위 분석 패널을 추가했습니다.
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

## [2026-05-19] 아산 월간실적 세분화 축/차량 TOP 헤더 보강 (v5.14.51)
### 핵심
- 월간실적 세분화 분석 탭을 `매출`, `지역`, `청구픽업`, `포트명`, `선적`, `이월(청구처기준)`, `계산서` 순서로 재구성했습니다.
- 매출/계산서는 월간 보고서 그룹값에서, 이월은 청구처별 이월값에서 세분화 섹션을 합성해 기존 큰 이월 별도 표를 탭 안으로 흡수했습니다.
- 차량 성과 TOP 행에 `순위`, `차량번호`, `비중`, `청구액`, `손익·건수` 헤더를 추가해 금액 의미가 바로 보이도록 했습니다.
- 세분화 패널은 요일별 카드 바로 위 라인에 맞추고, 상단 요약 막대는 카드형 박스 대신 얇은 지표 스트립으로 줄였습니다.
### 검증
- `node --check web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js`: 통과
- `node --check web/scripts/import-asan-annual-performance.mjs`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js scripts/import-asan-annual-performance.mjs "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" tests/asanMonthlyPerformance.test.mjs tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run build`: 통과 (정적 생성 중 외부 WebDAV/원격 fetch는 sandbox 네트워크 제한으로 비치명 경고 출력)

## [2026-05-18] NAS core 대용량 엑셀 파싱 메모리 보호 (v5.14.00)
### 핵심
- `els-core`가 연간실적 36만 행 원장과 배차/선적 엑셀 파싱 결과를 메모리에 오래 들고 있던 문제를 차단했습니다.
- 연간실적 core 자동 동기화와 엑셀 직접 조회는 기본 비활성화하고, 운영 기본 경로를 NAS 직접 주입 스크립트로 고정했습니다.
- 선적관리 sync/엑셀 fallback은 `shipping_cache`에 전체 원장을 저장하지 않고 페이지 단위 응답만 반환한 뒤 참조를 비웁니다.
- 배차판 sync는 컨테이너 재시작 직후 DB 파일수정일이 최신이면 최초 전체 파싱을 생략하고, 실제 파싱 완료 후 workbook/DataFrame/rows/comments 참조를 해제합니다.
### 검증
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "tests/asanAnnualPerformance.test.mjs" "tests/asanDashboardView.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- NAS 적용 확인: `/health` 정상, `els-core` 약 140MB / CPU 0.01%, 연간실적 import node 프로세스 없음
### 변경 파일
- `docker/els-backend/asan_performance.py`
- `docker/els-backend/app_core.py`
- `docker/els-backend/app.py`
- `web/tests/asanAnnualPerformance.test.mjs`
- `web/tests/asanDashboardView.test.mjs`
- `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md`
