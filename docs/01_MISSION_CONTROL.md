# ELS MISSION CONTROL (v5.14.233 / APK v5.11.29)

> 최신 업데이트: 아산 연간실적에 `구간단가` 분석 탭을 추가했다. 마감월 기준으로 `픽업-지역-작업지-하차 + 매출열 + 청구처/지급처/TYPE` 단가를 기간별로 추적한다.

## CURRENT STATUS
- **웹 버전**: v5.14.233
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
- 연간실적 `구간단가`는 `전체/연도별/월별` 범위와 마감월 기준으로 산출한다. 구간 조건은 `픽업-지역-작업지-하차`, 표시 기준은 `매출열/청구처/지급처/TYPE/청구/하불/건당단가`.
- `web/supabase_sql/20260527_asan_annual_route_unit_price_rpc.sql`은 DB 선집계 RPC다. Supabase 앱 재인증 전에는 웹이 snapshot_id만 필터링해 읽고 JS에서 범위 집계한 뒤 dashboard snapshot 캐시를 사용한다.
- 테이블 검색은 `,` 또는 `;`로 조건을 나눌 수 있고, `하나라도 포함/모두 포함` 토글로 OR/AND를 선택한다.
- 페이지 로딩 문구와 폰트는 아산 하위 페이지에서 동일 톤으로 유지한다.

## GLAPS OPERATING NOTES
- `GLAPS코드` 화면은 아산 배차판 내부 탭으로 유지한다. 상위 메뉴로 올리지 않는다.
- 운송사코드는 `운송사코드` 시트의 `BP` 컬럼을 사용한다. 기본 `ELS`는 `B000005273`.
- 운송서비스코드는 배차판 `구분`으로 도출한다. 기본값은 `수출=5010001`, `수출(보관)=5010002`, `수입=5020001`, `수입(보관)=5020002`, `반품=311101`, `내수/석회석=6032001`.
- 포트코드는 동일 ELS 매치값에 여러 GLAPS코드를 둘 수 있다. 항목매핑 UNIQUE는 `glaps_code`까지 포함한다.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`, `수정일시`.
- GLAPS 직접수정은 `updated_by = web:<email>`, 수정양식 업로드는 `template_upload:<email>`, 마스터 반영은 `master:<email>`로 구분한다.
- GLAPS 수정양식은 `설명서`, `운송경로_수정양식`, `항목매핑_수정양식` 시트를 함께 내려받는다. 삭제는 행 삭제가 아니라 `삭제(Y)` 입력으로만 처리한다.
- `WEB수정` 행은 업로드 변경/삭제에서 제외하고, 마스터 업로드/NAS 반영 시 새 활성 버전으로 보존한다.
- 상세배차/배차변동내역은 `/api/branches/asan/glaps/master?mode=lookup`의 경량 자료만 사용한다.

## ASAN DISPATCH NOTES
- 아산 예하페이지 우측 작업 버튼 순서는 `엑셀 -> 설정 -> 새로고침 -> NAS 동기화`로 고정한다.
- NAS 동기화 버튼은 수동 요청 시 글로비스/모비스 모두 1순위 작업일을 먼저 반영한다. 1순위는 오늘 시트, 없으면 오늘 이후 첫 작업일, 그래도 없으면 가장 최근 과거 작업일이다.
- 1순위 완료 신호(`quick_done`)를 받으면 웹은 즉시 새로고침한다. 전/후 작업일과 나머지 날짜는 백그라운드에서 순차 반영한다.
- 상세배차/배차변동 다운로드는 기존 우리 기준 시트와 별도로 `GLAPS_업로드` 시트를 추가한다.
- 배차 원장 API는 `mode=meta/date/full`을 지원한다. 화면은 날짜 메타와 선택일 상세를 먼저 표시하고 전체 원장은 백그라운드에서 채운다.

## RECENT CHANGES
- **v5.14.233**: 연간실적 옆에 `구간단가` 탭을 추가하고, 마감월 기준 구간/매출열/청구처/지급처/TYPE별 청구·하불·건당단가와 기간별 변동 차트를 구성했다.
- **v5.14.232**: GLAPS 항목매핑에서 같은 `매핑항목+운송경로코드+최종코드(BP)` 행을 빨간색 미병합 중복으로 표시하고, 병합 시 다중 별칭으로 인식하게 했다.
- **v5.14.231**: 모바일 배차판 합계바에서 데스크탑용 `summaryRight` flex-basis가 세로 높이로 적용되어 생기던 큰 공백을 제거했다.
- **v5.14.230**: GLAPS 직접등록 중복/UNIQUE 오류 판정을 좁히고, 운송경로/항목매핑 중복·복수후보 필터와 포트 후보용 UNIQUE SQL을 추가했다.
- **v5.14.229**: 자동 배차판 동기화는 파일 mtime/size 안정화 후 수동 NAS 동기화와 같은 `1순위 작업일 -> 전/후 작업일 -> 나머지 날짜` 순서로 실행한다.
- **v5.14.228**: 아산 배차판/상세배차/배차변동/GLAPS코드 테이블 밀도와 헤더 톤을 정리했다.

## VERIFICATION
- `node --test web\tests\asanAnnualPerformance.test.mjs`: 12개 통과
- `cd web; npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/page.js" "app/api/branches/asan/performance/annual/route.js" "lib/asan-branch-db.js" "tests/asanAnnualPerformance.test.mjs"`: 통과
- 로컬 `http://localhost:3033/employees/branches/asan?debug=true`: `구간단가` 탭 진입, 전체 v2 snapshot 367,993건/160구간 표시 확인
- Supabase 앱 커넥터 재인증 필요: `asan_annual_route_unit_price_rpc` 마이그레이션 적용은 보류, 웹 fallback 경로는 코드에 포함.

## IN-PROGRESS
- Supabase 앱 재인증 후 `web/supabase_sql/20260527_asan_annual_route_unit_price_rpc.sql` 적용 여부 확인.
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
