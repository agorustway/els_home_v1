# ELS MISSION CONTROL (v5.13.80 / APK v5.11.12)

> 최신 업데이트: 아산 선적관리 기본 진입은 월 필터 없이 100건만 로드하고, 스크롤/필터 상황을 분리합니다.

## CURRENT STATUS
- **웹 버전**: v5.13.80
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 선적관리 기본 진입은 월 선택 없이 100건 페이지 로드만 수행.
  - 마우스 스크롤 시 다음 100건을 추가 로드하고, 월/미선적/자체보관/컬럼필터 때만 전체 기준 조회를 수행.
  - 연간실적 조회를 메타 summary의 `currentSnapshotId` 기준으로 고정해 중복 current 스냅샷 표시 차단.
  - 월별 추세, 건당 매출/손익, 매입률, 최고 손익월 패널 추가.
  - 작업지·운송사·노선·구분·청구처·지급처 등 구분별 breakdown 집계 확장.
  - 날짜/금액 표시 정규화 유지.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차 분석 대시보드/선적/실적 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 직접 주입 완료, current 스냅샷 고정 반영 필요 |
| NAS 백엔드 | 정상 | 배차판/선적관리/연간실적 저부하 파일감지 주기 적용 |
| ELS Bot | 정상 | eTrans 세션 연장/자정 롤오버 타이머 가드 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

## INTRANET UI 기준
- **목록 테이블**: 고정 폭 컬럼 + 마지막 비고/주소 컬럼 유동 폭, 헤더는 짙은 블루 계열.
- **상세 화면**: `Hero → 주요 필드 Grid → 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치와 톤 통일.
- **모바일**: 카드 기반 목록, 컨테이너 좌우 3~4px, 본문 폰트 0.72~0.88rem 중심.
- **로딩 안내**: 아산지점 탭/페이지 초기 로딩 문구는 `데이터를 불러오는 중입니다...`, 폰트는 `0.86rem / 800 / #64748b`.

