# ELS MISSION CONTROL (v5.14.25 / APK v5.11.17)

> 최신 업데이트: 아산 연간/월간실적 DB 조회가 NAS 빌드 상태에 끌려가지 않도록 보정했습니다.

## CURRENT STATUS
- **웹 버전**: v5.14.25
- **동기화 정책**: 연간실적은 파일별 외부 Node importer `summary-only/snapshot import` 유지, 화면은 annual 현재 스냅샷 전체를 통합 조회. 월간실적은 `dataset_type=monthly` + `diff-current` 누적 원장으로 월별 파일을 순차 백그라운드 적재한다.
- **APK 버전**: v5.11.17
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 아산 월간실적 화면은 2026-01~2027-03 총 15개 파일공간을 기본 제공.
  - 월별 마감자료는 첫 번째 시트를 읽고, 경로/시트/제목행은 월별로 수정 가능.
  - 월간실적 `NAS 동기화` 버튼과 파일 설정 `저장 후 동기화`를 추가.
  - 월별 보고서 표에서 거래처별 순매출/순매입/매출이익, 계산서 매출/매입/이익, 이월 매출/매입/차익을 도출.
  - 월간 원장 summary에는 월별/일별 흐름과 이월 합계를 함께 저장해 화면 분석에 사용.
  - 월간 원장은 같은 파일/시트/행 기준으로 변경 행만 신규 current로 추가하고 기존 행은 종료해 누적 보존.
  - 연간실적 화면은 2015~2025 기존 파일과 2026 이후 분할 파일을 `annual` current snapshots 통합 조회로 합산한다.
  - 연간/월간실적 GET은 Supabase DB 조회 실패 시 NAS 프록시로 우회하지 않고 JSON 오류를 반환해 Docker 빌드 중 화면 장애 전파를 막는다.
  - 아산 배차판 RAG는 `branch_dispatch` 헤더/셀 패턴으로 오더·픽업지역·메모시간 스키마를 먼저 만든 뒤 답변한다.
  - AI 어시스턴트 대화 삭제는 DB 빈 삭제마커를 유지해 늦은 자동저장이 옛 목록을 되살리지 못하게 한다.
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
- **v5.14.25**: 아산 연간실적 통합 조회의 `allMetasHaveSnapshot` 스코프 오류를 수정해 `aggregate=all`이 Supabase current snapshots를 정상 조회하게 했다. 연간/월간실적 GET에서 DB 조회 예외가 나도 NAS 프록시로 떨어지지 않도록 바꿔, NAS Docker 빌드 중에는 DB 직조회 화면이 NAS 상태에 끌려가지 않게 했다. 운영 DB 확인 결과 annual 메타 1개/368,617행은 존재하고, monthly 메타는 아직 0개라 월간은 최초 동기화 전 상태다.
- **v5.14.24**: AI 어시스턴트 전체 삭제 후 10초 뒤 purge가 삭제마커까지 제거해, 늦게 도착한 옛 자동저장이 대화 목록을 되살릴 수 있던 문제를 보강. 서버는 빈 삭제마커와 `clearedAt`을 유지하고, 클라이언트는 이를 받으면 로컬 옛 목록도 무효화한다.
- **v5.14.23**: 아산 연간실적 GET 조회에 `aggregate=all` 통합 모드를 추가. 파일 설정/동기화 대상은 선택 파일로 유지하면서, 화면 분석·테이블은 `dataset_type=annual`의 모든 파일 메타에서 `currentSnapshotId`를 모아 합산 조회한다. 2015~2025 대용량 파일을 보존하고 2026 이후 새 연간 파일을 별도 동기화해도 웹은 전체 기간을 하나의 연간 원장처럼 표시한다.
- **v5.14.22**: 아산 월간실적 동기화를 `diff-current` 누적형으로 전환. 파일이 교체되면 같은 파일/시트/행의 해시를 비교해 변경 행만 신규 current로 추가하고 기존 행은 `superseded_by_excel`, 사라진 행은 `removed_from_excel`로 종료한다. 월간 조회도 `currentSnapshotId` 단일 스냅샷이 아니라 `is_current=true` 원장을 읽도록 보정했다.
- **v5.14.21**: 아산 배차판 RAG를 `web/utils/asanDispatchRag.mjs`로 분리. Supabase `branch_dispatch`의 헤더와 셀 패턴에서 도표형 스키마(오더 컬럼, 픽업지역/상차지 컬럼, 메모/시간 컬럼)를 동적으로 추론하고, `이지1.대신3` 같은 지역칸 업체·대수와 메모 시간 필터를 서버에서 구조화해 주입한다.
- **v5.14.20**: 아산 월간실적 화면/API/Core 동기화를 추가. 2026년 기준 2027년 3월까지 15개 파일 슬롯을 만들고, 각 월 파일의 첫 번째 시트를 `dataset_type=monthly`로 Supabase에 적재한다. 월별 보고서 표, 일별 흐름, 이월금액을 분석 화면에 표시하고 파일 설정 저장 시 자동 동기화한다.
- **v5.14.19**: 아산 연간실적 조사범위 날짜 선택은 `직접` 모드에서만 활성화하고, 전체/최근 기간 프리셋에서는 잠금 상태로 표시하도록 보정.
- **v5.14.18**: 선적관리 `NAS 동기화` 버튼이 항상 강제 재적재하지 않도록 `force=false`로 변경하고 현재 날짜 필터를 POST에도 전달. Core에는 `shipping_sync_lock`을 추가해 자동/수동 동기화 중복 파싱을 차단.
- **v5.14.17**: 드라이버 앱 지도 자동추적/내 차량 클릭은 속도 기반 줌을 적용하고 전체 차량 보기 최대 줌을 제한. APK v5.11.17 / 5158 산출물 반영.
- **v5.14.16**: 아산 배차 모바일 범위 전환 시 날짜탭 자동 가운데 맞춤이 세로 스크롤을 끌어내리지 않도록 수평 스크롤 전용으로 변경. 첫 진입 상단 위치도 유지.
- **v5.14.15**: 12가0140 2026-05-19 06:59/07:03 운행을 재분석. 원시 좌표는 불가능 속도 0건이나 진행 중 마커 클릭이 상세경로/끝점으로 오해될 수 있어 내 차량 마커 클릭은 추적/줌만 수행하도록 변경. Android 서비스 `onDestroy`의 자동 `TRIP_END` 전송을 제거하고, Naver Directions 결과가 원시 진행 대비 과도하게 길거나 trace 밖/루프면 필터 경로로 대체. 운행 완료 액션 로그도 남김. APK v5.11.16 / 5157 빌드.
- **v5.14.14**: 12가0140 2026-05-18 17시대 테스트 3건 기준으로 GPS 튐을 재분석. 1번은 좌표 자체보다 촘촘한 전경 샘플/도로 매칭 과신 문제, 2·3번은 `android_bg` 캐시 좌표 재등장으로 확인. 서버 stale replay 필터, Android 네이티브 전송 전 물리 필터와 `recorded_at`, 경로 waypoint 단순화, 운행 중 현재점 표시를 적용. APK v5.11.15 / 5156 빌드.
- **v5.14.13**: 선적관리 미선적 필터 기준을 `작업일 이후 MOVE TIME` 우선에서 컨테이너 이력구분 우선으로 보정. 이력조회값이 없는 행은 작업일이 지난 경우만 미선적 후보로 유지.
- **v5.14.12**: 선적관리 컨테이너 조회 상태를 `localStorage` 세션으로 보존하고 4초 주기로 저장 결과를 복원. 시작 이후 저장된 이력만 완료로 인정해 이전 조회 결과와 섞이지 않게 함.
- **v5.14.11**: 안전운임 탭 렌더 순서를 조정해 지도 기반 `구간조회` 버튼을 `이외구간` 앞에 배치.
- **v5.14.10**: 안전운임 기본 조회의 주소→행정동 자동 선택을 동기 정규화로 보정하고, 지도 기반 구간조회에서 `인천항국제여객터미널`이 `[왕복] 인천국제여객` 구간운임으로 매칭되도록 터미널 기점 판정을 강화.

## VERIFICATION
- `node --test web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint -- app/api/branches/asan/performance/annual/route.js app/api/branches/asan/performance/monthly/route.js lib/asan-branch-db.js tests/asanAnnualPerformance.test.mjs tests/asanMonthlyPerformance.test.mjs`: 통과
- `node --test web/tests/chatMemory.test.mjs`: 8개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" app/api/chat/memory/route.js utils/chatMemory.mjs tests/chatMemory.test.mjs`: 0 errors, 기존 warning 8건
- `git diff --check`: 통과
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/asanDashboardView.test.mjs`: 31개 통과
- `npm.cmd run lint -- app/api/chat/route.js utils/asanDispatchRag.mjs tests/asanDispatchRag.test.mjs`: 통과
- `npm.cmd run build`: 통과 (정적 생성 중 외부 fetch EACCES 경고만 발생)
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `node --test web/tests/vehicleLocation.test.mjs`: 13개 통과

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
