# ELS MISSION CONTROL (v5.13.4 / APK v5.11.11)

> 최신 업데이트: 차량위치관제 GPS 튐 필터, 앱 지도 실시간 수신, 상세 패널 UX를 리팩터링했습니다.

## CURRENT STATUS
- **웹 버전**: v5.13.4
- **APK 버전**: v5.11.11
- **운영 방향**: NAS-Centric 유지. 고부하 Excel/ZIP/봇/파일 처리는 NAS 백엔드, 웹은 조회·편집 UI와 Supabase 인증 중심.
- **이번 변경 핵심**:
  - 최근 운행 GPS 표본 1,000개 분석 결과 raw 97.6km → 보정 54.4km로 튀는 구간을 필터링.
  - 저속/정차 중 좌표 점프, 160km/h+ 순간속도, spike-return 포인트를 서버·웹·앱 공통 기준으로 차단.
  - 앱 전경/지도 화면 수집 주기를 단축하고 클라이언트 수신시각을 보존해 오프라인 큐 순간이동을 완화.
  - 앱 지도 경로선을 유지하고 상세보기 중 하단 운행 패널 겹침을 해소.
  - 웹 관제 상세 패널과 마커 줌 토글 UX를 정리하고 APK v5.11.11을 빌드/배포 위치에 반영.

## ACTIVE SYSTEMS
| 영역 | 상태 | 메모 |
|---|---|---|
| Next.js 웹 | 정상 | `npm.cmd run lint`, `npm.cmd run build` 통과 |
| Supabase 인증/DB | 정상 | `ai_chat_memory` 삭제/치환 동기화 보강 |
| NAS 백엔드 | 정상 | 차량 관제 최신 위치 응답에 GPS 보정 필터 반영 |
| ELS Bot | 정상 | 이번 작업 영향 없음 |
| Android 드라이버 앱 | 정상 | GPS 전경 수집/지도 UX 개선, APK v5.11.11 빌드 완료 |

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
- **v5.13.4 / APK v5.11.11**: 차량위치관제 GPS 이상치 필터 강화, 앱 지도 실시간 수집·경로 유지·상세 패널 겹침 해소, 웹 상세 패널/마커 줌 토글 정리.
- **v5.13.3**: 업무보고 목록/작성/상세/첨부 UI를 고밀도 표준으로 보정하고, 아산 배차판/선적관리 테이블 헤더·폰트·행 높이를 축소.
- **v5.13.2**: AI 어시스턴트 대화 삭제 전 예약 저장 타이머를 취소하고, 전체/개별/현재 대화 삭제를 DB에 즉시 반영.
- **v5.13.1**: 작업지정보 주소 폭 축소 및 주의사항/특이사항 컬럼 추가, 업무자료실 상세/첨부 목록형 정리, 이스터에그 복구.
- **v5.13.0**: 연락처형 페이지 공통 테이블/상세 컴포넌트화, 모바일 카드 뷰 재정렬.
- **v5.12.22**: 이트랜스 "데이터가 없음" 키워드 및 그리드 초기화 객체 보강.
- **v5.12.21**: 컨테이너 이력조회 데이터 누수 방지.
- **v5.12.20**: 아산 모바일 UI 높이/저장시간 겹침 수정.

## VERIFICATION
- 실제 GPS 표본 분석: raw 97.6km / 1,000포인트 → 보정 54.4km / 291포인트.
- `node --test web/tests/vehicleLocation.test.mjs`: 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- `scripts\build_driver_apk.ps1`: APK v5.11.11 / versionCode 5152 빌드 및 `web/public/apk/els_driver.apk` 반영
- 브라우저 디버그 확인: `/employees/vehicle-tracking?debug=true` 화면 및 상세 패널 렌더링 확인
- 빌드 중 외부 HTTPS fetch 일부는 샌드박스 네트워크 제한으로 EACCES 경고 발생. 빌드 종료 코드는 0.

## EASTER EGGS
- `/employees/random-game`: 공식 메뉴에는 없는 숨은 랜덤게임. AI 어시스턴트 하단 빌드 문구를 통해 진입 가능.
- `/employees/news` 송미관: 뉴스 페이지 하단의 숨은 트리거로 열리는 모달.

## IN-PROGRESS
- 없음. 다음 작업자는 차량위치관제 운영 반영 후 실제 기사 앱 GPS 수신 간격과 경로선 품질을 관제 화면에서 확인.

## FIXED RULES
- `GEMINI.md`, `.cursorrules` 수정 금지.
- Android 앱 수정 시 `web/driver-src/`만 편집하고 APK는 `scripts/build_driver_apk.ps1`만 사용.
- Git push는 형이 명시적으로 요청할 때만 실행.
- 코드 변경 후 `docs/01_MISSION_CONTROL.md`, `docs/02_DEVELOPMENT_LOG.md` 갱신 필수.
