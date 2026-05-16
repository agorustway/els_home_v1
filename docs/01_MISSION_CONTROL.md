# ELS MISSION CONTROL (v5.13.39 / APK v5.11.12)

> 최신 업데이트: eTrans 컨테이너 이력조회 세션 연장 버튼 클릭 후 클라이언트 타이머를 재동기화하고, 자정 날짜 변경 시 타이머가 세션 종료로 오판하는 롤오버 가드를 추가했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.39
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - eTrans 내부 타이머가 `HHMMSS` 차이만으로 남은 시간을 계산해 자정 이후 음수 차이를 세션 종료로 오판할 수 있음을 확인.
  - 세션 연장 버튼 클릭 후 서버 연장뿐 아니라 WebSquare `startSessionTimer()`를 재시작해 `scwin.startTimeObj`를 현재 시각으로 갱신.
  - 로그인 직후와 자동 연장 시 자정 롤오버 가드를 설치해 `curHms < startHms` 상황에서 자동으로 세션 연장/타이머 초기화를 수행.
  - 연장 버튼을 못 찾는 경우에도 WebSquare 전역 함수 직접 호출로 연장과 타이머 재시작을 시도.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 선적관리 회귀 테스트 및 ESLint 통과 |
| Supabase 인증/DB | 정상 | 선적관리 조회 결과는 최신 조회 기준으로 교체 저장 |
| NAS 백엔드 | 정상 | 배차판/선적관리 저부하 파일감지 유지 |
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
- [ ] Next: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## RECENT CHANGES
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
- `node --test web/tests/asanShippingFlow.test.mjs`: 20개 통과
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs`: 31개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-lookup/route.js" "utils/asanShippingView.mjs"`: 0 errors
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 없음. 다음 작업자는 NAS 배포 후 00시 전후 또는 장시간 대기 상태에서 세션 타이머가 재시작되는지 `/employees/ask?debug=true` 모니터링으로 확인.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
