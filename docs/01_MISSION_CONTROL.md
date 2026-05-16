# ELS MISSION CONTROL (v5.13.17 / APK v5.11.12)

> 최신 업데이트: 컨테이너 이력조회 워커 사용과 부분 결과 표시 병목을 보강했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.17
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 컨테이너 이력조회 수동 배치는 준비된 워커를 모두 사용하고 AI/단건은 필요 시 대기.
  - 부분 결과는 입력 순서 표를 유지하되 완료된 행부터 즉시 갱신해 2/10 정체처럼 보이는 현상 완화.
  - ETrans 입력/조회 클릭은 JS 이벤트 우선으로 전환하고 단계별 타이밍 로그를 남김.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | `npm.cmd run lint`, `npm.cmd run build` 통과 |
| Supabase 인증/DB | 정상 | `ai_chat_memory` 삭제/치환 동기화 보강 |
| NAS 백엔드 | 정상 | 컨테이너 부분 결과 즉시 스트림, 배포 스크립트 보강 |
| ELS Bot | 정상 | JS 입력/조회 트리거, 단계별 병목 로그, 워커 세대 무효화 |
| Android 드라이버 앱 | 정상 | 앱 로컬 GPS 안정화/중복 전송 방어, APK v5.11.12 빌드 완료 |

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
- **v5.13.17**: 컨테이너 이력조회 배치가 준비된 워커를 모두 쓰도록 `reserveSingle=false`를 전달하고, 백엔드는 완료된 행을 순서 대기 없이 즉시 스트리밍. ETrans 입력값은 JS 세팅/검증 우선, 조회 버튼은 JS 이벤트 우선으로 바꿔 80~90초 클릭 대기 병목을 줄이고 단계별 타이밍 로그를 추가.
- **v5.13.16**: `nas-deploy.sh`에 Docker PATH를 sudo 환경변수로 주입하고 `set -e`를 추가해 docker-compose build가 `docker` 실행 파일을 못 찾거나 실패했을 때 즉시 중단되도록 보강.
- **v5.13.15**: `nas-deploy.sh`의 Docker 호출을 NOPASSWD sudoers와 일치하는 절대경로/비대화형 sudo로 변경해 SSH 배포 중 비밀번호 프롬프트로 core/bot/gateway 빌드가 멈추는 문제를 방지.
- **v5.13.14**: 컨테이너 이력조회 진행 중 버튼을 `조회 중지`로 전환하고 AbortController/stop-daemon을 연결. 백엔드는 배치 큐를 동적 제출로 바꿔 미제출 행을 `조회 중지됨` 오류 행으로 확정하고, 데몬은 stop 플래그와 세대 번호로 리셋 후 늦은 로그인/복구 워커가 다시 붙지 못하게 차단.
- **v5.13.13**: 아산 선적관리 웹 조회를 Supabase 페이지 단위 로딩으로 전환해 첫 요청을 500행으로 축소. 검색어는 서버 쿼리로 전달하고 콤마 구분 OR 검색을 지원. DB 전체 건수/로드 건수와 더보기 UI를 추가하고 Hook 경고를 제거.
- **v5.13.12**: 아산 선적관리 일반 조회에서는 Supabase DB만 우선 조회하고 NAS 엑셀 동기화는 POST 수동/스케줄 경로로 분리. 웹 동기화 버튼은 POST를 호출하며, 회귀 테스트를 추가해 GET 경로에서 동기화 호출이 되살아나지 않게 방어.
- **v5.13.11**: 서식자료실 상세의 다운로드 카드 UI를 제거하고 업무자료실과 같은 `IntranetDataTable` 첨부 목록 구조로 통일. 자료실 하위의 첨부파일 표시 경로를 재검토해 카드형 잔존 경로를 정리.
- **v5.13.10**: 업무자료실/서식자료실 상세 본문 HTML 이미지와 표가 브라우저 축소 시 컨테이너 밖으로 튀어나가지 않도록 공통 본문/상세 섹션 반응형 가드를 추가. 연락처/작업지 상세가 공유하는 `DetailSection`에도 이미지·표·pre 폭 제한과 내부 가로 스크롤을 적용.
- **v5.13.9**: 워커 1개 상황에서는 배치를 순차 처리하고, 2개 이상에서는 단건/AI용 1개를 남겨 세션 없음 폭주를 방지. 죽은 워커는 쿨다운을 두고 1개씩 재기동 시도.
- **v5.13.8**: ETrans WebSquare 입력값 검증을 추가하고, `필수 입력 항목` 알림을 ERROR로 표기하도록 보강. 데이터 없음 판정 범위를 602 조회 영역/보이는 모달로 축소.
- **v5.13.7**: 컨테이너 이력조회 화면에서 체크섬 오류 번호를 조용히 제외하지 않고, 입력 순서의 오류 행으로 표시하도록 파서와 테스트를 보강.
- **v5.13.6**: 컨테이너 이력조회 stale 데이터 방어, 빈 그리드 오판 수정, 실패 1회 재조회, 입력순 결과 스트림, 봇 워커 4개 복구.
- **v5.13.5 / APK v5.11.12**: 앱 로컬 GPS 후보/확정 포인트 분리, 중복 전송 큐 압축, 서버 저장 중복 방어, 운행 종료 후 Android 서비스 잔류 차단.
- **v5.13.4 / APK v5.11.11**: 차량위치관제 GPS 이상치 필터 강화, 앱 지도 실시간 수집·경로 유지·상세 패널 겹침 해소, 웹 상세 패널/마커 줌 토글 정리.
- **v5.13.3**: 업무보고 목록/작성/상세/첨부 UI를 고밀도 표준으로 보정하고, 아산 배차판/선적관리 테이블 헤더·폰트·행 높이를 축소.
- **v5.13.2**: AI 어시스턴트 대화 삭제 전 예약 저장 타이머를 취소하고, 전체/개별/현재 대화 삭제를 DB에 즉시 반영.
- **v5.13.1**: 작업지정보 주소 폭 축소 및 주의사항/특이사항 컬럼 추가, 업무자료실 상세/첨부 목록형 정리, 이스터에그 복구.
- **v5.13.0**: 연락처형 페이지 공통 테이블/상세 컴포넌트화, 모바일 카드 뷰 재정렬.
- **v5.12.22**: 이트랜스 "데이터가 없음" 키워드 및 그리드 초기화 객체 보강.
- **v5.12.21**: 컨테이너 이력조회 데이터 누수 방지.
- **v5.12.20**: 아산 모바일 UI 높이/저장시간 겹침 수정.

