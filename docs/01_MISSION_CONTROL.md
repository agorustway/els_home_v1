# ELS MISSION CONTROL (v5.14.45 / APK v5.11.17)

> 최신 업데이트: 아산 월간실적 일별 트리를 마감월 기준으로 고정하고 주간 선택·요일별 카드를 추가했습니다.

## CURRENT STATUS
- **웹 버전**: v5.14.45
- **동기화 정책**: 연간실적은 파일별 외부 Node importer `summary-only/snapshot import` 유지, 화면은 annual 현재 스냅샷 전체를 통합 조회. 월간실적은 `dataset_type=monthly` + `diff-current` 누적 원장으로 월별 파일을 순차 백그라운드 적재한다.
- **APK 버전**: v5.11.17
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 아산 연간실적 통합 원장 조회와 NAS 동기화 응답은 `snapshot_id,row_index`/메타 기반으로 처리해 Supabase statement timeout을 피한다.
  - 아산 월간/연간실적 화면은 별도 `source=status` polling으로 NAS 백그라운드 동기화 상태를 페이지 재진입 후에도 표시한다.
  - 아산 월간실적 NAS importer는 공용 summary helper를 top-level로 사용해 `diff-current` 중단을 방지한다.
  - 아산 월간실적 본문은 분석 기준(전체/월별/주간/일별), 카드형 추세 그래프, 도넛 KPI, 구성/세분화/트리/요일 카드 순서로 표시하며 TOP 항목은 제목/탭 클릭으로 전체 전환한다.
  - 월간 보고서는 마감월 기준 흐름만 월별 성과와 월별·일별 트리에 반영하고, 실제 작업일자는 마감월 하위 일자/요일 분석으로 분리 표시한다.
  - 구성 분석은 `ELS직계약차량`과 `외부/타운송사`만 유지해 직계약 전체 중복 의미를 제거한다.
  - 연간실적 분석 화면은 `annualAnalytics` 전용 세로 레이아웃과 `stretch` 폭 고정으로 월간실적 카드 그리드와 분리한다.
  - 월별 파일공간/경로/시트/제목행은 설정 모달에서만 관리하고, 저장 후 동기화한다.
  - 월별 보고서 표에서 거래처별 순매출/순매입/매출이익, 계산서 매출/매입/이익, 이월 매출/매입/차익을 도출.
  - 월간 원장 summary에는 월별/일별 흐름과 이월 합계를 함께 저장해 화면 분석에 사용.
  - 월간 원장은 같은 파일/시트/행 기준으로 변경 행만 신규 current로 추가하고 기존 행은 종료해 누적 보존.
  - 연간실적 화면은 2015~2025 기존 파일과 2026 이후 분할 파일을 `annual` current snapshots 통합 조회로 합산한다.
  - 연간/월간실적 GET은 Supabase DB 조회 실패 시 NAS 프록시로 우회하지 않고 JSON 오류를 반환해 Docker 빌드 중 화면 장애 전파를 막는다.
  - 아산 배차판 RAG는 `branch_dispatch` 헤더/셀 패턴으로 오더·픽업지역·메모시간 스키마를 먼저 만든 뒤 답변한다.
  - AI 어시스턴트 대화 삭제는 DB 빈 삭제마커를 유지해 늦은 자동저장이 옛 목록을 되살리지 못하게 한다.
  - 선적관리 조회는 Supabase 1회 1,000건 제한을 1,000건 단위 청크 조회로 보정해 전체 필터/정렬이 뒤쪽 행까지 본다.
  - 선적관리 수동 동기화는 파일 변경 시에만 재적재하고, Core는 이미 동기화 중이면 중복 파싱을 건너뜀.
  - 선적관리/안전운임/연간실적 v5.14 개선사항 운영 유지.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 annual current snapshots 통합 조회, 월간실적 monthly 누적 원장 준비 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, Bot은 2워커 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 잔여 Chrome 정리 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.17 빌드 완료 |

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
- [ ] Next: 아산 연간+월간 합산 API 및 운영 NAS 최초 월간 동기화

