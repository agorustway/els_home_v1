# ELS MISSION CONTROL (v5.13.65 / APK v5.11.12)

> 최신 업데이트: 아산 연간실적 직접 주입을 current 전체 조회 없이 새 스냅샷 staged/current 방식으로 반영하도록 보강했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.65
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 연간실적 직접 주입 기본값을 current 원장 전체 조회(diff) 없이 새 스냅샷 반영으로 전환.
  - 파일 mtime이 같으면 기존처럼 스킵해 일 1회 자동 실행 부담 유지.
  - 행별 hash 비교는 `--diff-current` 옵션으로 분리.
  - current 조회 보조 인덱스 SQL을 추가해 웹/점검 조회 timeout 가능성 완화.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차 분석 대시보드/선적/실적 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 직접 주입 snapshot 반영 전환, current 조회 보조 인덱스 SQL 추가 |
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
- **v5.13.50**: 아산 연간실적 최초 적재가 게이트웨이 타임아웃에 끊기지 않도록 백그라운드 동기화, 상태 폴링, `/api/branches` 900초 timeout을 추가.
- **v5.13.49**: 아산 연간실적 기본 조회를 Supabase 원장 전용으로 정리하고, HTML 에러 응답이 JSON 파싱 오류로 보이지 않도록 보강.
- **v5.13.48**: 아산 연간실적 rel_path를 배차판/선적관리와 같은 `/아산지점/...` 규칙으로 통일하고 legacy `/B_총무/...` 자동 보정을 추가.
- **v5.13.47**: 아산 연간실적 파일 탐색 후보에 `아산지점` 공유 루트를 추가하고, 404 응답에 확인 경로 목록을 포함.
- **v5.13.46**: 아산 연간실적 페이지, 누적 원장형 `branch_performance_*` SQL, NAS Core 동기화 모듈, 파이프라인 문서를 추가.
- **v5.13.45**: 아산 선적관리 모바일 상단 제목/저장정보/검색/월 선택 영역을 한 화면 폭 기준으로 정돈.
- **v5.13.44**: 아산 선적관리 날짜 필터를 최근 6개월 월 다중선택 버튼으로 바꾸고, 기본값을 현재월 포함 3개월로 설정.
- **v5.13.43**: 아산 선적관리 조회 건수를 `전체 N건 / 조회 N건`으로 표시하고, 컨테이너 조회 완료/실패 카운트 및 엑셀 헤더 변경/삭제/추가 반영을 보강.
- **v5.13.42**: 아산 선적관리 날짜 필터 바 버튼 글자 높이를 통일하고, 조회 건수를 일반 텍스트로 바꾸며, 필터/정렬 조회 중 빈 테이블에 `자료 조회중...` 안내를 추가.
- **v5.13.41**: 아산 선적관리 미선적 필터가 이력 데이터 없는 행도 남기도록 보강하고, 필터 적용 조회 건수 배지와 컨테이너 조회 대상 상태 문구를 추가.
- **v5.13.40**: 아산 선적관리 필터 드롭다운 글자색을 복구하고, 미선적 판정 기준일에 `반입일` fallback을 추가. 대량 컨테이너 이력 저장값은 150건씩 청크 조회.
- **v5.13.39**: eTrans 세션 연장 후 클라이언트 타이머를 재시작하고 자정 날짜 변경 시 WebSquare 타이머가 세션 종료로 오판하지 않도록 롤오버 가드를 설치.
- **v5.13.38**: 미선적 필터 상태에서 컨테이너 조회 준비값이 기존 이력 판정을 지우지 않게 하고, 실패 응답은 DB 기존값을 삭제하지 않도록 보강. 가상 스크롤 시작점 클램프로 필터 후 빈 화면 표시도 방지.
- **v5.13.37**: 아산 선적관리 미선적 정의를 `작업일자 <= 이력 MOVE TIME`인 비완료 이력(`반입/적하` 제외)으로 변경. 완료 음영도 같은 작업일 기준으로 맞췄고, 컨테이너 조회 최종 저장은 기존 file/container 조회값을 삭제 후 최신 결과로 교체.
- **v5.13.36**: 차량위치관제 운행기록 Excel export 라우트에 `force-dynamic`을 선언해 Next 빌드 중 정적 렌더 오류 로그를 제거.

## VERIFICATION
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe elsbot\tests\test_els_bot_logic.py`: 14개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile elsbot\els_bot.py elsbot\els_web_runner_daemon.py`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 30개 통과
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs`: 38개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs web/tests/vehicleTrackingExport.test.mjs`: 46개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 39개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/Supabase sandbox EACCES 경고만 표시)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 48개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js" "utils/asanDashboardView.mjs"`: 0 errors
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
