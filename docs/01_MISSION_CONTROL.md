# ELS MISSION CONTROL (v5.14.276 / APK v5.11.29)

> 최신 업데이트: 상세배차/배차변동 시간값을 HH:MM으로 정규화하고 엑셀 시간 서식을 적용했다.

## CURRENT STATUS
- **웹 버전**: v5.14.276
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **아산 실적관리**: 종합실적/월간실적/연간실적/구간단가 탭 구조. 연간 원장은 삭제 없이 누적하고 current snapshot만 전환한다.
- **GLAPS 활성 원장**: `6724943a-5c6c-416e-bab0-bbac487b8c4c` / 8개 시트 / 운송경로 541건 / 항목매핑 2,249건 / 원본행 1,177건.
- **GLAPS NAS 백업**: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | public RLS/GRANT 보강 완료. 내부 데이터 API는 인증 확인 후 service role 경유 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡 |
| Android 드라이버 앱 | 정상 | APK v5.11.29 빌드 완료 |

## ASAN PERFORMANCE NOTES
- 연간실적 기본 파일: `/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`, 시트 `합계`.
- 연간실적은 2015~2025 원장, 월간실적은 월별 마감자료 확장 원장이다. 2026년 이후 파일을 별도로 추가해도 기존 연간 데이터는 DB에 누적 보존한다.
- `구간단가`는 월간 마감자료 current 원장만 사용한다. 연간 원장 36만 행은 DB 부하와 컬럼 신뢰도 문제로 합산하지 않는다.
- 구간단가 조회 범위는 `전체/연도별/월별`이며, 제목열 클릭 정렬과 컬럼 제목열 내부 다중 선택 필터를 제공한다.
- 구간단가 표시/집계 조건은 숨김 드롭존으로 통합한다. 제목열을 숨김 영역에 드롭하면 해당 항목은 집계 키에서 빠지고 같은 청구·하불 금액표가 다시 합쳐진다.
- 구간단가 표는 열 드래그 이동, P1/P2 레이아웃 저장·로드, 현재 표시 기준 엑셀 CSV 다운로드, 새로고침을 지원한다.
- 구간단가 묶음 기준은 `청구/하불 금액 + 매출, 지역, 작업지, 운송사, 구분, 픽업, 청구픽업, 선적, TYPE, 청구처, 하불처`다. 금액 검색은 천단위 구분 없이 숫자만 입력해도 찾을 수 있다.
- 구간단가 TYPE처럼 영문이 포함된 검색어는 금액 숫자 보조검색을 적용하지 않아 `20RF`가 기간 `2026`의 `20`에 과매칭되지 않게 한다.
- 구간단가 API는 dashboard snapshot을 만들지 않고 `asan_monthly_route_unit_amount_payload` RPC를 우선 사용한다. 실패 시 월간 current 행을 1000행 단위로만 읽는 JS fallback을 사용한다.
- 테이블 검색은 `,` 또는 `;`로 조건을 나눌 수 있고, `하나라도 포함/모두 포함` 토글로 OR/AND를 선택한다.
- 페이지 로딩 문구와 폰트는 아산 하위 페이지에서 동일 톤으로 유지한다.

