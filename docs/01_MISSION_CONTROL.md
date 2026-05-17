# ELS MISSION CONTROL (v5.13.93 / APK v5.11.12)

> 최신 업데이트: AI 어시스턴트 전체 대화 삭제가 DB 저장 레이스에 다시 살아나지 않도록 삭제 마커·stale POST 차단·최종 purge 흐름을 보강했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.93
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 연간실적 분석을 `개요/10년 흐름/연도×월/직계약·주체/주차·요일/검증·근거` 탭으로 확장.
  - 운영 Supabase summary에 `weekly`, `weekday`, `strategicSegments`, `ledgerValidation`, `amountQuality`, `dateQuality`를 추가.
  - 검증값: current snapshot 368,617행, 월별 summary 불일치 0건, 매출/매입/손익 raw 재집계 차이 0원.
  - `운송사(명의)=ELS솔루션`과 `ELS솔루션+직계약`을 외부 운송사와 분리해 별도 분석.
  - 상세 원장 AND 검색은 정확 count 생략 경로일 때 `301+`처럼 추정 총건수로 표시.
  - AI 어시스턴트 전체 삭제 후 늦은 자동저장 POST가 `ai_chat_memory`를 되살리지 못하도록 삭제 판정을 서버에서 방어.
  - 선적관리 기본 조회는 최근 3개월 작업일 서버 필터를 적용해 DB 조회량을 줄임.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차 분석 대시보드/선적/실적 테스트 통과 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 고정, 분석 summary/검증 메타 반영 |
| NAS 백엔드 | 정상 | 배차판/선적관리/연간실적 저부하 파일감지 주기 적용 |
| ELS Bot | 정상 | eTrans 세션 연장/자정 롤오버 타이머 가드 보강 |
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
- **v5.13.80**: 아산 선적관리 월 필터 기본값을 해제해 첫 진입은 100건 페이징만 유지하고, 필터 동작 시에만 전체 기준 로드를 수행.

## VERIFICATION
- `node --test web/tests/chatMemory.test.mjs`: 6개 통과
- `npm.cmd run lint -- "app/(main)/employees/(intranet)/ask/page.js" "app/api/chat/memory/route.js" "utils/chatMemory.mjs"`: 0 errors (기존 warning 8건)
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanShippingFlow.test.mjs`: 34개 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 23개 통과
- 웹 디버그: 연간실적 `개요/10년 흐름/연도×월/직계약·주체/주차·요일/검증·근거` 탭 및 원장 AND 검색 `301+` 표기 확인
- `npm.cmd run lint -- "app/(main)/employees/branches/asan/AsanAnnualPerformance.js" "app/(main)/employees/branches/asan/AsanShipping.js" "lib/asan-branch-db.js" "scripts/import-asan-annual-performance.mjs" "tests/asanAnnualPerformance.test.mjs" "tests/asanShippingFlow.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app.py docker/els-backend/app_core.py`: 통과
- `npm.cmd run build`: 통과 (외부 WebDAV/API sandbox EACCES 경고만 표시)
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
