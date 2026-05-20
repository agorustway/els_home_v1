# ELS MISSION CONTROL (v5.14.84 / APK v5.11.24)

> 최신 업데이트: 아산지점 메인 페이지의 선적관리/실적관리 하위 화면을 동적 로딩으로 분리해 초기 진입 부담을 줄였습니다.

## CURRENT STATUS
- **웹 버전**: v5.14.84
- **동기화 정책**: 연간실적은 파일별 외부 Node importer `summary-only/snapshot import` 유지, 화면은 annual 현재 스냅샷 전체를 통합 조회. 월간실적은 `dataset_type=monthly` + `diff-current` 누적 원장으로 월별 파일을 순차 백그라운드 적재한다.
- **APK 버전**: v5.11.24
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 아산지점 메인 페이지는 선적관리/종합실적/월간실적/연간실적을 동적 청크로 분리하고, hover/focus/touch/idle 프리패치로 탭 이동 체감 속도를 보강한다.
  - 실적관리 하위 탭은 저장된 탭을 확인한 뒤 해당 화면만 mount하고, 선적관리 저장 컨테이너 이력 및 실적 동기화 상태 조회는 첫 렌더 이후로 미룬다.
  - NAS `els-bot`은 컨테이너 기동 후 저장된 ETRANS 계정으로 Selenium 풀 워밍업을 백그라운드 시작한다.
  - AI/API 단건 컨테이너 조회는 워커가 0개면 `/warmup`을 호출해 페이지 진입 없이 bot 준비를 트리거한다.
  - 컨테이너 이력조회 페이지 시스템 로그 영역에 `BOT 정지` 버튼을 추가해 조회, 로그인 상태, 워커 표시를 즉시 정리한다.
  - Bot 운영 워커는 2개 유지하며 도커 재기동/리셋 이후에도 저장 계정 기반 자동 복구 흐름을 유지한다.
  - 03:00 일일 리셋은 공통 bot warmup 경로를 사용해 메뉴 진입 타임아웃 등 일시 실패를 워커별 3회 재시도하고, 계정 잠금/비밀번호 오류는 즉시 재시도 중단한다.
  - 선적관리 대량 자동조회는 기본 스트림 대기 시간을 3600초로 늘리고, 소비자 연결 종료만으로 `els-bot` 전체를 stop하지 않는다.
  - 연간실적은 5분 기본 주기로 24시간 파일 변경을 감지하고, 월간실적 자동 감지는 체크된 파일 중 실제 존재하는 마지막 월 파일을 60초, 이전 월 파일을 120초 기준으로 확인해 변경된 파일만 외부 Node importer로 Supabase DB에 누적 반영한다.
  - 월간실적 파일 설정 모달은 기준연도 12개월, 다음해 정리기간, 사용 월 수, 첫 번째 시트/직접 시트명, 표 제목 행 자동 탐지를 업무용 문구로 안내하고, 기준연도 변경 시 이월 슬롯 판정을 선택연도 기준으로 맞춘다.
  - 월간실적 모바일 분석 기준 제목 영역은 480px 이하에서 내용 높이만 쓰도록 보정해 상단 공백을 줄인다.
  - Android 운행종료는 TRIP_END/서버 완료 후 오버레이·GPS·activeTrip·UI만 정리하고 앱 화면은 유지한다.
  - 종합실적은 연간/월간 동기화 완료 상태를 감지하면 Supabase summary를 다시 읽으며, 화면 조회는 NAS가 끊겨도 저장된 DB 기준을 유지한다.
  - NAS 배포 스크립트는 전체/CORE/BOT 모두 이미지 빌드와 고정 이름 컨테이너 제거를 분리해 docker-compose v1 재생성 충돌을 피한다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 annual current snapshots 통합 조회, 월간실적 monthly 누적 원장 준비 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, Bot은 2워커 자동 워밍업 |
