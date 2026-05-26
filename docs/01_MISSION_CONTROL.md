# ELS MISSION CONTROL (v5.14.226 / APK v5.11.29)

> 최신 업데이트: WEB BKG 저장 문맥 검증과 GLAPS 테이블 높이 잠금 해제를 반영했다.

## CURRENT STATUS
- **웹 버전**: v5.14.226
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **GLAPS 목표**: 배차판 상세라인에서 `상차지 + 경유지(ELS/작업지) + 하차지(선적)`으로 기존 GLAPS 운송경로코드를 도출하고, 최종 업로드용 코드 컬럼을 검수한다.
- **GLAPS 활성 원장**: `6724943a-5c6c-416e-bab0-bbac487b8c4c` / 8개 시트 / 운송경로 540건 / 항목매핑 2,923건 / 원본행 1,177건.
- **GLAPS NAS 백업**: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`

## GLAPS OPERATING NOTES
- `GLAPS코드` 화면은 아산 배차판 내부 탭으로 유지한다. 상위 메뉴로 올리지 않는다.
- GLAPS 업로드용 코드는 새로 만들지 않는다. 마스터 원장의 기존 코드를 도출하기 위해 ELS 별칭만 보강한다.
- 운송사코드는 `운송사코드` 시트의 `GLAPS 코드`가 아니라 `BP` 컬럼을 사용한다. 기본 `ELS`는 `B000005273`.
- 운송서비스코드는 배차판 `구분`으로 도출한다. 기본값은 `수출=5010001`, `수출(보관)=5010002`, `수입=5020001`, `수입(보관)=5020002`, `반품=311101`, `내수/석회석=6032001`.
- 포트코드는 동일 ELS 매치값에 여러 GLAPS코드를 둘 수 있다. `검수메모` 기본표시 행을 기본값으로 쓰고 상세배차/배차변동에서 행별 선택한다. 모비스는 CODE를 통합 `포트(CODE)`, 상세/변동 `포트(DIST)`로 쓰며 상세/변동 고객사는 `국가 도착항`으로 표시한다.
- 이번 마스터 보강 확인값: `ELS -> B000005273`, `CMA -> CMA`, `MAE -> MAE`, `40HC -> 4510`, `INKAT/USMOB -> 동일 코드`, `KIN -> GA0196`, `HMMA -> UH03`.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`, `수정일시`.
- 화주사코드는 운송경로 원장 기준으로 `글로비스KD외/글로비스 -> 현대글로비스주식회사(KR10)`, `모비스/모비스AS -> 현대모비스`를 매칭한다.
- 상세배차 수정필요 필터는 상차지, 운송경로, 오더구분, 화주사, 경로세부코드, 포트, 라인, 타입, 운송사, 컨샤이니, 수정건 항목별로 토글한다.
- 아산 배차판 작업 중 화면/배포 반영 확인은 브라우저 F5 대신 상단 `새로고침` 버튼을 사용한다. 버튼은 현재 보기, 배차 구분, 선택 날짜/전체 기간, 검색/필터를 저장한 뒤 실제 페이지를 다시 불러온다.
- 아산 배차판 상태칩은 진행 중 메시지(`파일 확인 중`, `요청 중`, `저장 중` 등)에 `진행` prefix를 쓰고, 완료 메시지에만 `완료` prefix를 쓴다.
- 아산 예하페이지 우측 작업 버튼 순서는 `엑셀 -> 설정 -> 새로고침 -> NAS 동기화`로 고정한다.
- 월간실적 이월은 마감월 기준으로 `청구이월 반영분(전월 미마감분이 이번 달 청구/하불에 반영)`과 `익월이월 발생분(이번 마감에서 다음 달로 넘김)`을 분리해 저장한다.
- NAS 동기화 버튼은 수동 요청 시 글로비스/모비스 모두 1순위 작업일을 먼저 반영한다. 1순위는 오늘 시트, 없으면 오늘 이후 첫 작업일, 그래도 없으면 가장 최근 과거 작업일이다.
- 1순위 완료 신호(`quick_done`)를 받으면 웹은 즉시 새로고침해 상세배차/배차변동에 최신 자료를 도출한다. 전/후 작업일과 나머지 날짜는 백그라운드에서 순차 반영한다.
- 백그라운드 동기화 중에도 1순위 완료 후 1분 쿨다운이 끝나면 NAS 동기화를 다시 요청할 수 있다. 이때 기존 백그라운드는 시트 단위로 중단하고 1순위 작업일을 다시 동기화한다.
- 상차지는 datalist 직접입력과 키보드 방향키 이동을 지원한다. 운송사코드는 기본 `ELS`의 BP 값을 다른 코드 컬럼처럼 표시만 한다.
- GLAPS 코드 웹 직접수정은 `updated_by = web:<email>`, 수정양식 업로드는 `template_upload:<email>`, 마스터 반영은 `master:<email>`로 구분한다.
- GLAPS 수정양식은 항상 `설명서`, `운송경로_수정양식`, `항목매핑_수정양식` 시트를 함께 내려받고 전체 업로드로 반영한다.
- GLAPS 수정양식에서 상차지/경유지/하차지 경로 정보는 `운송경로_수정양식`에서만 수정한다. `항목매핑_수정양식`은 포트/라인/타입/운송사/컨샤이니 등 별도 코드표만 노출하고 `운송경로코드` 컬럼은 숨긴다.
- GLAPS 수정양식의 작업 시트는 1행 제목, 2행 설명, 3행 컬럼명 구조이며, 좌측 A열부터 열리고 입력 시작 셀은 A4로 둔다.
- GLAPS 수정양식 삭제는 행 삭제가 아니라 `삭제(Y)` 칸에 `Y` 입력으로만 처리한다. 매칭상태는 `확정 / 조정필요 / 코드없음` 한글 표기를 기본으로 쓴다.
- GLAPS 수정양식 업로드는 실제 값이 달라진 행만 update한다. 단, `WEB수정` 행은 업로드 변경/삭제에서 제외하고 제외 건수를 알린다.
- GLAPS 마스터 업로드/NAS 반영은 기존 활성 버전의 `WEB수정` 행을 새 버전으로 보존해 수기 보정값이 사라지지 않게 한다.
- GLAPS 업로드 처리 결과는 활성 버전 `metadata.lastUploadResult`에 남긴다.
- GLAPS 마스터 코드시트의 `ELS코드1~N` 수기 컬럼은 위치와 무관하게 헤더명으로 읽고, 셀 안 쉼표/줄바꿈/세미콜론 다중값은 각각 별칭으로 분리한다.
- GLAPS 수정양식/웹 항목매핑은 `매핑항목`, `ELS 매치코드`, `ELS 디스크립션(설명)`, `GLAPS 디스크립션(설명)`, `최종코드(BP)`, `검수메모`를 쓴다. 운송경로/항목매핑 모두 입력값을 먼저 두고 회색 원장 보호값을 오른쪽에 두며, 웹수정은 테이블 셀 안에서 직접 처리한다.
- 상세배차 `BKG확정`은 기본 `BKG1`이며, BKG1/2/3 셀 클릭 또는 수기 입력을 WEB 보정값으로 저장한다. 선택된 BKG 셀은 색으로 표시하고, 배차확정된 일자는 상세배차 기본 보정 입력을 잠근다.
- 배차확정 후 배차판 WEB BKG1/2/3의 기존값은 잠근다. 단, 비어 있던 BKG2/3 같은 후속 부킹 칸은 추가 입력할 수 있고 저장 후 상세배차/변동내역 코드 도출에 반영한다.
- TARGET VESSEL과 비고는 확정 이후에도 운영 메모로 계속 수정 가능하다. 확정 후 변경된 BKG/TARGET VESSEL/비고 등은 상세배차/배차변동의 변경 표시 마우스오버에서 전후 값을 확인한다.
- WEB 셀 저장은 row_signature를 우선하고, row_index fallback은 작업지/고객사/포트/라인/TYPE 등 row_context가 같은 경우에만 기존 셀을 갱신한다.
- 상세배차 `BKG확정`/배차확정 API는 서버 쿠키와 클라이언트 Supabase 세션 Bearer 토큰을 모두 인증 경로로 인정한다.
- 상세배차 배차확정자/보정 수정자는 `profiles.full_name` 또는 `user_roles.name`을 우선 표시하고, 이메일 전체는 화면에 노출하지 않는다.
- `배차변동내역` 탭은 확정 당시 스냅샷 대비 추가/삭제/변경 이벤트만 발생 순서대로 표시한다. 개별/일괄 확인과 변동행 수정은 모두 이력에 남긴다.
- 변동행은 확정 후 상세현황의 작업판이다. 상차지 선택, `BKG확정`, BKG1/2/3 클릭 선택은 상세배차와 동일하게 수정/저장하고, 나머지 원천값은 WEB 부킹/비고 또는 엑셀 배차 원본에서 수정해 변동으로 감지한다.
- 배차변동 감지는 실제 배차 원천값 기준으로만 수행한다. `운송경로코드`, 포트/라인/타입코드, 오더/화주/운송사/컨샤이니 등 GLAPS 파생코드 보강은 변동 이벤트로 보지 않는다.
- 확정 후 추가된 변동행이 엑셀 원본에서 다시 삭제되면 기존 `추가`를 유지하고 아래에 별도 `삭제` 이벤트를 추가한다. 해당 추가/삭제 쌍은 `추가취소쌍`으로 회색 표시한다.
- 배차변동내역의 확인완료 행은 수정할 수 없고, `확인취소`를 누르면 다시 미확인 상태로 열어 수정할 수 있다.
- `GLAPS코드` 웹수정/삭제, 수정양식 업로드, NAS 마스터 반영 후 상세배차/배차변동내역의 GLAPS lookup을 즉시 다시 읽는다.
- 확정취소는 상세배차 잠금만 해제하며 기존 변동 이벤트를 삭제하지 않는다. 활성 확정 상태에서 현재 상세라인과 스냅샷을 비교해 최종수량을 계산한다.
- 통합현황에서 배차확정한 날짜는 변동 이벤트가 `integrated` scope에 저장된다. 글로비스/모비스 하위 탭은 별도 확정이 없으면 통합 변동 중 화주 기준 해당 이벤트만 조회하고, 확인/수정은 event id 기준으로 처리한다.
- 아산 배차판 `엑셀` 버튼은 배차판 보기에서는 현재 필터/숨김 컬럼 기준, 상세배차에서는 상세라인 기준, 배차변동내역에서는 저장된 변동 이벤트 기준으로 내려받는다.
- 상세배차/배차변동내역 다운로드는 기존 우리 기준 시트와 별도로 `GLAPS_업로드` 시트를 추가한다. `GLAPS_업로드` 시트는 NAS `/아산지점/A_운송실무/GLAPS_업로드.xlsx` 첫 시트 62컬럼을 따른다.
- `GLAPS_업로드` 시트는 동일 부킹/운송경로/선사/규격을 컨테이너 수량으로 묶고, 삭제 변동건은 신규 업로드 양식으로 표현할 수 없으므로 우리 기준 시트에만 남긴다.
- 상세배차/배차변동/GLAPS코드 데스크탑 테이블은 브라우저 높이에 맞춘 내부 세로스크롤을 쓰지 않고 페이지 스크롤로 전체 하단을 노출한다. `GLAPS코드` 테이블은 헤더 클릭 정렬, 목록 필터, 100건 단위 더보기를 쓴다.
- 상세배차/배차변동내역은 `/api/branches/asan/glaps/master?mode=lookup`의 경량 자료만 사용한다. 전체 원장/수정 화면은 `GLAPS코드` 탭의 기존 전체 조회를 사용한다.
- 배차 원장 API는 `mode=meta/date/full`을 지원한다. 화면은 날짜 메타와 선택일 상세를 먼저 표시하고 전체 원장은 백그라운드에서 채워 첫 표시 payload/render 부하를 줄인다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 + GLAPS 원장 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡 |
| Android 드라이버 앱 | 정상 | APK v5.11.29 빌드 완료 |

