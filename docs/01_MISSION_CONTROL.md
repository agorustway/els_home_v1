# ELS MISSION CONTROL (v5.13.37 / APK v5.11.12)

> 최신 업데이트: 아산 선적관리 미선적 기준을 작업일 포함 이후 `이력 MOVE TIME` + `이력구분` 기준으로 재정의하고, 컨테이너 조회 결과를 기존값 위에 누적하지 않고 최신 결과로 덮어쓰게 했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.37
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 아산 선적관리 `미선적` 빠른 필터는 행의 `작업일자` 포함 이후 `이력 MOVE TIME`이 있고, `이력 구분`이 `반입/적하`가 아닌 경우만 표시.
  - 같은 기준에서 `반입/적하`는 완료로 판정해 전 행 회색 음영/회색 글씨를 유지.
  - 필터 상태에서 `컨테이너 조회`를 다시 누르면 기존 DB 조회 결과를 삭제한 뒤 최신 조회 결과를 저장해 `이력 조회시각`과 표시값이 새 데이터 기준으로 교체됨.
  - 컨테이너 조회 최종 결과가 비면 기존 표시값도 되살아나지 않도록 해당 컨테이너의 저장값을 비움.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 선적관리 회귀 테스트 및 ESLint 통과 |
| Supabase 인증/DB | 정상 | 선적관리 조회 결과는 최신 조회 기준으로 교체 저장 |
| NAS 백엔드 | 정상 | 배차판/선적관리 저부하 파일감지 유지 |
| ELS Bot | 정상 | 3워커 운용, 서버 측 조회 스트림 저장 유지 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

## INTRANET UI 기준
- **목록 테이블**: 고정 폭 컬럼 + 마지막 비고/주소 컬럼 유동 폭, 헤더는 짙은 블루 계열.
- **상세 화면**: `Hero → 주요 필드 Grid → 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치와 톤 통일.
- **모바일**: 카드 기반 목록, 컨테이너 좌우 3~4px, 본문 폰트 0.72~0.88rem 중심.

## MILESTONES
- [x] Phase 1-6: AI 에이전트 및 RAG 기반 구축
- [x] v5.10: 차량위치관제/GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 인트라넷 연락처형 페이지 UI 파이프라인 정리
- [ ] Next: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## RECENT CHANGES
- **v5.13.37**: 아산 선적관리 미선적 정의를 `작업일자 <= 이력 MOVE TIME`인 비완료 이력(`반입/적하` 제외)으로 변경. 완료 음영도 같은 작업일 기준으로 맞췄고, 컨테이너 조회 최종 저장은 기존 file/container 조회값을 삭제 후 최신 결과로 교체.
- **v5.13.36**: 차량위치관제 운행기록 Excel export 라우트에 `force-dynamic`을 선언해 Next 빌드 중 정적 렌더 오류 로그를 제거.
- **v5.13.35**: 아산 선적관리 전용 `/container-lookup` 스트림 라우트를 추가해 부분/최종 컨테이너 조회 결과를 서버 측에서 즉시 저장.
- **v5.13.34**: 선적관리 날짜 필터 바에 `미선적`, `자체보관` 빠른 필터를 추가.
- **v5.13.33**: 선적관리 컬럼 필터 후보를 전체 로드 기준으로 만들고 빈값 정규화, 자동 더보기를 보강.
- **v5.13.32**: 컨테이너 조회 완료 행을 전체 행 회색 음영/회색 글씨로 표시.
- **v5.13.31**: 배차판/선적관리 NAS 엑셀 동기화를 mtime+size 안정화 게이트로 보강.

## VERIFICATION
- `node --test web/tests/asanShippingFlow.test.mjs`: 17개 통과
- `node --test web/tests/containerInput.test.mjs web/tests/vehicleTrackingExport.test.mjs web/tests/vehicleLocation.test.mjs web/tests/asanShippingFlow.test.mjs`: 28개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js" "app/api/branches/asan/shipping/container-results/store.js" "app/api/branches/asan/shipping/container-lookup/route.js" "utils/asanShippingView.mjs"`: 0 errors
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 없음. 다음 작업자는 운영 NAS 배포 후 `/employees/branches/asan`에서 미선적 필터와 컨테이너 재조회 덮어쓰기 동작을 실제 데이터 3건 이상으로 확인.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
