# ELS MISSION CONTROL (v5.14.133 / APK v5.11.29)

> 최신 업데이트: 아산 배차판 엑셀 다운로드는 오더/배차 계열 컬럼을 숫자 셀로 쓰고, 데이터 영역 전체에 테두리를 적용합니다.

## CURRENT STATUS
- **웹 버전**: v5.14.133
- **동기화 정책**: 연간실적은 파일별 외부 Node importer `summary-only/snapshot import` 유지, 화면은 annual 현재 스냅샷 전체를 통합 조회. 월간실적은 `dataset_type=monthly` + `diff-current` 누적 원장으로 월별 파일을 순차 백그라운드 적재한다.
- **APK 버전**: v5.11.29
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 행사일정은 2026년 주요 공휴일/대체공휴일을 휴일 셀과 라벨로 표시한다.
  - 아산 배차판은 날짜 탭/기간 선택/WEB 전용 BKG·TARGET·비고 오버레이/히스토리를 운영하며, WEB 셀 조회는 Supabase 페이지 조회로 1000건 제한을 회피한다. 비고는 `source=web` 저장값만 화면/내보내기에 반영하고 엑셀 특이사항은 별도 컬럼으로 유지한다.
  - 아산 배차판 엑셀 다운로드는 `오더(계)/오더/계/수량/배차` 컬럼을 숫자 타입으로 저장하고 빈 셀까지 테두리를 입힌다.
  - 아산지점은 배차판 첫 진입, 실적관리 종합실적 시작, 동적 청크/프리패치, 필요한 탭만 mount하는 구조를 유지한다.
  - 종합실적 구성·차량 비교 카드는 `당사 / 협력사 비교` 제목으로 당사 직계약차량과 외부/타운송사를 같은 폭으로 비교한다.
  - 선적관리 컨테이너 조회는 NAS core 백그라운드 job과 대량 안정 모드로 운영하고, 날짜시간 표기는 `YYYY/MM/DD HH:mm`으로 통일한다.
  - 연간/월간/종합실적은 DB 누적 원장과 summary 재조회 구조를 유지하며, NAS가 끊겨도 저장된 DB 기준 화면을 유지한다.
  - NAS `els-bot`은 Selenium 워밍업, 자동 로그인 3회 하드캡, 보호모드 수동 정지 정책을 유지한다.
  - Android 운행종료는 TRIP_END/서버 완료 후 오버레이·GPS·activeTrip·UI만 정리하고 앱 화면은 유지한다.
  - Android 오버레이는 `SET_VISIBILITY`로 살아나도 타이머/GPS 루프를 즉시 재가동하고, 앱 종료는 `killProcess()` 없이 task를 먼저 숨긴 뒤 정리한다.
  - Android/native/web 위치 저장과 운행 통계는 좌표 기반 신뢰속도를 우선해 160km/h급 센서 속도 튐이 완료 화면 최고속도로 노출되지 않게 한다.
  - Android native 저속/정차 전송은 90초 heartbeat를 유지해 관제 지도에서 경로가 끊겨 보이는 시간을 줄인다.
  - Android native 자이로/가속도 센서는 1km/h 이상 저속 회전도 `GPS_TURN` 마커로 남겨 출발/도착/골목길 경로 단순화를 줄인다.
  - 실시간 관제 마커는 원본 GPS를 보존하면서 표시 좌표만 네이버 Directions 15의 가까운 도로 경로로 스냅한다.
  - 완료 경로 패널과 웹 기록 화면은 평균속도 대신 운행거리를 표시하고, 엑셀 내보내기에도 운행거리를 포함한다.
  - 종합실적은 연간/월간 동기화 완료 상태를 감지하면 Supabase summary를 다시 읽으며, 화면 조회는 NAS가 끊겨도 저장된 DB 기준을 유지한다.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 실적관리 원장 DB + 배차판 WEB 셀 오버레이 구조 분리 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, 선적 컨테이너 백그라운드 job 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 대량 안정 모드/자동 로그인 3회 하드캡/보호모드/수동 정지 지원 |
| Android 드라이버 앱 | 정상 | APK v5.11.29 빌드 완료 |

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
- [x] v5.14.64-133: 월간/연간/종합실적 분석, 행사일정/공휴일, 선적 job, 배차판 DB/WEB 셀, Android 오버레이/GPS/관제 통계 안정화