## VERIFICATION
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety elsbot.tests.test_daemon_stop_control`: 16개 통과 (번들 Python 사용)
- `python -m py_compile docker/els-backend/app_bot.py elsbot/els_web_runner_daemon.py elsbot/els_bot.py elsbot/tests/test_els_bot_logic.py`: 통과
- `npm.cmd run lint -- "app/(main)/employees/container-history/page.js"`: 0 errors, 기존 warning 5건
- `node --test web/tests/containerInput.test.mjs`: 4개 통과
- `npm.cmd run build`: 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- `C:\Program Files\Git\bin\bash.exe -n scripts/nas-deploy.sh`: 통과
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/containerInput.test.mjs web/tests/vehicleLocation.test.mjs`: 13개 통과
- `python -m py_compile docker/els-backend/app.py docker/els-backend/app_core.py`: 통과 (번들 Python 사용)
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" app/api/branches/asan/shipping/route.js`: 0 errors
- `npm.cmd run build`: 통과. 외부 HTTPS fetch EACCES 및 차량 엑셀 export dynamic 경고는 기존 환경성 경고.
- 로컬 dev 서버 `/employees/branches/asan`: HTTP 200 확인(인증 보호로 로그인 페이지 응답)
- Supabase 운영 DB 확인: `branch_shipping_files` 1건, `branch_shipping_rows` 965건 조회 성공
- `python -m unittest elsbot.tests.test_els_bot_logic elsbot.tests.test_container_lookup_safety`: 14개 통과
- `python -m py_compile elsbot/els_bot.py elsbot/els_web_runner_daemon.py docker/els-backend/app_bot.py`: 통과
- `git diff --check`: 통과
- `node --test web/tests/containerInput.test.mjs`: 4개 통과
- `node --test web/tests/vehicleLocation.test.mjs`: 6개 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- `scripts\build_driver_apk.ps1`: APK v5.11.12 / versionCode 5153 빌드 및 `web/public/apk/els_driver.apk` 반영
- 브라우저 디버그 확인: `/employees/vehicle-tracking?debug=true` 화면 및 상세 패널 렌더링 확인
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 EACCES 경고 발생. 빌드 종료 코드는 0.

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 없음. 다음 작업자는 기사 앱에서 실내 정차 흔들림, 실제 도로 주행 경로선, 운행 종료 후 뒤로가기 완전 종료를 현장 단말로 확인.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
