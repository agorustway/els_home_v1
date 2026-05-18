# ELS MISSION CONTROL (v5.14.17 / APK v5.11.17)

> 최신 업데이트: 드라이버 앱 지도 자동추적 줌을 속도 기반으로 조정하고 전체보기 최대 줌을 제한한 APK v5.11.17 산출물을 반영했습니다.

## CURRENT STATUS
- **동기화 정책**: 연간실적 `NAS 동기화` 버튼은 core 직접 파싱 대신 외부 Node importer를 `nice/ionice` 백그라운드 프로세스로 실행. 동일 파일+current snapshot 존재 시 `summary-only`, 파일 변경 시 snapshot import로 처리.
- **웹 버전**: v5.14.17
- **APK 버전**: v5.11.17
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 차량위치관제 진행 중 내 차량 마커 클릭은 상세경로를 열지 않고 추적/줌만 수행.
  - Android 서비스 종료/재시작만으로 `TRIP_END`를 남기지 않음.
  - Naver Directions 경로가 원시 trace 대비 과도하게 길거나 루프면 보정 GPS선으로 fallback.
  - `android_bg` stale replay 차단과 네이티브 물리 필터 유지.
  - 드라이버 앱 지도 자동추적은 속도별 줌을 적용하고, 전체 차량 보기 과확대를 제한.
  - 아산 배차 모바일 날짜탭 자동 포커스는 `scrollIntoView` 대신 `scrollLeft`만 조정해 화면 세로 위치 유지.
  - 선적관리/안전운임/연간실적 v5.14 개선사항 운영 유지.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 368,617행 기준 조회 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, Bot은 2워커 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 잔여 Chrome 정리 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.17 빌드 완료 |

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
- [ ] Next: 아산 월간실적 취합 및 연간+월간 합산 API

## RECENT CHANGES
- **v5.14.17**: 드라이버 앱 지도 자동추적/내 차량 클릭은 속도 기반 줌을 적용하고 전체 차량 보기 최대 줌을 제한. APK v5.11.17 / 5158 산출물 반영.
- **v5.14.16**: 아산 배차 모바일 범위 전환 시 날짜탭 자동 가운데 맞춤이 세로 스크롤을 끌어내리지 않도록 수평 스크롤 전용으로 변경. 첫 진입 상단 위치도 유지.
- **v5.14.15**: 12가0140 2026-05-19 06:59/07:03 운행을 재분석. 원시 좌표는 불가능 속도 0건이나 진행 중 마커 클릭이 상세경로/끝점으로 오해될 수 있어 내 차량 마커 클릭은 추적/줌만 수행하도록 변경. Android 서비스 `onDestroy`의 자동 `TRIP_END` 전송을 제거하고, Naver Directions 결과가 원시 진행 대비 과도하게 길거나 trace 밖/루프면 필터 경로로 대체. 운행 완료 액션 로그도 남김. APK v5.11.16 / 5157 빌드.
- **v5.14.14**: 12가0140 2026-05-18 17시대 테스트 3건 기준으로 GPS 튐을 재분석. 1번은 좌표 자체보다 촘촘한 전경 샘플/도로 매칭 과신 문제, 2·3번은 `android_bg` 캐시 좌표 재등장으로 확인. 서버 stale replay 필터, Android 네이티브 전송 전 물리 필터와 `recorded_at`, 경로 waypoint 단순화, 운행 중 현재점 표시를 적용. APK v5.11.15 / 5156 빌드.
- **v5.14.13**: 선적관리 미선적 필터 기준을 `작업일 이후 MOVE TIME` 우선에서 컨테이너 이력구분 우선으로 보정. 이력조회값이 없는 행은 작업일이 지난 경우만 미선적 후보로 유지.
- **v5.14.12**: 선적관리 컨테이너 조회 상태를 `localStorage` 세션으로 보존하고 4초 주기로 저장 결과를 복원. 시작 이후 저장된 이력만 완료로 인정해 이전 조회 결과와 섞이지 않게 함.
- **v5.14.11**: 안전운임 탭 렌더 순서를 조정해 지도 기반 `구간조회` 버튼을 `이외구간` 앞에 배치.
- **v5.14.10**: 안전운임 기본 조회의 주소→행정동 자동 선택을 동기 정규화로 보정하고, 지도 기반 구간조회에서 `인천항국제여객터미널`이 `[왕복] 인천국제여객` 구간운임으로 매칭되도록 터미널 기점 판정을 강화.
- **v5.14.09**: 차량 위치 관제에서 `TRIP_END` 저품질/불가능 좌표는 마지막 정상점으로 수렴시키고, 앱 지도는 GPS 공백 중 짧은 예측 이동만 표시. 터널 출구 후보는 방향·속도상 맞을 때만 실제 경로로 연결. 완료 마커는 유지하되 동일 차량 재운행 시 진행 중 운행이 우선 표시되도록 보강.

## VERIFICATION
- `node --check web/driver-src/modules/map.js`: 통과
- APK 내부 `assets/public/modules/store.js`: `APP_VERSION v5.11.17`, `BUILD_CODE 5158` 확인
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/page.js" "tests/asanDashboardView.test.mjs"`: 0 errors
- `node --test web/tests/vehicleLocation.test.mjs`: 13개 통과
- `npm.cmd run lint`: 통과
- `powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1`: v5.11.17 / 5158 APK 빌드 및 `web/public/apk/els_driver.apk` 복사 완료
- `git diff --check`: 통과 (version.json line-ending 경고만 표시)

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 게임.
- `/employees/news` 하단 숨은 트리거로 미니 모달 진입 가능.

## IN-PROGRESS
- 현재 이어받을 미완료 작업 없음.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정은 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 명시 요청 또는 자동승인 범위에서만 실행.
- 코드 변경 시 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
