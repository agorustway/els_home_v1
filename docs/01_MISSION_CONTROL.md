# ELS MISSION CONTROL (v5.14.257 / APK v5.11.29)

> 최신 업데이트: 구간단가 제목열 필터 목록이 바깥 클릭 또는 ESC 입력으로 닫히게 했다.

## CURRENT STATUS
- **웹 버전**: v5.14.257
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **아산 실적관리**: 종합실적/월간실적/연간실적/구간단가 탭 구조. 연간 원장은 삭제 없이 누적하고 current snapshot만 전환한다.
- **GLAPS 활성 원장**: `6724943a-5c6c-416e-bab0-bbac487b8c4c` / 8개 시트 / 운송경로 540건 / 항목매핑 2,923건 / 원본행 1,177건.
- **GLAPS NAS 백업**: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 + GLAPS 원장 |
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
- 포트코드는 동일 ELS 매치값에 여러 GLAPS코드를 둘 수 있다. 항목매핑 UNIQUE는 `glaps_code`까지 포함한다.
- GLAPS 중복 판정/병합 기준은 운송경로=`운송경로코드`, 항목매핑=`최종코드(BP)` 단독 반복이다. 상차지/하차지/공장/매핑항목 등 다른 컬럼은 중복 판정에서 제외한다.
- GLAPS `운송경로코드`와 `최종코드(BP)`는 수정 가능한 핵심 키값이므로 화면/수정양식에서 초록 키 칸으로 표시한다.
- GLAPS 요약 카드는 운송경로 상태/원본시트로 이동하는 필터 버튼이며, `검수메모`는 매칭 키가 아니라 출처·용도·기본값 확인용 메모다.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`, `수정일시`.
- GLAPS 직접수정은 `updated_by = web:<email>`, 수정양식 업로드는 `template_upload:<email>`, 마스터 반영은 `master:<email>`로 구분한다.
- GLAPS 수정양식은 `설명서`, `운송경로_수정양식`, `항목매핑_수정양식` 시트를 함께 내려받는다. 삭제는 행 삭제가 아니라 `삭제(Y)` 입력으로만 처리한다.
- `WEB수정` 행은 업로드 변경/삭제에서 제외하고, 마스터 업로드/NAS 반영 시 새 활성 버전으로 보존한다.
- GLAPS 마스터 반영은 새 버전을 비활성으로 만든 뒤 모든 insert가 성공한 경우에만 active 전환한다. 같은 원장 행이 중복 파싱되면 insert 전에 정리하고 결과 메시지에 `원장 중복행 N건 정리`로 알린다.
- 상세배차/배차변동내역은 `/api/branches/asan/glaps/master?mode=lookup`의 경량 자료만 사용한다.

## ASAN DISPATCH NOTES
- 아산 예하페이지 우측 작업 버튼 순서는 `엑셀 -> 설정 -> 새로고침 -> NAS 동기화`로 고정한다.
- NAS 동기화 버튼은 수동 요청 시 글로비스/모비스 모두 1순위 작업일을 먼저 반영한다. 1순위는 오늘 시트, 없으면 오늘 이후 첫 작업일, 그래도 없으면 가장 최근 과거 작업일이다.
- 1순위 완료 신호(`quick_done`)를 받으면 웹은 즉시 새로고침한다. 전/후 작업일과 나머지 날짜는 백그라운드에서 순차 반영한다.
- 상세배차/배차변동 다운로드는 기존 우리 기준 시트와 별도로 `GLAPS_업로드` 시트를 추가한다.
- 배차 원장 API는 `mode=meta/date/full`을 지원한다. 화면은 날짜 메타와 선택일 상세를 먼저 표시하고 전체 원장은 백그라운드에서 채운다.
- 선적관리 기본 레이아웃은 사용자 `asan_shipping_default`가 없을 때만 최병훈 `asan_shipping_preset_1`을 fallback으로 적용한다. 기존 사용자 default/P1/P2는 덮어쓰지 않는다.
- 배차변동내역은 지역 배차칸 수량 변화와 행 추가/삭제만 추가·삭제로 기록한다. Nomi/특이사항, BKG1~3/TARGET VESSEL/비고, GLAPS 파생코드 변화는 변동 행을 만들지 않는다.
- 미확인 add/delete가 같은 항목·같은 수량으로 상쇄되면 숨긴다. 확인완료된 변동은 상쇄되어도 노출을 유지한다.
- 배차확정 후 `BKG확정`은 확정 스냅샷 또는 WEB 수기값으로 고정한다. 원본 BKG1~3/TARGET VESSEL/비고가 바뀌면 상세/변동 표의 원본칸만 최신값으로 보이고 memo 이력과 붉은 표시를 남긴다.
- 배차변동 sync payload는 `changeSchemaVersion=2` 이상만 반영한다. 구버전으로 열린 탭이 transportRemark 없는 payload를 보내면 기존 변동 이벤트를 건드리지 않는다.

## RECENT CHANGES
- **v5.14.257**: 구간단가 제목열 필터 팝오버는 선택값을 유지한 채 다른 영역 클릭 또는 ESC 입력 시 닫히도록 했다.
- **v5.14.256**: 구간단가 전역 검색에서 영문 포함 조건의 숫자 보조검색을 끄고, 표 헤더를 선적관리형 진한 남색으로 정리했다. 청구금액은 파란색, 하불금액은 빨간색으로 표시한다.
- **v5.14.255**: 구간단가 컬럼 필터를 다중 선택으로 전환했다. 같은 컬럼 안에서는 선택값을 OR로 묶고, 서로 다른 컬럼 조건은 AND로 적용해 지역/TYPE/거래처 등을 동시에 좁혀 볼 수 있게 했다.
- **v5.14.254**: 선적관리 default prefs 미보유 사용자에게만 최병훈 P1을 fallback으로 적용한다. 엑셀/프리셋에 섞인 `COL1`, `COLS2`류 익명 컬럼은 헤더 정규화 단계에서 제거해 모바일 P1 로드에도 표시되지 않게 했다.
- **v5.14.253**: GLAPS 요약 카드를 운송경로 상태/원본시트 필터 버튼으로 바꾸고, 매핑항목·검수메모 용도를 화면/수정양식 설명서에 추가했다. `운송경로코드`와 `최종코드(BP)`는 회색 보호칸 대신 초록 키값 컬럼으로 표시하고, NAS 마스터 반영/업로드는 회색 레거시 버튼 안쪽 패널로 접었다.
- **v5.14.252**: 구간단가의 별도 `묶음 항목` 바를 제거하고 숨김 드롭존으로 집계 제외를 통합했다. 필터 입력칸은 버튼 높이에 맞춘 인라인형으로 줄이고 도구 버튼과 간격을 정리했다.
- **v5.14.251**: 선적관리 일별 화면은 100건 더보기 없이 전체 행을 기본 표시한다. 배차확정된 상세는 BKG확정/원본 BKG/포트코드까지 입력 잠금하고, 확인완료된 변동내역 행은 회색 배경으로 잠금 상태를 표시한다.
- **v5.14.250**: 구간단가 표를 선적관리 리스트 형식으로 정리했다. 숨김 드롭존/열 이동/P1·P2 저장·로드/엑셀/새로고침을 제공하고, 숨긴 묶음 열은 집계 기준에서도 제외한다.
- **v5.14.249**: GLAPS 일반 목록의 빨간 중복 강조를 제거하고, 중복검출 모드에서만 `운송경로코드`/`최종코드(BP)` 중복 그룹을 표시한다.
- **v5.14.248**: 배차변동 비교에서 Nomi/특이사항을 제외하고, 미확인 추가/삭제 순증감 0쌍은 자동 숨김 처리했다. 2026-05-27 active 변동 48건 중 40건을 neutralized 이력으로 비활성화해 8건만 남겼다.
- **v5.14.247**: GLAPS 중복검출/병합을 코드 단독 기준으로 정정했다. 운송경로는 `운송경로코드`, 항목매핑은 `최종코드(BP)`만 반복 여부를 본다.
- **v5.14.246**: 구간단가에 `묶음 항목` 토글을 추가해 매출/지역/작업지/운송사/구분/픽업/TYPE/거래처 등을 집계 기준에서 빼고 금액표를 압축할 수 있게 했다.
- **v5.14.245**: 구간단가의 별도 `필터 목록` 패널을 제거하고, 각 컬럼 제목열 안의 필터 버튼에서 조건 목록을 바로 선택하게 했다.

## VERIFICATION
- `cd web; node --test --test-name-pattern "선적관리 액션바|선적관리 숨김 컬럼|선적관리 레이아웃|선적관리 사용자 prefs" tests\asanShippingFlow.test.mjs`: 4개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/user/prefs/route.js" "utils/asanShippingView.mjs" "tests/asanShippingFlow.test.mjs"`: 통과
- `cd web; node --test tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- `cd web; node --test tests\asanDashboardView.test.mjs tests\asanDispatchDetailLines.test.mjs`: 51개 통과
- `cd web; npx eslint "app/api/branches/asan/dispatch/change-events/route.js" "utils/asanDispatchChangeEvents.mjs" "tests/asanDashboardView.test.mjs" "tests/asanDispatchDetailLines.test.mjs"`: 통과
- `cd web; node --test tests\glapsDuplicateGroups.test.mjs tests\glapsMasterData.test.mjs tests\asanDashboardView.test.mjs`: 47개 통과
- `cd web; npx eslint "app/(main)/employees/branches/asan/AsanGlapsMaster.js" "app/api/branches/asan/glaps/master/route.js" "utils/glapsDuplicateGroups.mjs" "tests/glapsDuplicateGroups.test.mjs"`: 통과
- `cd web; npm run build`: 통과

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