## RECENT CHANGES
- **v5.14.133**: 아산 배차판 엑셀 다운로드에서 `오더(계)/오더/계/수량/배차` 컬럼을 문자열이 아닌 숫자 셀로 저장한다. 데이터 행은 빈 칸까지 `thin` 테두리를 적용해 다운로드 파일에서 바로 합계/계산과 표 식별이 가능하게 했다.
- **v5.14.132**: 종합실적 구성·차량 비교 카드 제목을 `계약/차량 집중도`에서 `당사 / 협력사 비교`로 바꿔 좌우 비교 의도를 명확히 했다.
- **v5.14.131**: 아산 배차판 WEB 전용 `비고`는 WEB 입력 출처(`source=web`)만 표시한다. 초기 컷오버/엑셀 백필로 남은 `NOTE` 값은 삭제하지 않고 화면/내보내기 오버레이에서 제외해, 엑셀 `특이사항`과 WEB `비고` 저장 책임을 분리했다. 백필 스크립트도 앞으로 엑셀 `비고`를 `NOTE`로 가져오지 않는다.
- **v5.14.130 / APK v5.11.29**: 완료 경로 통계는 좌표 진행 기반 신뢰 최고속도로 계산해 센서 speed 160km/h 튐을 배제하고, 평균속도 대신 운행거리를 앱/웹/엑셀에 표시한다. Android native 자이로/가속도는 1km/h 이상 저속 회전을 `GPS_TURN` 마커로 저장해 출발/도착/골목길의 꺾임 포인트를 더 촘촘히 남긴다.
- **v5.14.129 / APK v5.11.28**: 운행 종료 후 앱 전경 복귀에도 오버레이가 남는 경합을 막기 위해 JS 종료 호출을 await하고 native `STOP_OVERLAY_SERVICE` latch/전경 복귀 정리를 추가했다. `trips?mode=active`는 최근 정상 좌표를 네이버 Directions 15 경로에 맞춰 표시 좌표만 도로로 스냅한다.
- **v5.14.128 / APK v5.11.27**: 12가0140 실시간 테스트 중 저속/정차 구간에서 native 저장 간격이 139~141초까지 벌어지는 것을 확인해 Android 서비스의 6km/h 미만 전송 주기를 180초에서 90초로 낮췄다. JS heartbeat와 맞춰 관제 지도 끊김 체감을 줄인다.
- **v5.14.127**: 2026-05-22 12가0140 실시간 운행에서 좌표 경로는 단방향 정상 진행이고 좌표 간 추정속도 max 92km/h였지만 `android_bg` 센서 speed가 156~160km/h로 저장되는 케이스를 확인했다. `/api/vehicle-tracking/location` 저장 단계에서 직전 좌표와 현재 좌표의 거리/시간 기반 추정속도와 센서속도를 비교해 과속 튐을 보정한다.
- **v5.14.126**: 아산 배차판 통합현황 WEB 셀 조회가 Supabase 기본 1000건 제한으로 최근 BKG/비고 저장값을 놓치지 않도록 `branch_dispatch_web_cells`를 1000건 단위로 페이지 조회한다.
- **v5.14.125**: Android 오버레이가 앱 최소화/표시 전환으로 살아난 경우에도 `startNativeTimer()`와 위치 루프를 즉시 재가동한다. 첫 렌더에서 운행시간이 빈칸으로 보이지 않게 하고, 앱 종료는 `moveTaskToBack(true)`로 먼저 숨긴 뒤 정리해 체감 버벅임을 줄였다. 2026-05-21~22 12가0140 운행 3건은 시작/종료 마커와 경로 연속성은 정상이며, 저장 속도 max 160km/h 튐만 native 속도 보정으로 대응했다. APK v5.11.26.
- **v5.14.124**: Vercel 프로덕션 배포가 `api/els/*` 함수 크기 250MB 제한에 막히던 문제를 보정했다. Next output file tracing에서 `../elsbot/**/*`와 임시 엑셀 캐시를 제외해 로컬 봇 실행파일/프로필이 서버리스 번들에 포함되지 않게 했다.
- **v5.14.123**: 아산 배차판 WEB BKG/비고 조회가 canonical/legacy row_signature 모두 실패해도 같은 원본·날짜·행번호·컬럼 최신값을 복구한다. 저장 API도 같은 행번호 기존값을 새 row_signature로 갱신해 글로비스/모비스/통합현황 간 입력값 누락을 막는다.
- **v5.14.122**: 행사일정 월간 매트릭스에 기본 한국 공휴일, 대체공휴일, 특별 휴일 정보를 붙여 휴일 셀을 붉은 톤으로 표시하고 라벨을 노출한다. 2026년 기준 어린이날, 부처님오신날(5/24), 부처님오신날 대체공휴일(5/25), 지방선거일 등을 테스트로 고정했다.
- **v5.14.121**: 아산 배차판 모바일 기간 선택 영역에서 데스크탑용 `flex: 0 0 240px`가 세로 높이로 적용되던 문제를 막아 셀렉트 위아래 빈 공간을 제거했다.

## VERIFICATION
- `node --test web/tests/driverMapCamera.test.mjs web/tests/vehicleLocation.test.mjs`: 34개 통과
- `npm.cmd run lint -- app/api/vehicle-tracking/trips/route.js app/api/vehicle-tracking/export/excel/route.js 'app/(main)/employees/vehicle-tracking/page.js' utils/vehicleLocation.mjs tests/vehicleLocation.test.mjs tests/driverMapCamera.test.mjs`: 통과(기존 hook/img 경고만)
- `npm.cmd run build`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: 통과, APK v5.11.29/versionCode 5170
- `node --test web/tests/asanDispatchWebCells.test.mjs web/tests/asanDashboardView.test.mjs`: 46개 통과

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
