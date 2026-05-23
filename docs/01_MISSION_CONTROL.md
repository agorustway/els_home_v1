# ELS MISSION CONTROL (v5.14.148 / APK v5.11.29)

> 최신 업데이트: GLAPS 상세배차 최종 업로드용 코드 도출을 `오더구분/화주사/출발지/작업지/도착지/운송사 BP/컨샤이니`까지 확장하고, NAS `GLAPS_마스터코드.xlsx` ELS 입력칸을 보강해 활성 원장을 재반영했다.

## CURRENT STATUS
- **웹 버전**: v5.14.148
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **GLAPS 목표**: 배차판 상세라인에서 `상차지 + 경유지(ELS/작업지) + 하차지(선적)`으로 기존 GLAPS 운송경로코드를 도출하고, 최종 업로드용 코드 컬럼을 검수한다.
- **GLAPS 활성 원장**: `952c67b5-fefa-45cc-b97a-934f885e684b` / 8개 시트 / 운송경로 540건 / 항목매핑 2,923건 / 원본행 1,177건.
- **GLAPS NAS 백업**: `/아산지점/A_운송실무/GLAPS_마스터코드_backup_20260523_190603.xlsx`

## GLAPS OPERATING NOTES
- `GLAPS코드` 화면은 아산 배차판 내부 탭으로 유지한다. 상위 메뉴로 올리지 않는다.
- GLAPS 업로드용 코드는 새로 만들지 않는다. 마스터 원장의 기존 코드를 도출하기 위해 ELS 별칭만 보강한다.
- 운송사코드는 `운송사코드` 시트의 `GLAPS 코드`가 아니라 `BP` 컬럼을 사용한다. 기본 `ELS`는 `B000005273`.
- 운송서비스코드는 아직 미확정이므로 상세배차 최종 컬럼에 공란으로 둔다.
- 이번 마스터 보강 확인값: `ELS -> B000005273`, `CMA -> CMA`, `MAE -> MAE`, `40HC -> 4510`, `INKAT/USMOB -> 동일 코드`, `KIN -> GA0196`, `HMMA -> UH03`.
- 상세배차 후미 최종 컬럼: `오더구분코드`, `화주사코드`, `반출지(출발)코드`, `작업지(하차지)코드`, `반입지(도착)코드`, `운송서비스코드`, `운송사코드`, `컨샤이니`.
- 화주사코드는 운송경로 원장 기준으로 `글로비스KD외/글로비스 -> 현대글로비스주식회사(KR10)`, `모비스/모비스AS -> 현대모비스`를 매칭한다.
- 상세배차 수정필요 필터는 상차지, 운송경로, 오더구분, 화주사, 경로세부코드, 포트, 라인, 타입, 운송사, 컨샤이니 항목별로 토글한다.
- 상차지/운송사코드 입력칸은 datalist 직접입력과 키보드 방향키 이동을 지원한다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 + GLAPS 원장 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡 |
| Android 드라이버 앱 | 정상 | APK v5.11.29 빌드 완료 |

## RECENT CHANGES
- **v5.14.148**: NAS `GLAPS_마스터코드.xlsx`에 선사/포트/POD/컨테이너/운송경로 화주/컨샤이니 ELS 입력칸을 보강하고 Supabase 활성 원장을 `952c67b5-fefa-45cc-b97a-934f885e684b`로 재반영했다. 상세배차는 운송사 BP를 맨 뒤 최종 컬럼으로 옮기고, 오더구분/화주사/경로세부코드/컨샤이니 도출 및 항목별 필터를 추가했다.
- **v5.14.147**: GLAPS 코드 원장이 `ELS코드`, `ELS코드1~3`을 GLAPS 기본 코드 별칭으로 파싱하고, 상차지/운송사코드 datalist 입력과 수정필요 필터를 추가했다.
- **v5.14.146**: 상세배차 `포트코드`는 GLAPS 항목매핑이 없으면 원본 배차판 `포트` 값을 그대로 표시한다.
- **v5.14.145**: 상세배차 운송경로 도출은 GLAPS 포트코드 후보까지 조회하고, `40HC -> 4510` 타입코드를 표시한다.
- **v5.14.143-144**: GLAPS코드를 배차판 내부 보기로 내리고, 전 시트 원본행/항목매핑을 운영 DB에 보관한다.
- **v5.14.140**: 배차판 원본 `.xlsm`에서 WEB 전용 BKG/TARGET/비고 컬럼을 분리했다.

## VERIFICATION
- `node --test web/tests/glapsMasterData.test.mjs web/tests/asanDispatchDetailLines.test.mjs web/tests/asanDashboardView.test.mjs`: 45개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "utils/glapsMasterData.mjs" "utils/asanDispatchDetailLines.mjs" "tests/glapsMasterData.test.mjs" "tests/asanDispatchDetailLines.test.mjs" "tests/asanDashboardView.test.mjs"`: 통과
- `npm.cmd run build`: 통과. 빌드 후 비치명 원격 fetch `ECONNRESET` 로그가 있었지만 Next 빌드는 성공했다.
- `http://127.0.0.1:3000/employees/branches/asan`: 인증 리다이렉트 후 로그인 페이지 HTTP 200 확인

## IN-PROGRESS
- GLAPS 다음 단계: 상세배차 최종 컬럼 순서대로 엑셀 업로드 양식 출력과 업로드 전 검증을 구현한다.
- 배차판 WEB 전용 셀 DB 적용 대기: `web/supabase_sql/20260522_asan_dispatch_web_cells.sql` 적용 후 `cd web; node scripts/backfill-asan-dispatch-web-cells.mjs` 1회 실행.
- 행사일정 DB 적용 대기: `web/supabase_sql/20260520_intranet_event_calendar.sql`을 Supabase SQL Editor에 적용.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- 매크로/배열수식 포함 배차판 `.xlsm` 원본 수정 시 `openpyxl.save()` 금지. 백업 후 Excel COM 자동화 또는 OOXML 엔트리 패치 후 Excel 열기 검증까지 수행.
- GLAPS 마스터 `.xlsx` 수정 시에도 백업을 먼저 만들고, ELS 별칭/입력칸 보강과 DB 활성 버전 재반영 결과를 문서에 남긴다.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
