# ELS MISSION CONTROL (v5.14.197 / APK v5.11.29)

> 최신 업데이트: 통합 배차확정으로 생성된 배차변동내역을 글로비스/모비스 하위 탭에서도 화주 기준으로 조회·확인·수정할 수 있게 보정했다.

## CURRENT STATUS
- **웹 버전**: v5.14.197
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **GLAPS 목표**: 배차판 상세라인에서 `상차지 + 경유지(ELS/작업지) + 하차지(선적)`으로 기존 GLAPS 운송경로코드를 도출하고, 최종 업로드용 코드 컬럼을 검수한다.
- **GLAPS 활성 원장**: `6724943a-5c6c-416e-bab0-bbac487b8c4c` / 8개 시트 / 운송경로 540건 / 항목매핑 2,923건 / 원본행 1,177건.
- **GLAPS NAS 백업**: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`

## GLAPS OPERATING NOTES
- `GLAPS코드` 화면은 아산 배차판 내부 탭으로 유지한다. 상위 메뉴로 올리지 않는다.
- GLAPS 업로드용 코드는 새로 만들지 않는다. 마스터 원장의 기존 코드를 도출하기 위해 ELS 별칭만 보강한다.
- 운송사코드는 `운송사코드` 시트의 `GLAPS 코드`가 아니라 `BP` 컬럼을 사용한다. 기본 `ELS`는 `B000005273`.
- 운송서비스코드는 아직 미확정이므로 상세배차 최종 컬럼에 공란으로 둔다.
- 이번 마스터 보강 확인값: `ELS -> B000005273`, `CMA -> CMA`, `MAE -> MAE`, `40HC -> 4510`, `INKAT/USMOB -> 동일 코드`, `KIN -> GA0196`, `HMMA -> UH03`.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`, `수정일시`.
- 화주사코드는 운송경로 원장 기준으로 `글로비스KD외/글로비스 -> 현대글로비스주식회사(KR10)`, `모비스/모비스AS -> 현대모비스`를 매칭한다.
- 상세배차 수정필요 필터는 상차지, 운송경로, 오더구분, 화주사, 경로세부코드, 포트, 라인, 타입, 운송사, 컨샤이니, 수정건 항목별로 토글한다.
- 아산 배차판 작업 중 화면/배포 반영 확인은 브라우저 F5 대신 상단 `새로고침` 버튼을 사용한다. 버튼은 현재 보기, 배차 구분, 선택 날짜/전체 기간, 검색/필터를 저장한 뒤 실제 페이지를 다시 불러온다.
- NAS 동기화 버튼은 수동 요청 시 글로비스/모비스 모두 오늘 기준 -2일~+2일 최근 5일을 먼저 반영한다. 최근구간 완료 신호를 받으면 상단 `새로고침`과 같은 실제 reload를 실행하고, 과거/잔여 날짜는 백그라운드에서 이어 처리한다.
- 동기화 진행 중이거나 최근 요청 후 1분이 지나지 않았으면 NAS 동기화 버튼은 잠그고 `새로고침`만 허용한다.
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
- GLAPS 수정양식/웹에서 회색 음영 칸은 GLAPS 실제 업로드/원장 기준값이므로 일반 보정 대상이 아니다. 항목매핑의 배차판 입력값 컬럼명은 `배차판 매칭용`으로 쓴다.
- 상세배차 `BKG확정`은 기본 `BKG1`이며, BKG1/2/3 셀 클릭 또는 수기 입력을 WEB 보정값으로 저장한다. 선택된 BKG 셀은 색으로 표시하고, 배차확정된 일자는 상세배차 기본 보정 입력을 잠근다.
- 상세배차 `BKG확정`/배차확정 API는 서버 쿠키와 클라이언트 Supabase 세션 Bearer 토큰을 모두 인증 경로로 인정한다.
- 상세배차 배차확정자/보정 수정자는 `profiles.full_name` 또는 `user_roles.name`을 우선 표시하고, 이메일 전체는 화면에 노출하지 않는다.
- `배차변동내역` 탭은 확정 당시 스냅샷 대비 추가/삭제/변경 이벤트만 발생 순서대로 표시한다. 개별/일괄 확인과 변동행 수정은 모두 이력에 남긴다.
- 변동행은 확정 후 상세현황의 작업판이다. 상차지 선택, `BKG확정`, BKG1/2/3 클릭 선택은 상세배차와 동일하게 수정/저장하고, 나머지 원천값은 WEB 부킹/비고 또는 엑셀 배차 원본에서 수정해 변동으로 감지한다.
- 배차변동 감지는 실제 배차 원천값 기준으로만 수행한다. `운송경로코드`, 포트/라인/타입코드, 오더/화주/운송사/컨샤이니 등 GLAPS 파생코드 보강은 변동 이벤트로 보지 않는다.
- 확정 후 추가된 변동행이 엑셀 원본에서 다시 삭제되면 이벤트를 숨기지 않고 발생일시를 갱신한 `삭제` 행으로 전환해 회색 배경으로 표시한다.
- `GLAPS코드` 웹수정/삭제, 수정양식 업로드, NAS 마스터 반영 후 상세배차/배차변동내역의 GLAPS lookup을 즉시 다시 읽는다.
- 확정취소는 상세배차 잠금만 해제하며 기존 변동 이벤트를 삭제하지 않는다. 활성 확정 상태에서 현재 상세라인과 스냅샷을 비교해 최종수량을 계산한다.
- 통합현황에서 배차확정한 날짜는 변동 이벤트가 `integrated` scope에 저장된다. 글로비스/모비스 하위 탭은 별도 확정이 없으면 통합 변동 중 화주 기준 해당 이벤트만 조회하고, 확인/수정은 event id 기준으로 처리한다.
- 아산 배차판 `엑셀` 버튼은 배차판 보기에서는 현재 필터/숨김 컬럼 기준, 상세배차에서는 상세라인 기준, 배차변동내역에서는 저장된 변동 이벤트 기준으로 내려받는다. GLAPS 업로드 전용 컬럼 순서 출력은 별도 단계로 둔다.
- `GLAPS코드` 화면 테이블은 헤더 클릭으로 오름차순/내림차순/해제 정렬하고, 헤더 아래 목록에서 현재 탭 컬럼별 고유값 필터를 건다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 + GLAPS 원장 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡 |
| Android 드라이버 앱 | 정상 | APK v5.11.29 빌드 완료 |