| ELS Bot | 계정 확인 필요 | Selenium 워커 2개, 기동 워밍업 및 수동 정지 지원. ETrans 계정 잠금 감지 시 자동 재시도 차단 |
| Android 드라이버 앱 | 정상 | APK v5.11.24 빌드 완료 |

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
- [x] v5.14.64: 월간실적 선택 단계별 누적 그래프와 중복 트리 제거
- [x] v5.14.65: Android 기존 플로팅 위젯 최소화 표시 복구
- [x] v5.14.66: Android 백그라운드 위치수신 회귀 테스트와 버튼 색상 정리
- [x] v5.14.67: 월간실적 그래프 단위와 세분화 탭 기준 보정
- [x] v5.14.69: 선적관리 컨테이너 자동조회 DB 설정과 03:00/03:10 스케줄
- [x] v5.14.70: 종합실적 선택 단위별 그래프 단위 보정과 상단 바로가기 제거
- [x] v5.14.71: 연간실적 장기/직계약 그래프 콜아웃과 요일 분석 재구성
- [x] v5.14.72: 월간실적 보고서 표 전용파서 raw preview 복원과 총액 덮어쓰기 안전장치
- [x] v5.14.73: 월간실적 보고서 표 없음 배너 제거
- [x] v5.14.74: 실적관리 하위 페이지 테이블 하단 슬라이드와 모바일 폭 보정
- [x] v5.14.75: 컨테이너 Bot 자동 워밍업과 수동 정지 버튼
- [x] v5.14.76: 월간실적 NAS 파일 자동 감지와 종합실적 동기화 완료 후 새로고침
- [x] v5.14.77: 월간실적 파일 설정창 업무용 라벨과 기간 요약 정리
- [x] v5.14.78: 월간실적 기준연도 변경 시 이월 슬롯 판정 보정
- [x] v5.14.79: ELS Bot 03:00 일일 리셋 워밍업 재시도 보강
- [x] v5.14.80: ELS Bot 계정 잠금 팝업 감지와 자동 재시도 차단
- [x] v5.14.81: 월간실적 모바일 분석 기준 공백 보정
- [x] v5.14.82: Android 운행종료 후 앱 화면 유지 복구
- [x] v5.14.83: 선적관리 컨테이너 자동조회 장시간 스트림과 봇 stop 분리
- [x] v5.14.84: 아산지점 하위 화면 동적 로딩과 초기 조회 지연

