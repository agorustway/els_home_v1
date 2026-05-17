# ELS MISSION CONTROL (v5.13.88 / APK v5.11.12)

> 최신 업데이트: 아산 연간실적 분석 화면의 첫 화면 밀도를 높이고 월별 흐름/연도별/공헌도 구성을 압축했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.88
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 연간실적 직접 주입은 새 스냅샷을 메타 `currentSnapshotId`로 공개하고, 기본 경로에서 이전 current 행 대량 UPDATE를 수행하지 않도록 조정.
  - 웹 조회는 `currentSnapshotId`가 있으면 `snapshot_id` 기준으로 읽고, snapshot 메타가 없을 때만 legacy `is_current=true` 조회로 fallback.
  - `snapshot_id,row_index` 조회 인덱스 SQL을 추가해 페이지 조회/정렬이 current 대량 UPDATE에 의존하지 않게 준비.
  - 연간실적 분석 화면을 성과 리포트, 손익 구조, 성과 경보, 연도/월 흐름, 공헌도 매트릭스, 저마진/손실/고마진 포트폴리오로 재구성.
  - 연간실적 첫 화면은 손익 구조 옆에 최근 12개월 흐름을 배치하고, 연도별 차트는 한 줄 3지표 레인으로 압축.
  - 회계 분석 기준은 매출·매입·손익률, 매입률, 고객/작업지/운송사/노선/구분별 공헌도와 상위 집중도를 중심으로 정리.
  - 화면 분석은 Supabase summary/breakdown을 사용하고 브라우저에서 36만 행 전체를 재집계하지 않도록 유지.
  - 요일별 작업지 비중 탭명을 `주간 실적`, `월간 평균`으로 변경.
  - 월간 선택 줄은 `월간 평균합`을 주 지표로 표시하고, 월 누적은 보조 텍스트로 분리.
  - 데스크톱 추세 돋보기 위치는 데이터 포인트가 아니라 마우스 좌표를 따라가고, 내부 데이터만 가장 가까운 포인트 기준으로 표시.
  - 모바일 선적관리의 미선적/자체보관 빠른 필터를 같은 2분할 그룹으로 묶어 가로폭 통일.
  - `오더(계)`/`오더`/`계`/`수량`이 순수 숫자가 아닌 행은 필터 합계, 기간 카드, 기준차이, 실행사 기준 집계에서 제외.
  - 실행사 지역칸에 `보송1` 같은 값이 있어도 오더가 `오배차` 같은 문자면 분석 원인에 반영하지 않음.
  - 기준차이 선택 칩 활성 색상을 검정에서 차분한 파랑 계열로 변경.
  - `필터해제`로 표시되는 미선적/자체보관 버튼의 hover 설명에 원래 필터명을 표시.
  - `자차3.이지5`처럼 점으로 이어진 지역칸 수량을 구분자로 인식.
  - 기준차이 패널은 일/주/月 칩 선택에 따라 해당 기간 원인만 표시.
  - 연간실적 조회를 메타 summary의 `currentSnapshotId` 기준으로 고정해 중복 current 스냅샷 표시 차단.
  - 월별 추세, 건당 매출/손익, 매입률, 최고 손익월 패널 추가.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차 분석 대시보드/선적/실적 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 직접 주입 완료, current 스냅샷 고정 반영 필요 |
| NAS 백엔드 | 정상 | 배차판/선적관리/연간실적 저부하 파일감지 주기 적용 |
| ELS Bot | 정상 | eTrans 세션 연장/자정 롤오버 타이머 가드 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

## INTRANET UI 기준
- **목록 테이블**: 고정 폭 컬럼 + 마지막 비고/주소 컬럼 유동 폭, 헤더는 짙은 블루 계열.
- **상세 화면**: `Hero → 주요 필드 Grid → 메모/첨부 Section` 순서.
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
- **v5.13.88**: 아산 연간실적 첫 화면에 최근 12개월 흐름을 올리고 연도별 차트를 압축해 공헌도 매트릭스 진입을 앞당김.
- **v5.13.87**: 아산 연간실적 직접 주입의 마지막 `is_current` 대량 UPDATE를 기본 경로에서 제거하고 `currentSnapshotId` 기준 스냅샷 공개/조회로 전환.
- **v5.13.86**: 아산 연간실적 분석 탭을 회계 성과 보고서형 화면으로 재구성하고 손익 구조, 공헌도 매트릭스, 저마진/손실/고마진 포트폴리오를 추가.
- **v5.13.85**: 아산 배차 요일별 작업지 비중 탭을 `주간 실적`/`월간 평균`으로 바꾸고, 추세 돋보기는 마우스 좌표를 따라가게 보정.
- **v5.13.84**: 아산 선적관리 모바일 미선적/자체보관 버튼을 같은 2분할 그룹으로 묶어 가로폭을 동일하게 고정.
- **v5.13.83**: 아산 배차 문자/오류 오더 행을 필터 합계·분석·기준차이 원인에서 제외하고 기준차이 선택 칩 색상을 파랑 계열로 조정.
- **v5.13.82**: 아산 선적관리 미선적/자체보관 빠른 필터가 `필터해제` 상태일 때 hover 설명에 원래 필터명을 표시.
- **v5.13.81**: 아산 배차 지역칸 `자차3.이지5` 형태의 점 구분자 파싱을 보강하고 기준차이 원인 목록을 일/주/月 선택식으로 정리.
- **v5.13.80**: 아산 선적관리 월 필터 기본값을 해제해 첫 진입은 100건 페이징만 유지하고, 필터 동작 시에만 전체 기준 로드를 수행.
- **v5.13.79**: 연간실적 current 스냅샷 고정으로 중복 표시를 막고 월별/구분별 분석 패널을 확장.
- **v5.13.78**: 연간실적 마감월/작업일자 날짜 시리얼과 시간 문자열을 정규화하고 금액 컬럼 천단위 표시를 적용.
- **v5.13.77**: 아산 배차 검색/필터 합계를 실제 표시 행 기준으로 맞추고, 실행사 지역칸의 붙은 수량 파싱을 보정.
- **v5.13.76**: 아산 배차 고객사/실행사 기준 차이 패널을 추가하고, 차이 원인 행을 날짜 탭+검색 링크로 추적 가능하게 함.
- **v5.13.75**: 연간실적 웹 조회에서 Supabase exact count를 제거하고 파일 메타 행 수를 사용해 화면 진입 timeout을 완화.
- **v5.13.74**: 아산 배차 도넛 범례에 항목별 점유율을 붙이고, 데이터 없는 날짜 탭 비활성화와 모비스 국가명 고객사 집계를 적용.
- **v5.13.73**: 아산 선적관리 모바일 날짜 필터에서 `미선적`/`자체보관` 빠른 버튼 폭을 동일하게 정렬.

## VERIFICATION
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js"`: 0 errors
- `node --test web/tests/asanDashboardView.test.mjs`: 22개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js"`: 0 errors
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanShipping.js"`: 0 errors
- `node --test web/tests/asanDashboardView.test.mjs web/tests/asanShippingFlow.test.mjs`: 56개 통과
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanDashboard.js" "app/(main)/employees/branches/asan/AsanShipping.js"`: 0 errors
- `npm.cmd run build`: 통과 (외부 WebDAV/API sandbox EACCES 경고만 표시)
- Browser: 로컬 dev 서버 기동은 PowerShell `Path/PATH` 중복 환경변수로 제한됨. 빌드 검증으로 대체.
- `git diff --check`: 통과 (CRLF 치환 warning만 표시)

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
