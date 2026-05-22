# ELS MISSION CONTROL (v5.14.111 / APK v5.11.25)

> 최신 업데이트: 아산 배차판 BKG1/2/3, TARGET VESSEL, 비고를 WEB 전용 DB 입력/이력 구조로 분리했습니다.

## CURRENT STATUS
- **웹 버전**: v5.14.111
- **동기화 정책**: 연간실적은 파일별 외부 Node importer `summary-only/snapshot import` 유지, 화면은 annual 현재 스냅샷 전체를 통합 조회. 월간실적은 `dataset_type=monthly` + `diff-current` 누적 원장으로 월별 파일을 순차 백그라운드 적재한다.
- **APK 버전**: v5.11.25
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 아산 배차판 `BKG1/BKG2/BKG3/TARGET VESSEL/비고`는 컷오버 후 엑셀 원본 칸을 무시하고 WEB DB 오버레이(`branch_dispatch_web_cells`)만 표시·저장한다.
  - WEB 입력값은 `branch_dispatch_web_cell_history`에 변경 전/후 값, 사용자, 시각, 행 컨텍스트를 남긴다.
  - BKG/TARGET VESSEL은 영문·숫자·기호만, 비고는 한글·영문·숫자·기호를 허용한다.
  - `web/supabase_sql/20260522_asan_dispatch_web_cells.sql` 적용 후 `web/scripts/backfill-asan-dispatch-web-cells.mjs`로 현재 엑셀 값을 1회 보존해야 WEB 전용 모드가 활성화된다.
  - 아산지점 첫 진입은 항상 배차판으로 시작하고, 실적관리 버튼 진입은 항상 종합실적 탭으로 시작한다.
  - 아산지점 메인 페이지는 선적관리/종합실적/월간실적/연간실적을 동적 청크로 분리하고, hover/focus/touch/idle 프리패치로 탭 이동 체감 속도를 보강한다.
  - 실적관리 하위 화면은 필요한 탭만 mount하고, 선적관리 저장 컨테이너 이력 및 실적 동기화 상태 조회는 첫 렌더 이후로 미룬다.
  - 종합실적 제목은 `컨테이너 운송 통합실적`, 주요 비율 문구는 `이익률`/`자사 비율`, 경영 판단 항목은 `이익률 우수`/`이익률 점검`으로 통일한다. 계약/차량 집중도는 매출/건수 비중을 구분하고, 연간·월간실적 테이블 검색은 금액 쉼표·공백을 정규화한다.
  - 아산 배차판 자동 동기화는 행 데이터와 셀 메모 변경을 모두 감지하고, 화면은 선택 날짜를 유지한 채 60초마다 DB를 재조회한다.
  - NAS `els-bot`은 컨테이너 기동 후 저장된 ETRANS 계정으로 Selenium 풀 워밍업을 백그라운드 시작한다.
  - Bot 자동 로그인은 브라우저/복구 경로 전체를 합쳐 계정 기준 최대 3회만 허용하고, 비밀번호성 실패는 즉시 전체 자동 시도를 중지한다.
  - Bot 보호모드는 10분 후 자동 초기화하지 않으며, ETrans 계정 확인 후 `BOT 정지`로 수동 초기화해야 다시 로그인할 수 있다.
  - 선적관리 컨테이너 수동 조회는 NAS core 백그라운드 job으로 실행하고, 구형 대량 스트림 경로도 job으로 넘겨 페이지 이동 후에도 BOT 조회와 Supabase 저장을 계속한다.
  - 선적관리 DB 동기화는 rows 저장 건수 검증 후 파일 메타를 갱신하며, 메타만 있고 실제 rows가 비면 엑셀 fallback으로 빈 화면을 막는다.
  - 선적관리 100건 이상 컨테이너 조회는 대량 안정 모드로 병렬 1개, 워커대기 300초, 제출간격 2초를 기본 적용하고, 저장 이력 없는 컨테이너를 화면 정렬 순서 안에서 먼저 조회한다.
  - 연간실적은 5분 기본 주기로 24시간 파일 변경을 감지하고, 월간실적 자동 감지는 미존재 미래월을 순환 후보에서 제외한 뒤 실제 존재하는 마지막 월 파일을 60초, 이전 월 파일을 120초 기준으로 확인해 변경된 파일만 외부 Node importer로 Supabase DB에 누적 반영한다.
  - 월간실적 파일 설정 모달은 기준연도 12개월, 다음해 정리기간, 사용 월 수, 첫 번째 시트/직접 시트명, 표 제목 행 자동 탐지를 업무용 문구로 안내하고, 기준연도 변경 시 이월 슬롯 판정을 선택연도 기준으로 맞춘다.
  - 월간실적 모바일 분석 기준 제목 영역은 480px 이하에서 내용 높이만 쓰도록 보정하고, 구성·차량 성과의 차량 TOP10은 매입액 기준으로 정렬·표시하며 건수만 함께 보여준다.
  - Android 운행종료는 TRIP_END/서버 완료 후 오버레이·GPS·activeTrip·UI만 정리하고 앱 화면은 유지한다.
  - Android 앱 종료/오버레이 종료는 `killProcess()`를 쓰지 않고, 서버상 완료된 저장 운행 발견 시 native trip/service 상태까지 정리한다.
  - 종합실적은 연간/월간 동기화 완료 상태를 감지하면 Supabase summary를 다시 읽으며, 화면 조회는 NAS가 끊겨도 저장된 DB 기준을 유지한다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 구조 분리 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡/보호모드/수동 정지 지원 |