## RECENT CHANGES
- **v5.14.226**: 배차판 컬럼 필터/정렬 상태에서 BKG를 입력할 때 같은 row_index의 다른 행 WEB 셀이 갱신되지 않도록 서버 row_index fallback에 row_context 호환 검사를 추가했다.
- **v5.14.225**: 모비스 `CODE`를 글로비스 포트 축과 합쳐 통합현황에는 `포트(CODE)`, 상세배차/배차변동/RAG에는 `포트(DIST)`로 노출한다. 모비스 개별 화면의 국가는 유지하고, 상세/변동 고객사 컬럼에는 `국가 도착항`을 표시해 CODE 입력/검수 공간을 분리했다.
- **v5.14.224**: 상세배차/배차변동/GLAPS코드 화면의 데스크탑 높이 고정과 내부 세로 스크롤을 해제해 테이블 하단이 페이지 스크롤로 보이게 했고, GLAPS코드 원장 테이블은 100건 단위 더보기/전체 표시로 렌더링 부담을 줄였다.
- **v5.14.223**: GLAPS 포트 항목매핑에서 동일 ELS 매치값의 복수 GLAPS 코드를 후보로 유지하고, 검수메모 기본표시 행을 기본값으로 적용하며 상세배차/배차변동에서 행별 포트코드를 선택 저장하게 했다. 상차지 입력칸 폭도 줄였다.
- **v5.14.222**: 선적관리 날짜 필터 옆 빠른 필터에 `확정모선` 버튼을 추가했다. `KD선적확정모선` 또는 `AS선적확정모선` 등 선적확정모선 계열 컬럼 중 하나라도 값이 있으면 조회 대상에 남긴다.
- **v5.14.221**: GLAPS 상세배차/변동내역의 `운송서비스코드`를 배차판 `구분` 기준으로 자동 도출하고, 마스터 `운송서비스` 시트가 들어오면 해당 시트 값을 코드표로 읽는다.
- **v5.14.220**: 월간실적 importer와 dashboard summary에 이월 순환 기준을 추가했다. `청구/하불`은 마감월 반영 금액으로 유지하고, 첫 컬럼 `이월` 행은 청구이월 반영분, `이월구분 + 청구_1/하불_1`은 익월이월 발생분으로 분리한다. 운영 Supabase monthly 메타도 2026-01~05 current 원장 기준으로 백필했다.
## VERIFICATION
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchWebCells.test.mjs web/tests/asanDispatchRag.test.mjs`: 68개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/route.js" "app/api/branches/asan/export/route.js" "app/api/branches/asan/dispatch/web-cell/route.js" "tests/asanDashboardView.test.mjs" "tests/asanDispatchWebCells.test.mjs"`: 통과
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 44개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/detail-override/route.js" "app/api/branches/asan/glaps/master/route.js" "app/api/branches/asan/glaps/master/template/route.js" tests/asanDashboardView.test.mjs`: 통과
- `cd web; npm run build`: 통과
- `node --test web/tests/asanSummaryPerformance.test.mjs web/tests/asanAnnualPerformance.test.mjs web/tests/asanMonthlyPerformance.test.mjs`: 25개 통과