## RECENT CHANGES
- **v5.14.45**: 월간실적 일별 원장은 작업일자 월이 아니라 파일 마감월 `sourcePeriod`로 묶어 `2025-12` 같은 정리기간 작업일자 월이 트리 최상단에 노출되지 않게 했다. 분석 기준에는 `주간 선택`을 추가해 `YYYY-MM N주차` 단위로 조회하고, 선택 범위 기준 `요일별 카드`를 함께 표시한다.
- **v5.14.44**: 선적관리 테이블이 `width:100%`로 눌리며 가로 overflow가 생기지 않아 하단 슬라이더가 사라진 문제를 보정. 테이블은 `max-content` 기준으로 실제 컬럼 폭을 유지하고, 래퍼는 가로/세로 overflow와 100% 폭을 고정해 브라우저 하단 안쪽에 가로 스크롤바가 표시된다.
- **v5.14.43**: 월간실적 세분화 분석의 항목 탭은 같은 탭을 다시 누르면 상위 12개/전체 항목을 토글한다. `세분화 분석` 제목도 현재 탭 전체 전환을 지원하고, `차량 성과 TOP` 제목은 상위 5대/전체 차량 목록을 전환한다.
- **v5.14.42**: 월별/일별 선택 시 summary의 `monthly/daily/breakdowns/vehiclePerformance`가 배열이 아니거나 빈 세부값을 포함해도 분석 렌더가 죽지 않도록 전체 범위 데이터를 객체 배열로 정규화했다. 선택값도 실제 옵션에 존재하는 월/일만 사용하고, 월간 분석 내부 오류 경계를 둬 페이지 전체 오류로 번지지 않게 했다.
- **v5.14.41**: 월별/일별 선택 시 해당 범위 데이터가 없는 세부 항목이 `null`로 내려와 화면 전체가 오류 페이지로 바뀔 수 있던 문제를 수정했다. 세부 항목 `monthly/daily` 시리즈는 배열/객체 모두 안전하게 읽고, 월별 누적 흐름 그래프는 시작·끝뿐 아니라 중간 월 라벨도 포인트 위치에 맞춰 표시한다.
- **v5.14.40**: 월간실적 월별 누적 흐름을 연간용 대형 그래프 재사용에서 분리해 카드형 스파크라인/요약칩으로 압축했다. 분석 그리드는 640px 기준으로 2~3열을 유지하게 조정했고, `전체` 기준에서는 월/일 선택 셀렉트를 비활성화하며 월별·일별 전환 시 빈 값으로 터지지 않게 했다.
- **v5.14.39**: 월간실적 분석 상단에 `전체/월별 선택/일별 선택` 기준을 추가하고, 월별 누적 흐름을 주식 차트형 라인 그래프로 올렸다. 월별 성과는 파일 마감월만 사용해 이월/작업일자 때문에 2025-12가 끼지 않게 했고, KPI 카드에는 도넛 비중을 넣었다. 구성 분석은 `ELS직계약차량`과 `외부/타운송사` 두 축만 남겼다.
- **v5.14.38**: 월간실적 반응형 카드 그리드가 공통 `.analytics` 스타일로 연간실적까지 적용되어 연간 리포트가 가로로 찢어지던 문제를 수정. 연간 컴포넌트는 `annualAnalytics` 전용 flex column 흐름과 `align-items: stretch` 폭 고정을 덧붙였고, 원장 장기 흐름 그래프는 220px 높이의 기준선 차트로 압축했다.
- **v5.14.37**: 월간실적 분석 섹션을 고정 폭 세로 나열에서 반응형 카드 그리드로 변경. 인포그래픽은 전체 행을 사용하고 구성/세분화는 넓은 화면에서 2칸, 월별 흐름·트리·차량 TOP은 카드 단위로 자동 배치되며 모바일에서는 1열로 떨어진다.
- **v5.14.36**: 월간실적 `월별·일별 트리`와 `세분화 분석`은 내부 표만 좁아지고 외곽 패널이 화면 끝까지 벌어져 튀어나온 것처럼 보이던 문제를 보정. 트리 패널은 696px, 세분화 패널은 980px 안쪽으로 외곽선과 헤더까지 함께 묶었다.
- **v5.14.35**: 월간실적 분석 첫 화면을 원본 보고서 표 중심에서 인포그래픽 중심으로 재배치. 표 미감지 시 큰 빈 보고서 박스를 제거하고 얇은 상태 줄만 표시하며, 청구/하불/손익/이월/건당 청구 KPI, 청구→하불→손익 흐름, 최고 청구월/손익월/손익일/최근월 증감, 계약·운영 구분 구성 분석, 차량 성과 TOP을 추가했다.
- **v5.14.34**: 선적관리 원본 엑셀에는 2026-05-18 작업일 81건이 있으나 화면/API가 첫 1,000건만 읽어 뒤쪽 57건이 필터 범위 밖으로 밀리던 문제를 수정. Next 직조회와 NAS Core 모두 Supabase range를 1,000건 단위로 나눠 읽어 `page_size=10000` 전체 필터가 실제 전체 row를 대상으로 동작한다.
- **v5.14.33**: 월별·일별 트리 금액 컬럼 위에 `월/일`, `청구`, `하불`, `손익`, `건수` 헤더를 추가하고 표 폭을 680px 안쪽으로 제한해 제목과 값의 시선 거리를 줄였다. 세분화 분석도 780~980px 안쪽 블록으로 묶었고, 내부 키 `all`이 제목으로 보이지 않도록 전체 보고서 제목을 `매출보고서`로 보정했다.
- **v5.14.31**: 월간실적 보고서 표 기본값을 `전체`로 변경하고 월별 범위 버튼으로 전환하게 했다. 월별 성과 아래에는 접힘/펼침 트리로 일별 원장을 표시하며, 청구처/작업지/운송사(명의)/구분/청구픽업/포트 등 테이블에서 도출 가능한 breakdown을 청구·하불·손익·건수 패널로 보여준다. 월간/연간 테이블은 화면 안쪽에 세로/가로 스크롤이 먼저 보이도록 높이를 고정했다.
- **v5.14.30**: 월간/연간실적 `NAS 동기화`가 백그라운드로 계속 진행 중일 때 페이지를 나갔다 돌아오면 로컬 상태가 끊겨 진행중 표시가 사라질 수 있던 문제를 수정. `source=status` 조회는 NAS Core로 직접 프록시하고, 화면은 진입 시/진행 중 5초마다 상태만 polling해 `동기화 진행중`, 시작/완료 시각을 유지한다.
- **v5.14.29**: 연간실적 `NAS 동기화` POST가 백그라운드 작업 시작 직후 NAS Core `_query()`로 원장 count/페이지를 다시 읽으며 timeout을 노출하던 문제를 수정. 동기화 응답은 `sync_only` 메타만 반환하고 프론트는 기존 화면 데이터를 덮어쓰지 않는다. 중복된 `10년 흐름` 분석 탭은 개요의 장기 흐름 그래프로 통합했다.
- **v5.14.28**: 월간실적 NAS 동기화가 Excel 파싱 후 `ReferenceError: finalizeSeries is not defined`로 실패하던 문제를 수정. `finalizeBreakdowns()`가 쓰는 `finalizeSeries()`를 공용 top-level helper로 올려 monthly `diff-current` importer에서도 접근되게 했다. NAS 로그 기준 실패 위치는 `web/scripts/import-asan-annual-performance.mjs:764`.
- **v5.14.27**: 아산 연간실적 `aggregate=all` 테이블 조회가 `year_value/month_value` 대용량 정렬을 타며 Supabase statement timeout이 나던 문제를 보정. 현재 스냅샷이 확정된 통합 조회는 `snapshot_id,row_index` 보조 인덱스 순서로 페이징하고, exact count 없이 파일 메타 건수를 사용한다. 운영 DB 직접 조회에서 snapshot `1c6d280d-3ac0-4f03-8f6c-271bb91980c7`의 첫 301행이 즉시 반환됨을 확인했다.
- **v5.14.26**: 아산 월간실적 분석 첫 화면에서 `월별 파일 공간` 카드 노출을 제거하고 설정 모달로 한정. 스크린샷 기준에 맞춰 `YYYY년 M월 아산매출보고서`, `통합 IN/OUT-BOUND`, `단위 : 원`, 매출/이월 섹션 표를 최상단 보고서 형태로 재구성했다.
## VERIFICATION
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"`: 통과
- `node --check web\lib\asan-branch-db.js`: 통과
- `node --check web\scripts\import-asan-annual-performance.mjs`: 통과
- `node --test --test-name-pattern "화면은 분석/테이블" web/tests/asanAnnualPerformance.test.mjs`: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- lib/asan-branch-db.js scripts/import-asan-annual-performance.mjs "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "tests/asanMonthlyPerformance.test.mjs" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `npm.cmd run lint -- lib/asan-branch-db.js app/api/branches/asan/performance/monthly/route.js app/api/branches/asan/performance/annual/route.js "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker\els-backend\asan_performance.py`: 통과
- `npm.cmd run lint -- scripts/import-asan-annual-performance.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
- Supabase 직접 조회: annual snapshot `1c6d280d-3ac0-4f03-8f6c-271bb91980c7` 301행 즉시 반환
- `git diff --check`: 통과

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
