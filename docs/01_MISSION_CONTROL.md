# ELS MISSION CONTROL (v5.14.21 / APK v5.11.17)

> 최신 업데이트: 아산 배차판 AI RAG를 도표형 스키마 추론 기반으로 분리했습니다.

## CURRENT STATUS
- **웹 버전**: v5.14.21
- **동기화 정책**: 연간실적은 외부 Node importer `summary-only/snapshot import` 유지. 월간실적은 `dataset_type=monthly`로 월별 파일을 순차 백그라운드 적재하고, 저장 후 자동 동기화한다.
- **APK 버전**: v5.11.17
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 아산 월간실적 화면은 2026-01~2027-03 총 15개 파일공간을 기본 제공.
  - 월별 마감자료는 첫 번째 시트를 읽고, 경로/시트/제목행은 월별로 수정 가능.
  - 월간실적 `NAS 동기화` 버튼과 파일 설정 `저장 후 동기화`를 추가.
  - 월별 보고서 표에서 거래처별 순매출/순매입/매출이익, 계산서 매출/매입/이익, 이월 매출/매입/차익을 도출.
  - 월간 원장 summary에는 월별/일별 흐름과 이월 합계를 함께 저장해 화면 분석에 사용.
  - 월간 원장은 `branch_performance_files/rows`의 `dataset_type=monthly`로 보존.
  - 아산 배차판 RAG는 `branch_dispatch` 헤더/셀 패턴으로 오더·픽업지역·메모시간 스키마를 먼저 만든 뒤 답변한다.
  - 선적관리 수동 동기화는 파일 변경 시에만 재적재하고, Core는 이미 동기화 중이면 중복 파싱을 건너뜀.
  - 선적관리/안전운임/연간실적 v5.14 개선사항 운영 유지.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 368,617행 기준 조회, 월간실적 monthly dataset 준비 |
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
- `node --test web/tests/asanDispatchRag.test.mjs web/tests/asanDashboardView.test.mjs`: 31개 통과
- `npm.cmd run lint -- app/api/chat/route.js utils/asanDispatchRag.mjs tests/asanDispatchRag.test.mjs`: 통과
- `npm.cmd run build`: 통과 (정적 생성 중 외부 fetch EACCES 경고만 발생)
- `node --test web/tests/asanMonthlyPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 18개 통과
- `npm.cmd run lint`: 통과
- `node --check "web\app\(main)\employees\branches\asan\AsanMonthlyPerformance.js"` / `page.js` / `web\utils\asanPerformanceView.mjs`: 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py`: 통과
- Local HTTP: `http://localhost:3010/employees/branches/asan` 200 확인. 브라우저 패널은 활성 탭 종료로 재검증 불가, 월간 API 운영 호출은 NAS 프록시 네트워크 제한(EACCES)으로 보류.
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `node --check web/driver-src/modules/map.js`: 통과
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.17`, `BUILD_CODE 5158` 확인
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.17 / 5158 APK 빌드 및 `web/public/apk/els_driver.apk` 복사 완료
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 0 errors
- `node --test web/tests/vehicleLocation.test.mjs`: 13개 통과
- `npm.cmd run lint`: 통과
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