## IN-PROGRESS
- GLAPS 다음 단계: 실제 GLAPS 업로드 파일로 샘플 검증 후 `GLAPS_컨테이너배차관리` 후속 입력/수정 양식을 설계한다.
- 배차판 다음 최적화 후보: DB에 날짜별 유효행 요약을 저장해 `mode=meta`의 서버 내부 원장 스캔까지 줄인다.
- 배차판 WEB 전용 셀 DB 적용 대기: `web/supabase_sql/20260522_asan_dispatch_web_cells.sql` 적용 후 `cd web; node scripts/backfill-asan-dispatch-web-cells.mjs` 1회 실행.
- 행사일정 DB 적용 대기: `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- PowerShell에서 `web\app\(main)\...` 경로는 반드시 따옴표로 감싼다. 따옴표 없이 넘기면 `(main)`이 `C:\WINDOWS\system32\main.cpl`로 해석돼 `마우스 속성` 창이 뜰 수 있다. 예: `rg -n "검색어" 'web\app\(main)\employees\branches\asan'`.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- 매크로/배열수식 포함 배차판 `.xlsm` 원본 수정 시 `openpyxl.save()` 금지. 백업 후 Excel COM 자동화 또는 OOXML 엔트리 패치 후 Excel 열기 검증까지 수행.
- GLAPS 마스터 `.xlsx` 수정 시에도 백업을 먼저 만들고, ELS 별칭/입력칸 보강과 DB 활성 버전 재반영 결과를 문서에 남긴다.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