## MILESTONES
- [x] Phase 1-6: AI 에이전트 및 RAG 기반 구축
- [x] v5.10: 차량위치관제/GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 인트라넷 연락처형 페이지 UI 파이프라인 정리
- [ ] v5.14: 아산 월별실적 취합 및 연간+월별 합산 API
- [ ] Next: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## RECENT CHANGES
- **v5.13.80**: 아산 선적관리 월 필터 기본값을 해제해 첫 진입은 100건 페이징만 유지하고, 필터 동작 시에만 전체 기준 로드를 수행.
- **v5.13.79**: 연간실적 current 스냅샷 고정으로 중복 표시를 막고 월별/구분별 분석 패널을 확장.
- **v5.13.78**: 연간실적 마감월/작업일자 날짜 시리얼과 시간 문자열을 정규화하고 금액 컬럼 천단위 표시를 적용.
- **v5.13.77**: 아산 배차 검색/필터 합계를 실제 표시 행 기준으로 맞추고, 실행사 지역칸의 붙은 수량 파싱을 보정.
- **v5.13.76**: 아산 배차 고객사/실행사 기준 차이 패널을 추가하고, 차이 원인 행을 날짜 탭+검색 링크로 추적 가능하게 함.
- **v5.13.75**: 연간실적 웹 조회에서 Supabase exact count를 제거하고 파일 메타 행 수를 사용해 화면 진입 timeout을 완화.
- **v5.13.74**: 아산 배차 도넛 범례에 항목별 점유율을 붙이고, 데이터 없는 날짜 탭 비활성화와 모비스 국가명 고객사 집계를 적용.
- **v5.13.73**: 아산 선적관리 모바일 날짜 필터에서 `미선적`/`자체보관` 빠른 버튼 폭을 동일하게 정렬.
- **v5.13.72**: 아산 배차 상차지별 비율을 지역 배차 칸 기준으로 고치고 추세 돋보기 위치·양수/음수 색상, 주간 실데이터 표기를 보정.
- **v5.13.71**: 아산 배차 모바일 기간 카드를 1열로 정리하고 요일별 패널 안에서 주/월을 바로 선택하게 하며 전체 탭 미래 주차 선택지를 제외.
- **v5.13.70**: 아산 배차 점유율 영역에 상차지별 비율 도넛을 추가하고 도넛/카드 표기를 `톱1점유`로 통일.
- **v5.13.69**: 아산 선적관리 날짜 필터 컬럼 후보를 실제 날짜값이 있는 컬럼으로 제한해 모선/텍스트 컬럼 오탐을 제거.
- **v5.13.68**: 아산 배차 기간 카드 수량/FEU/톱1점유 표기를 다듬고, 추세 그래프 오늘 기준 제한·돋보기 포커스·요일별 작업지 비중 패널을 추가.
- **v5.13.67**: 아산 배차 전체 탭에 주간 필터 버튼, 주간 export, 요일별 오더 비교 패널을 추가하고 카드 FEU/톱1점유 표시로 변경.
- **v5.13.66**: 아산 배차 추세 그래프를 영업일 기준으로 재구성하고 평균선/축/고저점/hover 지표를 추가, 날짜 탭은 그래프 아래로 이동.
- **v5.13.65**: 연간실적 직접 주입 기본값을 current 전체 조회 없는 snapshot 반영으로 바꾸고 `--diff-current`와 조회 보조 인덱스를 분리.
- **v5.13.64**: 아산 배차 주별/월별 카드 기본값을 선택일 기준 지난주/지난달로 바꿔 진행 중 기간 비교 왜곡을 완화.
- **v5.13.63**: 아산 배차 종합 카드에서 전체를 빼고 날짜 탭을 분석 영역 앞으로 내렸으며, 일자별 추세 그래프와 카드 색상 범례/툴팁을 보강.
- **v5.13.62**: 연간실적 실제 주입도 Excel 스트리밍 파싱 중 변경/신규 행을 100행 단위로 바로 반영해 NAS 메모리 점유를 완화.
- **v5.13.60**: 아산 배차 현황판을 일/주/月 선택 카드, 고객사별 비중 탭, 압축 지표형 분석 패널로 리팩토링.
- **v5.13.59**: 연간실적 직접 주입에 `file_modified_at` 미변경 스킵, `--force`, 낮은 우선순위 NAS cron 래퍼를 추가.
- **v5.13.58**: 연간실적 36만 행 dry-run 결과를 기준으로 직접 주입 대용량 보호, 배치 insert 메모리 완화, 숫자 컬럼 샘플 판정 보정을 추가.
- **v5.13.57**: 연간실적 직접 주입 dry-run이 NAS 메모리를 크게 쓰지 않도록 Excel 통째 로딩을 제거하고 ExcelJS 스트리밍 파서와 진행 로그를 적용.
- **v5.13.56**: 아산 연간실적 직접 주입 스크립트의 기본 파일 후보를 NAS 실제 경로 `/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`로 정정.
- **v5.13.55**: 아산 연간실적 Excel을 Supabase `branch_performance_*` 원장으로 직접 주입하는 스크립트를 추가해 NAS 동기화 timeout을 우회 가능하게 함.
- **v5.13.54**: 아산 선적관리/연간실적 GET 조회를 Next Supabase 직접 조회로 보강해 NAS Core 재기동 중 DB 원장 조회를 유지.
- **v5.13.53**: 아산지점 배차/선적/연간실적 초기 로딩 문구와 폰트 기준을 통일하고 문서 UI 기준에 반영.
- **v5.13.52**: 아산지점 `실적관리` 메인 탭과 `종합실적/월간실적/연간실적` 하위 탭 구조를 추가하고 기존 연간실적을 하위 연간실적으로 이동.
- **v5.13.51**: 아산 배차/선적/연간실적 자동 파일 감지 주기를 완화하고 배차 설정 조회 5분 캐시, 반복 체크 로그 제거를 적용.

## VERIFICATION
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe elsbot\tests\test_els_bot_logic.py`: 14개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile elsbot\els_bot.py elsbot\els_web_runner_daemon.py`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 33개 통과
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs`: 38개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs web/tests/vehicleTrackingExport.test.mjs`: 46개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 39개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs`: 53개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs" "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 50개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/export/route.js" "utils/asanDashboardView.mjs"`: 0 errors
- Browser: standalone 서버와 `?debug=true` 접근 확인, 로컬 Supabase role 조회 대기로 본문 hydrate 시각검증은 제한됨
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 현재 이어받을 미완료 작업 없음.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