## RECENT CHANGES
- **v5.14.84**: 아산지점 메인 번들에서 선적관리와 실적관리 하위 화면을 분리했다. 저장 탭 복원 후 필요한 화면만 mount하고, 나머지는 hover/focus/touch/idle 시점에 미리 받아 탭 이동을 부드럽게 만든다. 선적관리 저장 컨테이너 이력 조회와 실적 동기화 상태 첫 조회도 렌더 직후로 밀어 모바일 초기 화면 부담을 낮췄다.
- **v5.14.83**: 선적관리 컨테이너 자동조회가 482건 규모에서 900초 read timeout을 만나 스트림이 닫히고, Bot 응답 생성기의 `GeneratorExit`가 데몬 `/stop`까지 호출하던 문제를 보정했다. Core 자동조회 스트림 timeout 기본값은 3600초로 늘리고, 명시 `stopOnDisconnect=true`가 아닌 연결 종료는 데몬 전체 stop으로 전파하지 않는다.
- **v5.14.82**: 운행종료 성공 뒤 `exitAppForce()`를 예약 호출하던 흐름을 제거했다. 이제 운행종료는 TRIP_END 기록, 서버 complete, 오버레이 서비스 중지, JS GPS watcher 중지, activeTrip 제거, 운행 UI 초기화까지만 수행하고 앱 화면은 계속 유지한다. 회귀 테스트도 앱 태스크 제거 금지 조건으로 바꿨다. APK v5.11.24.
- **v5.14.81**: 월간실적 모바일 480px 이하에서 `분석 기준/전체` 제목 박스가 column flex 안의 기존 `flex-basis: 220px`을 높이로 먹어 상단이 비어 보이던 문제를 수정했다. 모바일에서는 제목 박스가 내용 높이만 쓰고 전체 폭을 차지하도록 보정했다.
- **v5.14.80**: ETrans 로그인 팝업의 `로그인을 5회 이상 실패하여 정지된 계정`/`임시비밀번호` 문구를 `LOGIN_ACCOUNT_LOCKED`로 분리했다. 저장 계정 워밍업은 이 인증 오류를 만나면 실패 횟수를 잠금 상태로 표시하고 추가 자동 로그인 시도를 중단한다.
- **v5.14.79**: ELS Bot 03:00 일일 리셋이 별도 단발 로그인 스레드를 직접 만들던 흐름을 공통 `_start_login_pool(... force_restart=True)` 경로로 합쳤다. 기존 워커를 강제 정리한 뒤 저장 계정으로 백그라운드 워밍업을 시작하고, 메뉴 진입 타임아웃 같은 일시 실패는 워커별 최대 3회 재시도한다.
- **v5.14.78**: 월간실적 파일 설정에서 기준연도를 바꾸거나 월 목록을 재생성할 때 본연도 12개월이 `이월`로 잘못 분류되지 않도록 슬롯 정규화 기준을 선택한 기준연도에 맞췄다. 저장 슬롯에 `carryover` 값이 있으면 그 값을 우선하고, 없을 때만 선택 기준연도로 보정한다.
- **v5.14.77**: 월간실적 파일 설정 모달에서 내부 토큰 `__first__` 노출을 없애고 `첫 번째 시트` 선택으로 바꿨다. `제목행`은 `표 제목 행`으로 풀어 설명하고, 비워두면 자동 감지된다는 안내를 붙였다. 기준연도와 정리기간은 각각 12개월 기본 구간과 다음해 이월 정리 월로 표시하며, 현재 파일 공간/기준연도 구간/정리기간 구간 요약 카드를 추가했다.
- **v5.14.76**: NAS Core에 월간실적 자동 감지 스케줄러를 추가했다. 연간/월간 감지는 기본 24시간으로 두고, 체크된 월간 파일 중 실제 존재하는 마지막 활성 파일은 60초, 이전 파일은 120초 간격으로 mtime/DB meta를 확인한다. 변경 감지 시 해당 파일만 `files_only` 외부 importer로 순차 동기화한다. 수동 동기화는 기존처럼 체크된 15개 슬롯을 즉시 순차 처리하며, 월간 파일 설정 모달은 기준연도/정리기간/시트/제목행 의미를 명확히 보여준다. 종합실적은 연간/월간 동기화가 끝난 것을 감지하면 Supabase summary를 다시 읽는다. NAS 배포 스크립트도 빌드/컨테이너 제거/재기동 단계로 분리했다.
- **v5.14.75**: `els-bot` 컨테이너 기동 후 저장된 ETRANS 계정으로 Selenium 풀을 백그라운드 워밍업한다. 단건 컨테이너 API는 워커가 0개면 `/warmup`을 호출해 페이지 진입 없이 bot을 준비시키고, 컨테이너 이력조회 화면에는 `BOT 정지` 버튼을 추가해 조회·워커·로그인 상태를 수동 종료할 수 있게 했다.
- **v5.14.74**: 종합/월간/연간 실적관리에서 테이블형 영역이 브라우저 폭을 넘을 때 화면 안쪽 하단 슬라이더로 이동하도록 공통 스크롤 스타일을 확장했다. 요약 추세, 세분화, 차량성과, 보고서 표, 월/일 흐름, 히트맵, 이월 청구처 표까지 같은 스크롤바 규칙을 적용했고, Galaxy S24급 폭에서는 카드·버튼·원장 테이블 높이를 더 촘촘하게 조정했다.
- **v5.14.73**: 월간실적에서 `reportTableReady=false`일 때 뜨던 `보고서 표 없음 · 원장 기준 분석 중` 배너를 제거했다. 보고서 표 파서는 뒤에서 유지하되, 표가 없으면 원장 기준 분석 카드와 세분화만 조용히 보여준다.
- **v5.14.72**: 월간실적 보고서 표 전용파서가 원장 헤더 이후 행만 보던 한계를 보강해, 엑셀 상단 raw preview에서 `순매출/순매입/계산서/이월` 표를 복원한다. 파서 결과에는 `quality.primaryReady`를 붙여 완전 표만 월간 총액 기준으로 승격하고, 부분 표는 보조 표시로 남겨 원장 누적값을 덮어쓰지 않게 했다.
## VERIFICATION
- `node --test web/tests/asanShippingFlow.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs web/tests/asanSummaryPerformance.test.mjs web/tests/asanDashboardView.test.mjs`: 84개 통과
- `node --check` 아산지점 page/선적/종합/월간/연간 화면: 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/(main)/employees/branches/asan/AsanShipping.js" "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanMonthlyPerformance.js" "app/(main)/employees/branches/asan/AsanSummaryPerformance.js" "tests/asanShippingFlow.test.mjs" "tests/asanMonthlyPerformance.test.mjs" "tests/asanSummaryPerformance.test.mjs"`: 통과
- `npm.cmd run build`: 통과, `/employees/branches/asan` 26.7kB / First Load JS 115kB
- 로컬 프로덕션 서버 `http://localhost:3010/employees/branches/asan`: HTTP 200 확인
- `git diff --check`: 통과

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 게임.
- `/employees/news` 하단 숨은 트리거로 미니 모달 진입 가능.

## IN-PROGRESS
- 없음. 월간실적 자동 감지는 NAS 재배포 후 `/api/branches/asan/performance/monthly?source=status`에서 `start_hour=0`, `active_poll_seconds=60`, `stale_poll_seconds=120`, `last_target=2026-05`, `last_result=db-current` 확인 완료.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
