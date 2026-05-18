# ELS MISSION CONTROL (v5.13.101 / APK v5.11.12)

> 최신 업데이트: NAS 메모리 압박 완화를 위해 `els-bot` Selenium 워커와 배치 병렬도를 2개로 낮추고, 데몬 정지 시 pool이 비어 있어도 설정된 Chrome 포트를 함께 정리하도록 보강했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.101
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 연간실적 분석을 `개요/10년 흐름/연도×월/직계약·차량/주차·요일/검증·근거` 탭으로 확장.
  - 상단 장기 흐름 차트는 매출/매입 선과 월평균선을 함께 표시하고, 조사범위 선택값을 KPI/흐름/세그먼트에 반영.
  - 운영 Supabase summary에 `weekly`, `weekday`, `strategicSegments`, `ledgerValidation`, `amountQuality`, `dateQuality`를 추가.
  - 검증값: current snapshot 368,617행, 월별 summary 불일치 0건, 매출/매입/손익 raw 재집계 차이 0원.
  - `운송사(명의)=ELS솔루션`과 `ELS솔루션+직계약`을 외부 운송사와 분리해 별도 분석.
  - 상세 원장 AND 검색은 정확 count 생략 경로일 때 `301+`처럼 추정 총건수로 표시.
  - AI 어시스턴트 전체 삭제 후 늦은 자동저장 POST와 브라우저 로컬 캐시가 예전 대화목록을 되살리지 못하도록 서버/로컬 양쪽에서 방어.
  - 모바일 배차 현황판 중간 액션은 `통합현황/글로비스 KD 외/모비스 AS`와 `고객사/실행사/배차판 검색` 2줄로 제공.
  - 연간실적 차량별 손익은 실제 차량번호만 랭킹화하고, 빈칸/`-` 영업넘버 55,473건은 별도 품질 지표로 표시.
  - 연간실적 분석섹션 탭은 조사범위 컨트롤 아래 고정 위치로 배치해 탭 전환 시 시선 이동을 줄임.
  - 관리자 권한/문의/활동 로그 화면은 연락처·자료실 기준 폰트/버튼/표 밀도로 맞추고 이모지 장식을 제거.
  - 활동 로그 관리는 `/api/admin/logs` 경유로 조회·삭제하고, 정확 count 대신 추정 count+다음 페이지 감지로 병목을 줄임.
  - 선적관리 기본 조회는 최근 3개월 작업일 서버 필터를 적용해 DB 조회량을 줄임.
  - NAS `els-bot`은 메모리 여유 확보를 위해 `ELS_MAX_DRIVERS=2`, `ELS_BATCH_MAX_WORKERS=2`로 운영.
  - 데몬 정지 시 등록 워커가 0개여도 설정된 `drission_port_32000+` 잔여 Chrome을 포트 기준으로 정리.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차 분석 대시보드/선적/실적 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 고정, 분석 summary/검증 메타 반영 |
| NAS 백엔드 | 정상 | 배차판/선적관리/연간실적 저부하 파일감지 주기 적용 |
| ELS Bot | 정상 | Selenium 워커 2개 운영 및 stop-daemon 잔여 Chrome 정리 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

## INTRANET UI 기준
- **목록 테이블**: 고정 폭 컬럼 + 마지막 비고/주소 컬럼 유동 폭, 헤더는 짙은 블루 계열.
- **상세 화면**: `Hero -> 주요 필드 Grid -> 메모/첨부 Section` 순서.
- **버튼**: 기본 32px, 모바일 29~30px. 등록/수정/삭제/목록 위치와 톤 통일.
- **모바일**: 카드 기반 목록, 컨테이너 좌우 3~4px, 본문 폰트 0.72~0.88rem 중심.
- **로딩 안내**: 아산지점 탭/페이지 초기 로딩 문구는 `데이터를 불러오는 중입니다...`, 폰트는 `0.86rem / 800 / #64748b`.