## RECENT CHANGES
- **v5.14.197**: 배차변동내역 API가 글로비스/모비스 하위 탭에서 직접 확정 이벤트가 없으면 `integrated` 변동 이벤트를 화주 기준으로 fallback 조회한다. 하위 탭의 개별/일괄 확인과 변동행 수정은 event id 기준으로 통합 이벤트도 안전하게 처리한다.
- **v5.14.196**: 실제 요청 진입점인 `web/middleware.js`에 Supabase URL/anon key 누락 guard를 추가했다. Preview 환경변수가 비어 있어도 공개 페이지 접근 시 루트 middleware에서 `MIDDLEWARE_INVOCATION_FAILED`가 발생하지 않게 했다.
- **v5.14.195**: Supabase middleware에서 URL/anon key가 없으면 세션 갱신을 생략하고 요청을 그대로 통과시킨다. Preview 환경변수가 비어 있어도 외부 URL 접근 시 `MIDDLEWARE_INVOCATION_FAILED`가 발생하지 않게 했다.
- **v5.14.194**: 공용 Supabase server/browser client에 환경변수 누락 fallback을 추가했다. Preview 빌드처럼 Supabase URL/키가 없는 환경에서는 import/렌더 단계에서 예외를 던지지 않고, 실제 요청은 503 성격의 응답 객체로 처리한다. 아산 export/성과 DB 헬퍼도 같은 기준으로 보정했다.
- **v5.14.193**: `/api/branches/asan/settings`의 Supabase admin client 생성을 모듈 import 시점에서 요청 시점으로 이동했다. Preview 환경에 Supabase URL/서비스키가 없더라도 빌드 수집 단계에서 실패하지 않고, 실제 요청 시 503 JSON으로 안내한다.
- **v5.14.192**: `/api/branches/asan/dispatch`의 Supabase admin client 생성을 모듈 import 시점에서 요청 시점으로 이동했다. Preview 환경에 Supabase URL/서비스키가 없더라도 빌드 수집 단계에서 실패하지 않고, 실제 요청 시 503 JSON으로 안내한다.
- **v5.14.191**: 서비스 페이지 히어로 문구를 `고객의 가치를 최우선으로 하는 맞춤형 물류 서비스`로 정리해, 공개 페이지 서비스 소개를 물류 중심으로 맞췄다.
- **v5.14.190**: 서비스 페이지 `주요 사업 및 운영 현황` 제목 위의 공통 `ELS` 보조 라벨을 해당 섹션에서만 숨겨, 공개 페이지 제목부의 어색한 장식 요소를 제거했다.
- **v5.14.189**: 공개 헤더 미로그인 상태에서 `임직원 로그인`과 `로그인`이 나란히 보이던 중복 CTA를 제거했다. 공개 내비게이션에는 `인트라넷` 단일 메뉴만 남기고, 클릭 시 기존처럼 로그인 후 임직원 홈으로 진입한다.
- **v5.14.188**: 공개 홈페이지는 한국 사용자 기준의 직관적 카피와 노출 범위로 정리하고, 미로그인 공개 헤더에서는 인트라넷 세부 메뉴 대신 `임직원 로그인`만 노출한다. 인트라넷/아산지점/안전운임/자료실/게시판 계열은 장식성 이모지를 제거하고 버튼·카드·테이블 여백과 라운드를 아산 배차판 기준의 조밀한 톤으로 맞췄다.
- **v5.14.169**: 차량위치관제 `실시간 로그` 버튼이 `/api/debug/view`를 열 때 NAS core에 라우트가 없어 404가 날 수 있던 문제를 수정했다. `els-core`에 `/api/debug/log` 수신과 `/api/debug/view` 텍스트 조회 라우트를 추가해 안드로이드 앱/오버레이 디버그 로그 흐름을 복구했다.
- **v5.14.165**: 모바일 운행 상세현황을 데스크탑 우측 패널/표 기반에서 갤럭시24 기준 전체화면 상세로 재구성했다. 위치 이력과 운행 기록은 모바일에서 카드형 타임라인으로 표시하고, 기본 정보 입력·미니맵·액션 버튼은 손가락 조작 가능한 높이와 1열 레이아웃으로 보정했다.
- **v5.14.164**: 운영 디버그 점검 중 `BKG확정`/배차확정 신규 API가 서버 쿠키 세션만 보고 401을 반환하는 문제를 확인했다. 상세배차 화면에서 Supabase access token을 Authorization 헤더로 전달하고, API는 Bearer token 인증도 허용하게 보정했다.
- **v5.14.163**: 상세배차 `업체명` 뒤에 `BKG확정` 컬럼을 추가했다. `BKG1~3` 선택 흔적과 수기 입력값은 상세라인 보정 테이블로 분리 저장하며, 배차확정/확정취소 API와 이력 테이블, `배차변동내역` 탭 기반을 추가했다. 화주사코드는 매칭된 운송경로 원장 payload의 값을 우선 사용한다.
- **v5.14.162**: GLAPS 수정양식 설명서를 다시 점검해 회색 음영 칸 의미를 명시했다. 운송경로/항목매핑의 GLAPS 원장 기준값은 엑셀과 웹에서 회색으로 표시하고, 항목매핑 `원본명` 라벨은 `배차판 매칭용`으로 바꿨다. 항목매핑 웹 목록에서도 운송경로 파생 alias는 제외했다.
- **v5.14.161**: 아산 배차판 RAG에서 `모레/내일모레/글피`를 날짜로 정규화하고, `13:00` 같은 콜론 시간과 배차정보 `09 10` 공백형 시간을 시간 필터로 매칭한다. `부산배차`처럼 지역+배차가 붙은 질문은 지역 키워드만 남기도록 보정했다.
- **v5.14.160**: GLAPS `항목매핑_수정양식`에서 운송경로 원장으로부터 자동 생성된 `start/waypoint/destination` 보조 alias와 `운송경로코드` 컬럼을 제외해, 경로 수정은 `운송경로_수정양식` 한 곳에서만 하도록 정리했다.
- **v5.14.159**: GLAPS 수정양식 업로드 시 기존 ID 행은 DB 값과 비교해 실제 변경이 있는 행만 update하고, 값이 같은 행은 `업로드수정` 이력 오염 없이 건너뛰도록 했다.
- **v5.14.158**: GLAPS 수정양식의 운송경로/항목매핑 `매칭상태` 다운로드 값을 `확정 / 조정필요 / 코드없음`으로 바꾸고, 설명서에 행 삭제는 삭제로 처리하지 않고 `삭제(Y)` 값만 삭제로 본다는 규칙을 명시했다.
- **v5.14.157**: AI 어시스턴트 화면의 버전/소개/가이드/빠른질문을 `aiAssistantMeta` 함수로 통합하고, 낡은 이미지·NAS 원본 파싱 예시를 제거했다. 채팅 API는 웹 첨부문서 `web_attachment` 색인과 Supabase DB 기준으로 출처를 표시하며, 최근 웹자료 조회와 KST 기준시각 주입을 보강했다.
- **v5.14.156**: GLAPS 수정양식 작업 시트의 제목/설명/헤더 색상을 실제 컬럼 범위에만 적용하고, 고정행 아래 A4를 활성 셀로 지정해 엑셀이 M열 이후 빈 영역에서 열리는 문제를 보정했다.
## VERIFICATION
- `cd web; npm run lint -- app/api/branches/asan/dispatch/route.js constants/siteLayout.js`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
- `cd web; npm run lint -- constants/siteLayout.js`: 통과
- Browser local check (`http://localhost:3010/services`): 기존 `물류 및 제조 서비스` 문구 없음, 새 `맞춤형 물류 서비스` 문구 확인.
- `cd web; npm run lint -- components/Business.js`: 통과
- Browser local check (`http://localhost:3010/services`): `주요 사업 및 운영 현황` 제목의 `::before` content/display가 `none`으로 확인됨.
- `cd web; npm run lint -- components/Header.js`: 통과. 기존 `no-img-element` 경고 3건만 확인.
- Browser local check (`http://localhost:3010/intro`): 공개 헤더가 `인트라넷` 단일 CTA만 노출하고 `로그인` 중복 없음.
- `cd web; npm run lint`: 통과
- `cd web; npm run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
- Browser local check (`http://localhost:3010`): `/intro`, `/contact`, `/employees/branches/asan`, `/employees/safe-freight` 진입 및 콘솔 오류 없음. 캡처 저장은 브라우저 런타임 타임아웃으로 생략.
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanDispatchDetailLines.test.mjs`: 42개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/dispatch/change-events/route.js"`: 통과
- `cd web; npm run build`: 통과
- `python -m py_compile docker/els-backend/app_core.py`(Codex 번들 Python): 통과
- `npm.cmd run build`: 통과. NODE_TLS_REJECT_UNAUTHORIZED 경고만 확인.
- Supabase migration `asan_dispatch_change_events`: 적용 완료

## IN-PROGRESS
- GLAPS 다음 단계: 상세배차/배차변동내역을 GLAPS 업로드 전용 컬럼 순서로 출력하고, 실제 확정일 테스트 데이터로 변동 이벤트 감지 결과를 검수한다.
- 배차판 WEB 전용 셀 DB 적용 대기: `web/supabase_sql/20260522_asan_dispatch_web_cells.sql` 적용 후 `cd web; node scripts/backfill-asan-dispatch-web-cells.mjs` 1회 실행.
- 행사일정 DB 적용 대기: `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- 매크로/배열수식 포함 배차판 `.xlsm` 원본 수정 시 `openpyxl.save()` 금지. 백업 후 Excel COM 자동화 또는 OOXML 엔트리 패치 후 Excel 열기 검증까지 수행.
- GLAPS 마스터 `.xlsx` 수정 시에도 백업을 먼저 만들고, ELS 별칭/입력칸 보강과 DB 활성 버전 재반영 결과를 문서에 남긴다.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
