# ELS MISSION CONTROL (v5.13.52 / APK v5.11.12)

> 최신 업데이트: 아산지점 메인 `연간실적` 탭을 `실적관리`로 재구성하고 하위 `종합실적/월간실적/연간실적` 구조를 준비합니다.

## CURRENT STATUS
- **웹 버전**: v5.13.52
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 아산지점 메인 탭 `연간실적`을 `실적관리`로 변경.
  - 실적관리 하위 탭 `종합실적`, `월간실적`, `연간실적` 추가.
  - 기존 연간실적 화면은 `실적관리 > 연간실적`로 이동하고 legacy 저장 탭값은 자동 보정.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 실적관리 하위 탭 구조 및 연간실적 연결 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 SQL 적용 완료, 최초 데이터 적재 대기 |
| NAS 백엔드 | 정상 | 배차판/선적관리/연간실적 저부하 파일감지 주기 적용 |
| ELS Bot | 정상 | eTrans 세션 연장/자정 롤오버 타이머 가드 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

## INTRANET UI 기준
- **목록 테이블**: 고정 폭 컬럼 + 마지막 비고/주소 컬럼 유동 폭, 헤더는 짙은 블루 계열.
- **상세 화면**: `Hero → 주요 필드 Grid → 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치와 톤 통일.
- **모바일**: 카드 기반 목록, 컨테이너 좌우 3~4px, 본문 폰트 0.72~0.88rem 중심.

## MILESTONES
- [x] Phase 1-6: AI 에이전트 및 RAG 기반 구축
- [x] v5.10: 차량위치관제/GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 인트라넷 연락처형 페이지 UI 파이프라인 정리
- [ ] v5.14: 아산 월별실적 취합 및 연간+월별 합산 API
- [ ] Next: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## RECENT CHANGES
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
- **v5.13.35**: 아산 선적관리 전용 `/container-lookup` 스트림 라우트를 추가해 부분/최종 컨테이너 조회 결과를 서버 측에서 즉시 저장.
- **v5.13.34**: 선적관리 날짜 필터 바에 `미선적`, `자체보관` 빠른 필터를 추가.
- **v5.13.33**: 선적관리 컬럼 필터 후보를 전체 로드 기준으로 만들고 빈값 정규화, 자동 더보기를 보강.
- **v5.13.32**: 컨테이너 조회 완료 행을 전체 행 회색 음영/회색 글씨로 표시.
- **v5.13.31**: 배차판/선적관리 NAS 엑셀 동기화를 mtime+size 안정화 게이트로 보강.

## VERIFICATION
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe elsbot\tests\test_els_bot_logic.py`: 14개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile elsbot\els_bot.py elsbot\els_web_runner_daemon.py`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 30개 통과
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs`: 38개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs web/tests/vehicleTrackingExport.test.mjs`: 46개 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs`: 39개 통과
- `C:\Users\hoon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- `npm.cmd run build`: 통과 (샌드박스 외부 fetch EACCES 로그는 기존 외부 네트워크 제한)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "utils/asanShippingView.mjs"`: 0 errors
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 아산 연간실적: 운영 DB SQL 적용 완료. v5.13.51 재배포 후 `NAS 동기화`를 누르면 백그라운드로 최초 적재되고 완료 시 Supabase 원장이 표시되어야 함.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
