# ELS MISSION CONTROL (v5.14.00 / APK v5.11.12)

> 최신 업데이트: NAS `els-core`가 연간실적/선적관리/배차판 대용량 엑셀 파싱 후 원장 데이터를 메모리에 붙잡지 않도록 정리했고, 컨테이너 재시작 직후 DB가 최신이면 배차판 최초 전체 파싱을 건너뛰게 했다.

## CURRENT STATUS
- **웹 버전**: v5.14.00
- **APK 버전**: v5.11.12
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS, 화면 조회와 인증/DB는 Supabase 중심.
- **이번 변경 핵심**:
  - 연간실적 core 자동 동기화와 대용량 엑셀 직접 조회는 기본 비활성화. NAS 직접 주입 스크립트만 운영 기본 경로.
  - 연간실적 sync 경로는 완료 후 `cache.pop(...)`, 대형 row/payload/hash 참조 해제, `gc.collect()` 수행.
  - 선적관리 sync/엑셀 fallback은 파싱 후 `shipping_cache`에 전체 원장을 저장하지 않고, 페이지 단위 응답 후 참조를 비움.
  - 배차판 sync는 pandas/openpyxl workbook, DataFrame, rows, comments 참조를 시트/파일 처리 후 즉시 비움.
  - 배차판 스케줄러는 컨테이너 재시작으로 인메모리 캐시가 비어도 Supabase `branch_dispatch.file_modified_at`가 최신이면 최초 전체 파싱을 생략.
  - NAS `els-core` 고메모리 원인은 core가 연간실적/배차/선적 엑셀 원장을 파싱 후 캐시하거나 재시작 후 최초 파싱을 반복하던 구조로 확인됨.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | 아산 배차/선적/실적관리 화면 운영 |
| Supabase 인증/DB | 정상 | 연간실적 current snapshot 368,617행 기준 조회 |
| NAS 백엔드 | 정상 | Core는 대용량 원장 캐시 금지, Bot은 2워커 운영 |
| ELS Bot | 정상 | Selenium 워커 2개, 잔여 Chrome 정리 보강 |
| Android 드라이버 앱 | 정상 | APK v5.11.12 유지 |

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
- **v5.14.00**: `els-core` 연간실적 자동 엑셀 파싱을 기본 차단하고, 선적관리/배차판 파싱 완료 후 DataFrame/Workbook/rows/payload/cache 참조를 즉시 비우도록 보강. 배차판은 DB 파일수정일이 최신이면 컨테이너 재시작 후 최초 전체 파싱을 생략.
- **v5.13.103**: NAS 메모리 악화 중 Docker recreate가 60초 타임아웃으로 실패하지 않도록 Bot/Core 전용 배포 스크립트의 Docker/Compose 타임아웃을 600초로 상향.
- **v5.13.102**: `deploy-bot.sh`, `deploy-core.sh`를 비대화형 sudo/Docker 경로 기준으로 정리하고 로그 확인을 종료형으로 변경.
- **v5.13.101**: `stop-daemon` 이후 잔여 Chrome 프로세스 정리 보강.
- **v5.13.100**: NAS `els-bot` Selenium 워커/배치 병렬도를 2개로 제한.
- **v5.13.99**: 아산 연간실적 분석섹션 탭을 조사범위 아래 고정 배치해 탭 전환 시 화면 흔들림을 줄임.
- **v5.13.98**: 관리자 문의/회원권한/활동로그 화면을 인트라넷 톤으로 재정리하고 로그 조회 경로를 `/api/admin/logs`로 복구.

## VERIFICATION
- `node --test web/tests/asanAnnualPerformance.test.mjs`: 12개 통과
- `node --test web/tests/asanDashboardView.test.mjs`: 24개 통과
- `npm.cmd run lint -- "tests/asanAnnualPerformance.test.mjs" "tests/asanDashboardView.test.mjs"`: 0 errors
- `python -m py_compile docker/els-backend/asan_performance.py docker/els-backend/app_core.py docker/els-backend/app.py`: 통과
- NAS 확인: `els-core` 재시작 후 RSS 약 27MB 수준으로 회복, import node 프로세스 없음 확인

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