## MILESTONES
- [x] Phase 1-6: AI 에이전트 및 RAG 기반 구축
- [x] v5.10: 차량위치관제/GPS 리팩토링
- [x] v5.12: 아산지점 선적관리/종합상황판 개편
- [x] v5.13: 인트라넷 연락처형 페이지 UI 파이프라인 정리
- [ ] v5.14: 아산 월별실적 취합 및 연간+월별 합산 API
- [ ] Next: 사용자별 접근 권한 분리 및 최종 인트라넷 이관

## RECENT CHANGES
- **v5.13.101**: `stop-daemon` 이후 pool은 비었지만 Chrome 프로세스가 남는 상황을 줄이기 위해, `DriverPool.clear()`가 등록 워커 포트와 설정된 기본 포트 범위를 함께 정리하도록 보강.
- **v5.13.100**: NAS 스왑 압박 완화를 위해 `els-bot` Selenium 워커/배치 병렬도를 2개로 낮추고, 후발 워커 기동 기준을 1개 준비 후 60초 간격으로 조정.
- **v5.13.99**: 아산 연간실적 분석섹션 탭을 조사범위 바로 아래로 이동하고, 버튼 폭/높이/라벨 영역을 고정해 탭 클릭 시 컨트롤 줄이 흔들리지 않게 보정.
- **v5.13.98**: 관리자 문의/회원 권한/활동 로그 화면을 담백한 인트라넷 톤으로 재정리하고 이모지 장식을 제거. 활동 로그 화면은 NAS 직접 호출 대신 인증된 Next 관리자 API를 사용하며 모바일 카드 뷰와 로컬 `/api/logs` 수집 fallback을 추가.
- **v5.13.97**: 아산 연간실적 차량별 손익에서 원장 `영업넘버` 빈칸/`-` 행을 차량 랭킹에서 분리하고 `차량번호 미기재` 품질 지표로 표시. 장기 흐름 SVG 비율, 조사범위 바, 분석 섹션 탭 톤을 정리해 넓은 화면에서 그래프가 가운데만 쓰이지 않게 보정.
- **v5.13.96**: 아산 배차 모바일 중간 액션에 현황 범위 선택 3버튼을 추가하고, 배차판 검색 버튼은 흰색 보조 톤으로 낮춤. 배차판 진입 스크롤은 상단 카드 기준으로 보정.
- **v5.13.95**: AI 어시스턴트 삭제 시 `els_ai_sessions_cleared_at` 로컬 삭제 마커를 저장하고, 해당 시점보다 오래된 로컬/DB 대화 스냅샷은 화면에 표시하지 않도록 보강.
- **v5.13.94**: 아산 연간실적 상단에 주식형 매출·매입 장기 흐름과 평균선을 추가. 전체/최근 12개월/36개월/5년/최근 연도/직접 선택 조사범위로 KPI·월별·연도별·직계약·주차 분석을 재계산하고, `영업넘버` 기준 차량별 손익 summary를 추가.
- **v5.13.93**: AI 어시스턴트 대화 전체 삭제 시 예약/진행 중 자동저장을 차단하고, `/api/chat/memory`가 삭제 마커보다 오래된 저장 스냅샷을 무시하도록 보강. 삭제 후 빈 마커는 지연 purge로 정리.
- **v5.13.92**: 아산 연간실적/선적관리 DB 페이징에서 정확 count를 생략한 검색 결과는 `+` 표기로 추정 총건수를 표시. 웹 디버그에서 368,617행 summary, ELS솔루션 직계약 드릴다운, 2024-01/2025-01 검증값을 재확인.
- **v5.13.91**: 아산 연간실적 10년 원장 분석 워크벤치 확장. 월/주차/요일/ELS솔루션 직계약 세그먼트와 검증·근거 탭 추가, Supabase summary 고급 재집계 SQL 반영.
- **v5.13.90**: 아산 배차 요일별 월간 지표명을 `월기준 주간평균합`으로 정정하고 모바일 날짜탭 시작점 버튼과 짧은 주차 라벨 추가.
- **v5.13.89**: 아산 연간실적 월 파싱을 보정하고 Supabase 월별 summary를 `마감월` 기준으로 복구. 월별 차트 금액 표시도 보강.
- **v5.13.88**: 아산 연간실적 첫 화면에 최근 12개월 흐름을 올리고 연도별 차트를 압축해 공헌도 매트릭스 진입을 앞당김.
- **v5.13.87**: 아산 연간실적 직접 주입의 마지막 `is_current` 대량 UPDATE를 기본 경로에서 제거하고 `currentSnapshotId` 기준 스냅샷 공개/조회로 전환.
- **v5.13.86**: 아산 연간실적 분석 탭을 회계 성과 보고서형 화면으로 재구성하고 손익 구조, 공헌도 매트릭스, 저마진/손실/고마진 포트폴리오를 추가.
- **v5.13.85**: 아산 배차 요일별 작업지 비중 탭을 `주간 실적`/`월간 평균`으로 바꾸고, 추세 돋보기는 마우스 좌표를 따라가게 보정.
- **v5.13.84**: 아산 선적관리 모바일 미선적/자체보관 버튼을 같은 2분할 그룹으로 묶어 가로폭을 동일하게 고정.
- **v5.13.83**: 아산 배차 문자/오류 오더 행을 필터 합계·분석·기준차이 원인에서 제외하고 기준차이 선택 칩 색상을 파랑 계열로 조정.
- **v5.13.82**: 아산 선적관리 미선적/자체보관 빠른 필터가 `필터해제` 상태일 때 hover 설명에 원래 필터명을 표시.
- **v5.13.81**: 아산 배차 지역칸 `자차3.이지5` 형태의 점 구분자 파싱을 보강하고 기준차이 원인 목록을 일/주/月 선택식으로 정리.