| Android 드라이버 앱 | 정상 | APK v5.11.25 빌드 완료 |

## INTRANET UI 기준
- **목록 테이블**: 고정 헤더, 균일 버튼 높이, 모바일 카드 대체 뷰.
- **상세 화면**: `Hero -> 주요 필드 Grid -> 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치 통일.
- **로딩 안내**: 아산지점 모든 페이지 초기 로딩 문구는 `데이터를 불러오는 중입니다...`, 폰트 `0.86rem / 800 / #64748b`.
- **실적관리**: 상단 `실적관리` 아래 `종합실적 / 월간실적 / 연간실적`; 종합실적은 `이익률`과 `자사 비율` 기준으로 표기하고, 연간/월간은 설정 버튼명과 근거표/차량 기준을 정리.

## MILESTONES
- [x] Phase 1-6: AI 어시스턴트 및 RAG 기반 구축
- [x] v5.10: 차량위치관리 GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 아산 배차판/연간실적 분석 리포트 확장
- [x] v5.14: NAS core 대용량 엑셀 파싱 메모리 보호
- [x] v5.14.64-111: 월간/연간/종합실적 분석, 행사일정, 선적 job, 배차판 DB 누적·자동갱신·WEB 전용 셀 저장 구조 보정

## RECENT CHANGES
- **v5.14.111**: 아산 배차판 BKG1/2/3, TARGET VESSEL, 비고를 WEB DB 전용 입력으로 분리. 컷오버 백필 스크립트, 저장 API, 이력 테이블, 입력 검증, 화면 인라인 편집을 추가했다.
- **v5.14.110**: 종합실적 `경영 판단`의 구버전 summary-view 문구도 표시 직전 정규화해 `수익성 압력`은 `이익률`, `ELS/외부 집중도`는 `자사 비율`, 마진 표현은 `이익률 우수/점검`으로 보이게 했다.
- **v5.14.109**: 종합실적 화면 제목을 `컨테이너 운송 통합실적`로 바꾸고, `손익률`은 `이익률`, `수익성 압력`은 `이익률`, `ELS/외부 집중도`는 `자사 비율`로 정리했다. 자사 비율 값도 `자사/외부` 표현으로 맞췄다.
- **v5.14.108**: 선적관리 구형 대량 컨테이너 조회 API도 NAS background job으로 전환해 페이지 이동으로 스트림이 끊겨도 조회가 계속되게 했다. job id가 없는 복원 요청은 최신 실행 job을 반환하고, 선적관리 DB 동기화는 rows 저장 count 검증 후 메타를 갱신하며 rows가 비어 있으면 DB 대신 엑셀 fallback을 사용한다.
- **v5.14.107**: 아산 배차판 자동 동기화 해시에 셀 메모를 포함해 메모만 수정한 저장도 DB upsert 대상이 되도록 보정. 배차판 화면은 수동 NAS 동기화/새로고침 없이도 60초마다 조용히 재조회하며 현재 선택 날짜/전체 탭을 유지한 채 `저장:` 시각을 갱신한다.
## VERIFICATION
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 33개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/dispatch/web-cell/route.js" "app/api/branches/asan/export/route.js" "tests/asanDispatchWebCells.test.mjs"`: 통과
- `npm.cmd run build`, `git diff --check`: 통과

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 게임.
- `/employees/news` 하단 숨은 트리거로 미니 모달 진입 가능.

## IN-PROGRESS
- 배차판 WEB 전용 셀 DB 적용 대기: `web/supabase_sql/20260522_asan_dispatch_web_cells.sql` 적용 후 `cd web; node scripts/backfill-asan-dispatch-web-cells.mjs`를 1회 실행해야 컷오버가 활성화된다.
- 행사일정 DB 적용 대기: `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용해야 운영 DB에서 저장/팝업 조회가 활성화된다. 적용 전 로컬 디버그 화면에는 `intranet_events` 테이블 없음 안내가 보일 수 있다.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