## GLAPS OPERATING NOTES
- `GLAPS코드` 화면은 아산 배차판 내부 탭으로 유지한다. 상위 메뉴로 올리지 않는다.
- 운송사코드는 `운송사코드` 시트의 `BP` 컬럼을 사용한다. 기본 `ELS`는 `B000005273`.
- 운송서비스코드는 배차판 `구분`으로 도출한다. 기본값은 `수출=5010001`, `수출(보관)=5010002`, `수입=5020001`, `수입(보관)=5020002`, `반품=311101`, `내수/석회석=6032001`.
- 운송경로 매칭키는 `화주사코드 + 상차지 + 경유지(ELS) + 하차지(선적)`이다. 같은 상차/경유/하차라도 화주사코드가 다르면 다른 GLAPS 운송경로로 본다.
- 포트코드는 동일 ELS 매치값에 여러 GLAPS코드를 둘 수 있다. 항목매핑 UNIQUE는 `glaps_code`까지 포함한다.
- 운영 DB 항목매핑 UNIQUE는 `branch_id, version_id, alias_type, source_name, route_code, glaps_code` 단일 제약이다.
- GLAPS 중복 판정/병합 기준은 운송경로=`운송경로코드`, 항목매핑=`최종코드(BP)` 단독 반복이다. 상차지/하차지/공장/매핑항목 등 다른 컬럼은 중복 판정에서 제외한다.
- GLAPS `운송경로코드`와 `최종코드(BP)`는 수정 가능한 핵심 키값이므로 화면/수정양식에서 초록 키 칸으로 표시한다.
- GLAPS 요약 카드는 운송경로 상태/원본시트로 이동하는 필터 버튼이며, `검수메모`는 매칭 키가 아니라 출처·용도·기본값 확인용 메모다.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`, `수정일시`.
- GLAPS 직접수정은 `updated_by = web:<email>`, 수정양식 업로드는 `template_upload:<email>`, 마스터 반영은 `master:<email>`로 구분한다.
- GLAPS 수정양식은 `설명서`, `운송경로_수정양식`, `항목매핑_수정양식` 시트를 함께 내려받는다. 삭제는 행 삭제가 아니라 `삭제(Y)` 입력으로만 처리한다.
- GLAPS 수정양식 업로드 파서는 안내문처럼 여러 헤더명이 한 셀에 들어간 행을 헤더로 보지 않는다. UUID가 운송경로 필드 전체로 복제된 오염 행은 저장 전에 버린다.
- GLAPS 항목매핑 수정양식 업로드는 같은 `매핑항목+ELS 매치코드+운송경로코드+최종코드(BP)`가 기존 DB에 있으면 신규 insert 대신 기존행 업데이트로 처리하고, 같은 파일 안의 반복 키는 한 행으로 병합한다.
- GLAPS 업로드 신규행/병합행은 ID가 비어 있으면 `id` 필드 자체를 제거해 DB 기본 UUID 생성에 맡긴다.
- `WEB수정` 행은 업로드 변경/삭제에서 제외하고, 마스터 업로드/NAS 반영 시 새 활성 버전으로 보존한다.
- GLAPS 마스터 반영은 새 버전을 비활성으로 만든 뒤 모든 insert가 성공한 경우에만 active 전환한다. 같은 원장 행이 중복 파싱되면 insert 전에 정리하고 결과 메시지에 `원장 중복행 N건 정리`로 알린다.
- 상세배차/배차변동내역은 `/api/branches/asan/glaps/master?mode=lookup`의 경량 자료만 사용한다.
- GLAPS코드 표는 현재 필터 결과를 일괄선택하고, 선택행에 상태/코드/명칭/메모 등 단일 항목을 일괄수정할 수 있다.

## ASAN DISPATCH NOTES
- 아산 예하페이지 우측 작업 버튼 순서는 `엑셀 -> 설정 -> 새로고침 -> NAS 동기화`로 고정한다.
- NAS 동기화 버튼은 수동 요청 시 글로비스/모비스 모두 1순위 작업일을 먼저 반영한다. 1순위는 오늘 시트, 없으면 오늘 이후 첫 작업일, 그래도 없으면 가장 최근 과거 작업일이다.
- 1순위 완료 신호(`quick_done`)를 받으면 웹은 즉시 새로고침한다. 전/후 작업일과 나머지 날짜는 백그라운드에서 순차 반영한다.
- 상세배차/배차변동 다운로드는 기존 우리 기준 시트와 별도로 `GLAPS_업로드` 시트를 추가한다.
- 상세배차/배차변동은 `업체명` 다음에 `시간` 컬럼을 표시한다. 지역 배차칸 메모가 `13 14 15`면 단일 업체 수량에 순서 배정하고, `08/13` 같은 정시값은 `08:00/13:00`으로 표시·다운로드한다.
- 배차 원장 API는 `mode=meta/date/full`을 지원한다. 화면은 날짜 메타와 선택일 상세를 먼저 표시하고 전체 원장은 백그라운드에서 채운다.
- 선적관리 기본 레이아웃은 사용자 `asan_shipping_default`가 없을 때만 최병훈 `asan_shipping_preset_1`을 fallback으로 적용한다. 기존 사용자 default/P1/P2는 덮어쓰지 않는다.
- 배차변동내역은 지역 배차칸 수량 변화와 행 추가/삭제만 추가·삭제로 기록한다. Nomi/특이사항, BKG1~3/TARGET VESSEL/비고, GLAPS 파생코드 변화는 변동 행을 만들지 않는다.
- 통합현황에서 통합확정이 없더라도 glovis/mobis 중 확정된 원본 구분이 있으면 해당 구분만 분리해 변동내역을 동기화하고 통합 변동탭에 노출한다.
- 배차변동 비교의 동일행 매칭은 `작업일자/구분/화주/상차지/작업지/하차지/고객사/포트/라인/타입/업체명/시간` 기준이다. 같은 운송조건이어도 업체·작업지·시간이 다르면 변경 또는 삭제/추가로 본다.
- 미확인 add/delete가 같은 항목·같은 수량으로 상쇄되면 숨긴다. 확인완료된 변동은 상쇄되어도 노출을 유지한다.
- 배차확정 후 `BKG확정`은 확정 스냅샷 또는 WEB 수기값으로 고정한다. 원본 BKG1~3/TARGET VESSEL/비고가 바뀌면 상세/변동 표의 원본칸만 최신값으로 보이고 memo 이력과 붉은 표시를 남긴다.
- 배차변동 sync payload는 `changeSchemaVersion=3` 이상만 반영한다. 구버전으로 열린 탭이 시간 없는 payload를 보내면 기존 변동 이벤트를 건드리지 않는다.
- 상세배차/배차변동 표의 `상차지`는 6글자 수준 폭에서 말줄임 표시한다. 표 헤더는 목록형 다중 선택 필터를 제공하고, 포트코드 후보가 2개 이상이면 해당 셀을 노란색으로 표시한다.
- 배차판/상세배차/배차변동 공통 테이블 스크롤 높이는 `clamp(360px, calc(100dvh - 300px), 980px)` 기준으로 화면 하단 여백을 최소화한다.
- 글로비스 원본 `/아산지점/A_운송실무/2026년_배차-일일배차(글로비스KD외).xlsm`의 `셀맥`은 `셀맥(KIA)오성`으로 정리했으며, 매크로 보존을 위해 OOXML 직접 패치만 사용한다.

## SECURITY NOTES
- Supabase `public` 신규 객체는 `postgres` 기본권한에서 anon/authenticated 자동 GRANT를 제거했다. `supabase_admin` 기본권한은 SQL 권한 부족으로 Dashboard Data API 설정에서 별도 확인한다.
- 내부 연락처/자료/작업지/협력사/운전원 API는 사용자 확인 후 service role로 DB를 처리한다. anon은 내부 연락처·자료·작업지 SELECT 권한이 없다.
- 차량관제 `vehicle_trips/locations/logs`는 service role 전용 DB 접근으로 제한하고, 웹/앱은 Next API 경유로만 처리한다.
- 디버그 모드는 유지한다. `?debug=true`로 심은 `__debug_mode` 쿠키도 서버 API auth mock에서 인정한다.

## RECENT CHANGES
- **v5.14.276**: 상세배차/배차변동 시간값을 HH:MM으로 정규화하고, 현재화면/GLAPS 업로드 엑셀 다운로드의 시간 컬럼을 `hh:mm` 서식으로 저장한다.
- **v5.14.275**: 차량관제 테이블의 public permissive RLS와 anon/authenticated 직접 grant를 제거했다. 차량관제 API 조회 라우트는 service role client로 전환했다.
- **v5.14.274**: 운영 웹 스모크에서 디버그 페이지는 열리지만 내부 데이터 API가 401로 떨어지는 흐름을 확인했다. 서버 Supabase client가 `__debug_mode` 쿠키도 읽도록 보정했다.
- **v5.14.273**: Supabase public schema RLS를 켜고 내부 데이터 테이블의 anon 접근과 authenticated DML을 차단했다. 공개 웹진/식단/긴급공지 SELECT는 유지하고, 내부 API는 인증 후 service role 경유로 조정했다.
- **v5.14.272**: 상세배차/배차변동내역 표 헤더에 목록형 다중 선택 필터를 추가했다. 헤더 목록은 체크박스로 여러 값을 동시에 고를 수 있고, 바깥을 클릭하면 닫힌다.
- **운영데이터 2026-05-28**: 글로비스 원본 `.xlsm`과 WEB 배차판 DB의 `셀맥` 값을 `셀맥(KIA)오성`으로 정리했다. 원본 백업은 NAS 같은 폴더의 `.backup-cellmac-20260528-120506Z.xlsm`.
- **v5.14.271**: 배차판, 상세배차내역, 배차변동내역 공통 테이블 스크롤 높이를 키워 데스크톱 화면 하단의 빈 공간을 줄이고 더 많은 행을 한 번에 보이게 했다.
## VERIFICATION
- Supabase Advisor: 차량관제 permissive policy 경고 해소. 남은 WARN은 Auth leaked password protection Dashboard 설정 1건.
- 운영 웹 스모크: `/`, `/employees/ask?debug=true`, `/api/board?type=webzine` 200. 내부 데이터 API는 비로그인 기준 401로 보호됨을 확인.
- Supabase Advisor: `RLS Disabled in Public`, `Function Search Path Mutable`, `Extension in Public`, public `SECURITY DEFINER` RPC 경고 해소. 잔여는 Auth leaked password dashboard 설정, 의도적 no-policy 테이블.
- DB 권한 검증: anon은 내부/외부 연락처 SELECT 불가, 공개 `posts/weekly_menus/emergency_notices` SELECT만 가능. route unit RPC는 service_role만 실행 가능.
- `cd web; npx eslint ...변경 API 라우트`: 통과. `cd web; npm run build`: 통과.
- 글로비스 원본 `.xlsm` OOXML 패치 검증: `vbaProject.bin` SHA-256 보존, `셀맥` 잔여 0건, 계산 설정 `auto/fullCalcOnLoad/forceFullCalc/calcOnSave` 적용.
- Supabase 검증: `branch_dispatch` 6행, `branch_dispatch_web_cells` 3행, `branch_dispatch_web_cell_history` 3행 업데이트. `셀맥(KIA)오성` 외 잔여 `셀맥` 0건.
- 최근 코드 변경 검증 내역은 `docs/02_DEVELOPMENT_LOG.md` 각 항목 참조.

## IN-PROGRESS
- 구간단가는 월간 금액표 RPC 운영으로 전환했다. 운영 빌드 후 웹 `구간단가` 탭에서 최신 월 기본 조회와 전체 조회 체감 속도를 확인한다.
- GLAPS 다음 단계: 실제 GLAPS 업로드 파일로 샘플 검증 후 `GLAPS_컨테이너배차관리` 후속 입력/수정 양식 설계.
- 배차판 다음 최적화 후보: DB에 날짜별 유효행 요약을 저장해 `mode=meta` 서버 내부 원장 스캔까지 축소.
- 행사일정 DB 적용 대기: `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- PowerShell에서 `web\app\(main)\...` 경로는 반드시 따옴표로 감싼다.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- 매크로/배열수식 포함 `.xlsm` 원본 수정 시 `openpyxl.save()` 금지.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