## VERIFICATION
- `git diff --check`: 통과
- `python -m unittest elsbot.tests.test_daemon_stop_control`: 통과
- `node --test web/tests/chatMemory.test.mjs`: 7개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" "app/api/chat/memory/route.js" "utils/chatMemory.mjs"`: 0 errors (기존 warning 8건)
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/page.js"`: 0 errors
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- 연간실적 화면 테스트: `조사범위 → 분석섹션 → 장기 흐름` 순서 고정 검증 추가
- `node --test web/tests/adminManagementUi.test.mjs`: 3개 통과
- `npm.cmd run lint -- "app/(main)/admin/page.js" "app/(main)/admin/users/page.js" "app/(main)/admin/logs/page.js" "app/api/admin/logs/route.js" "app/api/logs/route.js" "utils/logger.js" "utils/logger.server.js"`: 0 errors
- 운영 Supabase 검증: `vehiclePerformance` 80개 실제 차량, 최상위 `부산98사1786` 손익률 15.74%, 차량번호 미기재 55,473건 별도 분리
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- 웹 디버그: 연간실적 `개요/10년 흐름/연도×월/직계약·차량/주차·요일/검증·근거` 탭 및 원장 AND 검색 `301+` 표기 확인
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanShipping.js" "lib/asan-branch-db.js" "scripts/import-asan-annual-performance.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/API sandbox EACCES 경고만 표시)
- 로컬 HTTP 검증: `/admin/logs?debug=true` 200 응답 및 `활동 로그 관리`/`새로고침` 렌더 확인. 인앱 브라우저 로컬 접속은 `ERR_BLOCKED_BY_CLIENT`로 차단.
- `git diff --check`: 통과
- Supabase 검증: 368,617행, 월별 summary 불일치 0건, 2024-01/2025-01 엑셀 샘플 금액 일치

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 현재 이어받을 미완료 작업 없음.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
