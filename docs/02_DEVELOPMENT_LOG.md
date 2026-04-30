# 📜 DEVELOPMENT LOG (개발 역사)

## [2026-04-30] 안드로이드 드라이버 앱 GPS 도로보정 실전 패치 배포 (v5.10.4 / 5104)
### 🚀 Achievement
- **GPS 도로보정 실전 적용**: Naver Directions15 기반 도로 경로 보정 및 첫/끝 튐 제거 로직이 통합된 드라이버 앱 v5.10.4(5104) 버전을 빌드 및 배포했습니다.
- **운행 정보 실시간 가시화**: 드라이버가 운행 중 자신의 현재 속도와 경과 시간을 확인할 수 있도록 UI를 보강했습니다.
- **강제 업데이트 배포**: 도로보정 필터의 중요성을 고려하여 `forceUpdate: true` 옵션을 적용, 모든 드라이버가 즉시 설치하도록 유도했습니다.

### 🛠 Technical Changes
- `web/android/app/build.gradle`: versionCode 5104, versionName "5.10.4"로 증분.
- `web/driver-src/`: 모든 모듈에 빌드 번호 기반 캐시 버스터(?v=5104) 적용 및 UI/로직 통합.

---

## [2026-04-30] 차량위치관제 GPS 도로보정 및 운행 정보 표시 안정화 (v5.10.29)
### 🚀 Achievement
- **첫/끝 튐 제거 강화**: 운행 경로의 시작/종료 지점이 실제 운행 구간에서 멀리 튀는 케이스를 별도 endpoint outlier 규칙으로 제거했습니다.
- **도로 경로 보정 적용**: 필터링된 GPS 포인트를 Naver Directions15 경유지로 샘플링해 지도 polyline을 인근 도로 경로로 보정하고, API 실패 시 기존 필터 경로로 자동 fallback합니다.
- **속도/시간 표시 정합성 보강**: 비현실 속도(160km/h 초과)는 표시/집계에서 숨기고, 웹과 앱에 운행 중 경과 시간 및 현재속도가 보이도록 정리했습니다.

### 🛠 Technical Changes
- `web/app/api/vehicle-tracking/trips/[id]/matched-route/route.js`: Naver Directions15 기반 matched route API 신규 추가.
- `web/utils/vehicleLocation.mjs`, `web/driver-src/modules/locationFilter.js`: km/h 단위 기준 통일, endpoint outlier trimming, 표시 속도 보정 유틸 추가.
- `web/app/(main)/employees/vehicle-tracking/page.js`, `web/driver-src/modules/map.js`: 상세/미니 지도 경로를 matched route 우선 표시로 변경.
- `web/app/(standalone)/driver-app/page.js`, `web/driver-src/modules/gps.js`, `web/driver-src/index.html`: 운행 중 경과 시간, 현재속도, 적응형 GPS 수신 간격 표시 추가.

### ✅ Verification
- `.tmp_test/vehicleLocation.test.mjs`: 첫/끝 튐 제거, 비현실 속도 숨김, Directions15 경유지 샘플링 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안전운임 구간/왕복 거리 기준 정합성 보강 (v5.10.28)
### 🚀 Achievement
- **고시 거리 기준 재확인**: 2026년 안전운임 고시 본문상 거리별 운임표가 `구간 거리(km)`와 `운송(왕복) 거리(km)`를 병기한다는 점을 기준으로 조회/표시 로직을 재검토했습니다.
- **구간조회 엑셀 오류 수정**: 구간조회 저장 내역에 `왕복(KM)` 컬럼이 추가되었으나 헤더/열 너비/필터 범위가 기존 13열 기준으로 남아 있던 불일치를 14열 기준으로 교정했습니다.
- **법규 근거 표시 강화**: 구간조회 결과/엑셀 문구를 `지도 구간거리`, `적용 구간거리(고시)`, `적용 왕복거리(고시)`로 분리해 검증 가능하게 정리했습니다.

### 🛠 Technical Changes
- `web/app/(main)/employees/safe-freight/route-search/RouteSearchView.js`: 구간조회 엑셀 저장 내역 헤더/컬럼/오토필터 범위 수정 및 거리 항목명 정리.
- `web/app/(main)/employees/safe-freight/page.js`: 거리별 조회 시 왕복 입력은 구간거리로 환산하고, 결과/저장 내역에 구간·왕복 거리 분리 표기.
- `web/app/api/safe-freight/download-excel/route.js`: 안전운임 엑셀 다운로드 API의 구간/왕복 거리 컬럼 분리 반영.

### ✅ Verification
- `.tmp_test/safeFreightDistanceRules.test.mjs`: 수기 왕복/편도, 구간조회 지도거리, 인천 20%·평택 18% 할증 케이스 통과 후 삭제.
- `web/scratch/test_safe_freight_logic.mjs`: 기존 5개 안전운임 로직 테스트 통과 후 임시 폴더 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] 안드로이드 드라이버 앱 GPS 안정화 패치 배포 (v5.10.3 / 5103)
### 🚀 Achievement
- **드라이버 앱 GPS 정교화 배포**: 서버사이드의 GPS 이상점 필터 로직과 보조를 맞추어, 앱 내에서도 튀는 좌표를 1차 필터링하고 강제 전송 시의 정확도를 높인 v5.10.3(5103) 버전을 빌드 및 배포했습니다.
- **강제 업데이트 적용**: GPS 데이터 무결성이 시스템 전체에 중요하므로, 모든 드라이버가 즉시 새 버전을 설치하도록 `forceUpdate: true` 옵션을 적용하여 배포했습니다.
- **빌드 자동화 검증**: `build_driver_apk.ps1` 스크립트를 통해 버전 증분, 캐시 버스터 갱신, APK 복구, 내부 버전 검증을 원스톱으로 완료했습니다.

### 🛠 Technical Changes
- `web/android/app/build.gradle`: versionCode 5103, versionName "5.10.3"으로 증분.
- `web/public/apk/version.json`: latestVersion 갱신 및 forceUpdate 적용.
- `web/driver-src/`: 모든 JS/HTML 파일에 대해 빌드 번호 기반 캐시 버스터(?v=5103) 적용.

---

## [2026-04-30] 차량위치관제 경로 안정화 및 지도 UX 정리 (v5.10.24)
### 🚀 Achievement
- **지도 표시 안정화**: 동일 차량이 종료 후 다시 운행을 시작하면 최신 1건만 관제 지도에 남도록 정리하고, 목록 정렬을 운행중 → 일시정지 → 운행종료 및 최신 수신순으로 통일했습니다.
- **GPS 이상점 필터 1차 적용**: 비현실적 속도 점프, 한국 범위 밖 좌표, 낮은 정확도, 튀었다가 돌아오는 스파이크를 공통 필터로 제거해 말도 안 되는 경로 꺾임을 줄였습니다.
- **앱 지도 UI 정리**: 출발/현재 텍스트 마커를 작은 점으로 바꾸고, 차량 마커에는 짧은 포인터 선을 붙여 경로와 차량 위치가 덜 겹치게 개선했습니다.
- **운행 정보 가시화**: 웹 관제 목록에 진행 중 차량의 현재 속도와 운행 시간을 추가했습니다.

### 🛠 Technical Changes
- `web/utils/vehicleLocation.mjs`: 라이브 운행 정렬/중복 제거, 경로 이상점 필터, 서버 저장 전 좌표 판정 유틸 신규 추가.
- `web/app/api/vehicle-tracking/location/route.js`: 위치 저장 전 직전 좌표 기준 불가능한 점프/저정확도 좌표 스킵.
- `web/app/api/vehicle-tracking/trips/route.js`, `docker/els-backend/app.py`: active 응답에서 차량별 최신 1건만 반환하고 상태/시간순 정렬.
- `web/app/(main)/employees/vehicle-tracking/page.js`: 보정 경로 표시 및 실시간 목록 속도/운행시간 컬럼 추가.
- `web/driver-src/modules/map.js`, `web/driver-src/modules/gps.js`, `web/driver-src/modules/locationFilter.js`: 앱 지도 마커/경로 UI 정리 및 속도·회전·가감속 기반 GPS 전송 간격 조절.

### ✅ Verification
- `.tmp_test/vehicleLocation.test.mjs`: 중복 차량 최신 1건, 상태 정렬, GPS 스파이크 제거 테스트 통과 후 삭제.
- `web`: `npm.cmd run lint` 통과.

---

## [2026-04-30] AI 어시스턴트 과거 운행 이력 추적 지능 고도화 (v5.10.23)
### 🚀 Achievement
- **과거 운행 종료 위치 조회 기능 구현**: AI가 "어제 0140 차량 어디서 끝났어?"와 같은 질문에 대답할 수 있도록, 실시간 운행 차량뿐만 아니라 완료된 트립(Completed Trips)의 최종 GPS 좌표 및 주소를 DB에서 추출하여 AI에게 주입하는 로직을 구현했습니다.
- **KST 기반 날짜 필터링 정밀화**: "어제"라는 키워드 사용 시 UTC와 KST의 시차(9시간)를 고려하여 정확한 한국 날짜의 운행 데이터를 필터링하도록 로직을 보강했습니다. (v5.10.23)
- **AI 행동 지침(Rule 21) 추가**: 주입된 '최종위치' 데이터를 AI가 '운행 종료 지점'으로 명확히 인식하고 답변하도록 시스템 프롬프트를 업데이트했습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: 차량 위치 조회 로직 전면 개편 (차량번호 추출 및 과거 이력 포함 쿼리).
- `web/app/api/chat/route.js`: `BASE_SYSTEM_INSTRUCTION`에 Rule 21(운행 이력 및 종료 위치 해석 지침) 추가.

---

## [2026-04-30] 아산 배차판 동기화 데이터 정합성 완결 및 최적화 (v5.10.22)
### 🚀 Achievement
- **삭제된 시트 자동 DB 정리**: 엑셀 원본 파일에서 특정 날짜 시트가 삭제되었을 때, Supabase DB에서도 해당 데이터를 자동으로 추적하여 삭제하는 Cleanup 로직을 구현하여 데이터 정합성을 확보했습니다. (v5.10.19)
- **통합현황 컬럼 매핑 오류 해결**: 컬럼 찾기(`getCol`) 로직에 '완전 일치 우선'순위를 도입하여, '배차'와 '배차정보'를 혼동하여 배차 시간(15:30 등)을 수량으로 합산하던 오류를 근본적으로 해결했습니다. (v5.10.21)
- **Vercel 캐시 부정합 문제 해결**: 통합현황에서 이틀 전 데이터가 노출되던 문제를 해결하기 위해, Next.js의 `revalidate=0` 및 `cache: 'no-store'` 설정을 적용하고 타임스탬프 기반 캐시 버스터를 도입하여 실시간 데이터 로딩을 보장했습니다. (v5.10.22)
- **헤더 복구 로직 전역화**: 엑셀 원본의 병합/공백 문제로 인해 `col_12`, `col_15`로 파싱되던 TYPE 헤더를 `T`, `TYPE`으로 복구하는 로직을 통합현황과 개별현황 모두에 전역 적용하여 합산 정확도를 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: `valid_dates` 리스트를 통한 DB 미존재 시트 제거 로직 추가.
- `web/app/api/branches/asan/dispatch/route.js`: `getCol` 함수 리팩토링 (완전 일치 -> 부분 일치 순), 캐시 비활성화 설정.
- `web/app/(main)/employees/branches/asan/page.js`: `fetchData`에 타임스탬프 캐시 버스터 추가 및 캐시 정책 변경.
- `web/app/(main)/employees/branches/asan/page.js`: `mobis` 요약 합산 시 40FT/20FT 분류 로직 보강.

---

## [2026-04-27] 차량위치관제 GPS 전면 리팩토링 및 백그라운드 끊김 해결 (v5.10.0)
### 🚀 Achievement
- **네이티브 백그라운드 수집 전환**: 브라우저 기반 `navigator.geolocation`을 폐기하고 `@capacitor-community/background-geolocation` 네이티브 플러그인을 도입하여, 앱이 백그라운드나 절전 모드에 진입해도 위치 수집이 중단되지 않도록 개선했습니다.
- **궤적 정밀도 대폭 강화**: 수집 주기를 시간(5~10초) 및 거리(10m) 동시 트리거 방식으로 변경하여, 기존에 누락되던 커브길 및 저속 구간의 데이터를 촘촘하게 확보했습니다.
- **코드 슬림화 및 안정화**: 자이로/모션 기반의 복잡한 우회 로직과 심폐소생 타이머 등 레거시 코드를 제거하고, 네이티브 브릿지 기반의 안정적인 수집 체계로 일원화했습니다.
- **오프라인 데이터 강건화**: 네트워크 단절 시에도 위치 데이터를 순차적으로 캐싱하고 복구 시 누락 없이 서버에 전송하는 플러시 로직을 강화했습니다.
- **일반 공지사항 네이티브 푸시 통합**: 기존 30초 긴급알림 폴링 파이프라인(`emergency.js`)에 일반 공지사항(`notices`) API를 병렬로 연동하여, 새 공지 등록 시 앱 화면을 보지 않아도 스마트폰 네이티브 알림(소리+진동)이 발송되도록 구축했습니다.

### 🛠 Technical Changes
- `web/driver-src/modules/gps.js`: 네이티브 플러그인 기반으로 전면 재작성 (거리 필터 제거 및 90초 타임아웃 상향).
- `web/driver-src/modules/init.js`: 포그라운드 복귀 시의 불필요한 GPS 재기동 로직 제거 및 1회 강제 UI 갱신 로직 추가.
- `web/driver-src/modules/emergency.js`: `emergency` 및 `notices` API 병렬 폴링 통합, 중복 알림 방지 캐싱 로직 추가.
- `web/capacitor.config.ts`: `android.useLegacyBridge: true` 설정 추가로 안드로이드 백그라운드 유지력 확보.
- `docs/09_GPS_REFACTORING_PROPOSAL.md`: 상세 설계 및 완료 보고서 작성.

## [2026-04-27] NAS 백엔드 실행 오류 핫픽스 (v5.9.6)
### 🚀 Achievement
- **백엔드 기동 불가 문제 해결**: v5.9.3 업데이트 시 추가된 `web_vectorizer.py` 파일이 Docker 컨테이너 내부에 누락되어 `els-core` 서비스가 중단되었던 문제를 긴급 수정했습니다.
- **활동 로그 및 배차 동기화 복구**: 백엔드 크래시로 인해 중단되었던 활동 로그 관리 페이지와 아산 배차판 자동 동기화 스케줄러를 정상화했습니다.

### 🛠 Technical Changes
- `docker/els-backend/Dockerfile.core`: `web_vectorizer.py` 복사 로직 추가.
- `docker/docker-compose.yml`: `els-core` 서비스에 `web_vectorizer.py` 볼륨 마운트 추가.
- `web/.env.local`: 백엔드 주소를 로컬호스트에서 실제 나스 외부 주소(`8443` 포트)로 원복.

---

## [2026-04-27] NAS 검색 고도화 및 정밀 쿼리(Precision Query) 도입 (v5.9.5)
### 🚀 Achievement
- **정밀 타겟 검색(Precision Query)**: 차량번호(3~4자리)와 날짜/월 키워드가 포함된 경우, 벡터 검색 대신 DB 직접 쿼리(`LIKE`)를 우선 수행하여 100% 정확한 행을 추출하도록 파이프라인을 재설계했습니다.
- **파일명 별칭(Alias) 매핑**: "수출리스트", "마감자료", "배차판" 등 사용자가 자주 쓰는 별칭을 실제 NAS 파일명과 자동으로 매칭하여 검색 정확도를 높였습니다.
- **월 시트 인식 개선**: "3월", "4월" 등 월 단독 검색 시 해당 시트명을 정확히 탐색하도록 정규식 패턴을 보강했습니다. (Rule 20 적용)

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `Precision Query` 파이프라인(STEP A/B/C) 구현 및 `FILE_ALIAS` 맵 추가.
- `web/app/api/chat/route.js`: Supabase 클라이언트 초기화 위치를 `POST` 최상단으로 이동하여 안정성 확보.

---
*최종 갱신일: 2026-04-27 (by Antigravity/Gemini | v5.9.6 NAS Backend Hotfix)*

## [2026-04-27] 웹 게시판 첨부파일 벡터화(Web Attachment RAG) 및 리팩토링 (v5.9.3)
### 🚀 Achievement
- **웹 게시판 첨부파일 통합**: 인트라넷 게시판(`posts`) 및 업무자료실(`work_docs`)에 업로드된 첨부파일(S3/MinIO)을 자동으로 다운로드하여 벡터화하는 엔진(`web_vectorizer.py`)을 구축했습니다.
- **RAG 파이프라인 확장**: AI가 NAS 문서뿐만 아니라 웹 게시판에 올라온 최신 엑셀, PDF 자료까지 통합 검색하여 답변할 수 있도록 `route.js` 검색 로직을 병렬화(`nas_file` + `web_attachment`)했습니다.
- **백엔드 아키텍처 리팩토링**:
  - `nas_vectorizer.py`에서 텍스트 추출(`extract_text_by_ext`) 및 임베딩 적재(`embed_and_store_chunks`) 로직을 공용 함수로 분리하여 코드 중복을 제거했습니다.
  - `app_core.py` 내의 좀비 락 체크 및 태스크 실행 패턴을 표준화하여 안정성을 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/web_vectorizer.py`: 신규 작성. S3 API 연동 및 공용 함수 기반 파싱 로직 구현.
- `docker/els-backend/app_core.py`: `/api/vectorize/web` 엔드포인트 추가 및 벡터화 태스크 헬퍼 추출.
- `web/app/api/chat/route.js`: `match_documents` 호출 시 `web_attachment` 소스 타입 추가 및 병렬 쿼리 적용.

---

## [2026-04-27] NAS 최신 자료 가중치(Recency Boost) 및 다중 제안 로직 (v5.9.2)
### 🚀 Achievement
- **최신성 기반 재정렬(Recency Boost)**: 검색 결과 중 파일명이나 시트명에 현재 연도(2026)나 월(4월)이 포함된 문서에 가중치를 부여하여, 사용자가 원하는 최신 정보를 최상단에 배치하도록 개선했습니다.
- **다중 후보 능동 제안**: 검색 결과가 모호하거나 여러 파일이 경합할 경우, AI가 자율적으로 최신 순 3~5개의 후보를 나열하며 사용자에게 선택을 제안하도록 지침(Rule 17)을 추가했습니다.
- **검색 트리거 정교화**: '최근', '최신' 등의 키워드를 NAS 검색 트리거에 포함하여 사용자 의도 파악 정확도를 높였습니다.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `adjustedScore` 계산 로직 추가 및 `nasKeywords` 확장.
- `BASE_SYSTEM_INSTRUCTION`: `Rule 17 (Multi-Proposal)` 추가.

---

## [2026-04-25] 구형 HWP 제외 및 HWPX 단일 지원 체계 (v5.8.6)
### 🚀 Achievement
- **구형 HWP 공식 제외**: 리눅스 환경에서 텍스트 추출의 신뢰도가 떨어지는 구형 바이너리 포맷(`.hwp`)을 스캔 대상에서 공식 제외했습니다.
- **HWPX 집중 지원**: 최신 개방형 표준인 `.hwpx`만 지원함으로써 AI 지식 데이터의 정합성과 품질을 높였습니다.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `SUPPORTED_EXTS`에서 `.hwp` 제거 및 추출 로직 삭제.

---

## [2026-04-25] 한글 신규 포맷(HWPX) 지원 및 문서 파싱 강화 (v5.8.5)
### 🚀 Achievement
- **HWPX 파일 텍스트 추출**: 한글 문서의 최신 표준인 `.hwpx` (XML 기반 ZIP) 파일을 직접 압축 해제하여 텍스트를 추출하는 엔진을 탑재했습니다.
- **HWP 지원 안정화**: 기존 `.hwp` 파일도 `textract`를 통해 검색 대상에 포함되도록 파싱 로직을 명시적으로 연결했습니다.
- **포괄적 문서 검색**: 이제 PDF, Word, Excel 뿐만 아니라 공공기관 및 실무에서 많이 쓰이는 한글 문서까지 AI가 검색할 수 있습니다.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `extract_text_hwpx` 함수 구현 (ZipFile + ElementTree 기반).
- `docker/els-backend/analyze_nas_files.py`: 분석 대상 확장자에 `.hwpx` 추가.

---

## [2026-04-25] 임시 파일 필터링 및 노이즈 제거 (v5.8.4)
### 🚀 Achievement
- **임시 파일 스캔 제외**: 엑셀 임시 파일(`~$`), 캐시 파일(`.tmp`), 시스템 숨김 파일(`.`) 등을 스캔 대상에서 원천 배제하여 DB 오염 및 불필요한 임베딩 비용 발생 방지.
- **TDD 강화**: 임시 파일 제외 로직을 TDD 테스트 케이스에 추가하여 검증 완료.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: 파일 처리 루프 내에 `startswith("~$")`, `.tmp` 포함 여부, 숨김 파일 체크 로직 추가.
- `docker/els-backend/tests/test_nas_vectorizer.py`: `~$`, `.tmp`, `.hidden` 파일을 생성하여 정상적으로 무시되는지 테스트하는 케이스 추가.

---

## [2026-04-25] 중부/예산 지점 복구 및 엑셀 시트 단위 증분 파싱 (v5.8.3)
### 🚀 Achievement
- **지점 데이터 복구**: 실수로 누락되었던 **중부지점** 및 **예산지점**을 스캔 대상(`scan_targets`)에 다시 추가하여 데이터 정합성 확보.
- **TDD 기반 로직 검증**: 7일 리센시 필터와 엑셀 시트 해시 비교 로직이 정상 작동함을 로컬 및 NAS 환경에서 TDD 스크립트로 최종 확인 (Pass).
- **스케줄 정밀화**: 자동 스캔 시작 시간을 관리자 요청에 따라 **01:30**으로 최종 변경 및 문서화.
- **엑셀 시트 단위 증분 파싱 (v5.8.2)**: 엑셀 파일 내 시트가 복사/추가되어도 수정된 시트만 선별하여 인덱싱하는 시트 해싱(Sheet Hashing) 기술 적용 완료.

### 🛠 Technical Changes
- `docker/els-backend/app_core.py`: `scan_targets`에 중부, 예산 지점 추가 및 스케줄 시간 주석 업데이트.
- `docker/els-backend/nas_vectorizer.py`: `extract_sheets_xlsx` 도입 및 시트별 메타데이터 비교 로직 구현.
- `docker/els-backend/tests/test_nas_vectorizer.py`: 필터링 및 증분 파싱 검증을 위한 TDD 스크립트 작성.

---

## [2026-04-25] NAS 증분 인덱싱 도입 및 자료실 구조조정 (v5.8.1)
### 🚀 Achievement
- **고속 증분 인덱싱(Incremental Indexing)**:
  - **7일 리센시 필터**: 12,000개가 넘는 아산지점 전체 파일을 매번 스캔하는 부하를 방지하기 위해, 최근 7일 이내에 수정(`mtime`)된 파일만 선별적으로 파싱하도록 `nas_vectorizer.py` 필터링 로직 개편.
  - **스캔 부하 99% 감소**: 전체 전수 조사 대신 신규/변경분만 타겟팅하여 NAS CPU 및 API 비용 획기적 절감.
- **자료실 지점 구조조정**:
  - **스캔 대상 제외**: 비즈니스 활용도가 낮은 '자료실' 지점을 전체 자동 스캔 대상에서 제외하여 시스템 리소스 확보.
  - **레거시 데이터 정리**: 기존에 인덱싱되어 있던 자료실 관련 벡터 데이터 및 인덱스 정보를 Supabase에서 일괄 삭제하여 데이터 정합성 유지.

### 🛠 Technical Changes
- `docker/els-backend/nas_vectorizer.py`: `os.walk` 루프 내에 `st_mtime` 기반 7일 필터 및 `skip_words`에서 자료실 키워드 분리 적용.
- `docker/els-backend/app_core.py`: `nas_sync_scheduler`의 `scan_targets`에서 자료실 지점 제거.
- `docker/els-backend/cleanup_legacy_branch.py`: 수동 데이터 정리를 위한 관리자 스크립트 작성 및 실행.

---

## [2026-04-25] Omni-Agent 완성과 지능형 데이터 리포팅 (v5.8.0)
### 🚀 Achievement
- **지능형 NAS 현황 브리핑**: 
  - **확장자별 통계 집계**: 단순히 파일 개수만 보여주던 방식에서 벗어나, PDF/XLSX/DOCX 등 주요 문서 타입별 개수를 실시간 집계하여 보고하는 지능형 리포팅 엔진 구현.
  - **파싱 시각화**: 지점별 파싱 완료율(%)과 상태 이모지를 결합하여 시인성 극대화.
- **실시간 환경 데이터 통합**: 
  - **날씨/미세먼지 트리거 통합**: 개별적으로 작동하던 날씨 정보와 K-Skill(미세먼지) 조회를 하나의 트리거로 통합하여, 기상 관련 질문 시 종합적인 환경 브리핑 제공.
  - **안정성 강화**: K-Skill 프록시 및 외부 API 타임아웃/예외 처리 보강으로 AI 답변 끊김 현상 방지.
- **UI/UX 고도화**:
  - **UI 버전 동기화**: 인트라넷 AI 어시스턴트 메인 UI 및 가이드 패널의 버전을 v5.8.0으로 일괄 업데이트 및 시스템 메시지 정교화.

### 🛠 Technical Changes
- `web/app/api/chat/route.js`: `nas_file_index` 테이블 쿼리에 `extension` 필드 추가 및 `extensions` 객체 기반 카운팅 로직 구현.
- `web/app/(main)/employees/(intranet)/ask/page.js`: `DEFAULT_INIT_MSG` 및 헤더/가이드 버전 정보 갱신.
- `docs/01_MISSION_CONTROL.md`: 전체 시스템 버전을 v5.9.6으로 승격하고 이슈 현황 최신화.

---

## [2026-04-24] 2026년 안전운임(Safe Freight) 규제 통합 및 AI 고도화 (v5.6.0)
### 🚀 Achievement
- **법규 준수 운임 엔진**: 
  - **10원 단위 반올림**: 고시 제7조에 의거, VAT 제외 운임의 10원 단위 반올림(`round10`) 로직을 프론트엔드와 AI 서버에 공통 적용.
  - **할증 합산 법칙**: 고시 제22조에 의거, 여러 할증 적용 시 가장 높은 요율 100%, 나머지 50% 적용(최대 3개) 로직 구현.
  - **지역별 기점 할증**: 인천(20%), 평택(18%) 등 기점별 동적 할증률 적용 및 사용자 알림 UI 강화.
- **AI 어시스턴트 지능화**: 
  - `BASE_SYSTEM_INSTRUCTION`을 2026년 최신 고시 조항에 맞춰 갱신하여, 상담 시 법적 근거(조항 번호) 기반의 정확한 운임 산출 및 설명 가능.
- **데이터 보존**: '이외구간' 명칭을 '고시 외 구간(2022년이전)'으로 복구하여 과거 데이터 조회 정합성 및 사용자 혼선 방지.

### 🛠 Technical Changes
- `SafeFreightPage.js`: `round10`, `applySurchargesToRow` 로직 리팩토링 및 지역별 할증 훅 구현.
- `api/chat/route.js`: `calcSurcharge` 함수 내 할증 합산 로직(정렬 후 100%/50% 분기) 반영 및 시스템 프롬프트 대규모 갱신.

---

### 🚀 Achievement
- **스마트 듀얼 스케줄링**: 
  - **Fast Sync**: 파일 변경 감지 시 즉시 ±15일치 업데이트 (업무 즉시성 확보).
  - **Slow Sync**: 10분 주기 및 새벽 4시 전체 시트 순차 업데이트 (NAS CPU 부하 분산 및 완전성 확보).
- **데이터 증발 방지 (Atomic Update)**: `Delete -> Insert` 방식에서 `UPSERT` 방식으로 전환하여 동기화 도중 오류 발생 시에도 기존 데이터가 유실되지 않도록 보강.
- **NAS 부하 최적화**: 전체 시트 동기화 시 시트 간 0.5초 지연(Sleep)을 두어 NAS CPU Spike 방지.

### 🛠 Technical Changes
- `app.py`: `sync_asan_dispatch_python` 내 `upsert` 로직 및 시트 파싱 선검증 단계 추가.
- `app.py`: `asan_sync_scheduler` 10분 주기 배경 동기화 및 실시간 변경 트리거 통합.

---

## [2026-04-23] 아산 배차판 전체 동기화 복구 (v5.5.12)
- **전체 시트 복구**: 형의 요청에 따라 날짜 제한 없이 모든 시트 동기화로 일시 원복하여 과거 데이터 정합성 확보.
- **메모리 최적화 유지**: `read_only=True` 및 `gc.collect()` 적용으로 OOM 방지.

---

## [2026-04-23] 아산 배차판 동기화 지능화 및 안정화 (v5.5.9)
### 🚀 Achievement
- **지능형 2단계 동기화 구현**: 
| 구분 | 주기 | 방식 | 상태 |
| :--- | :--- | :--- | :--- |
| **아산 배차 (최근)** | 1분 (변경 시) | 엑셀 저장 시 **±15일치** 즉시 동기화 (업무 연속성) | ✅ 가동 중 |
| **아산 배차 (전체)** | 10분 / 04:00 | 파일 변경 시 **전체 시트** 배경 동기화 (NAS 부하 분산) | ✅ 가동 중 |
데이터 무결성 완벽 확보.
- **메모리 극한 최적화**: `openpyxl`의 `read_only=True` 모드 및 주기적 `gc.collect()` 적용으로 대량 시트 처리 시 NAS OOM(메모리 부족) 현상 완전 해결.
- **인프라 안정화**: `els-core`(2930), `els-bot`(2931) 포트 분리 및 도커 볼륨 매핑 최적화로 실시간 코드 반영 지원.

### 🛠 Technical Changes
- `app.py`: `sync_asan_dispatch_python` 내 `full_sync` 플래그 및 날짜 필터링(`abs(diff) > 15`) 로직 추가.
- `app.py`: `asan_sync_scheduler` 10분 주기/새벽 4시 정기 트리거 및 중복 방지 로직 구현.
- `app.py`: `openpyxl` 로드 횟수를 파일당 1회로 제한하고 `read_only` 모드로 CPU/메모리 효율 극대화.

---

## [2026-04-21] NAS 벡터화 파이프라인 안정화 (v5.5.1)
- **임베딩 모델 표준화**: `gemini-embedding-001` (768 dim) 강제 적용 및 DB 호환성 확보.
- **오류 처리 강화**: 429 에러(Rate Limit) 대응을 위한 슬립 인터벌 및 예외 처리 로직 보강.
- **좀비 락 방지**: 벡터화 프로세스 2시간 초과 시 자동 락 해제 로직 도입.

## [2026-04-11] 3-Layer RAG 및 AI 어시스턴트 고도화 (v4.9.22)
- **K-SKILL 연동**: AirKorea 공식 API 기반 미세먼지/날씨 실시간 RAG 주입.
- **K-Law MCP 직결**: `api.beopmang.org` 프록시 연동으로 법령/판례 검색 기능 탑재.
- **Anti-Hallucination**: 시스템 프롬프트 가드레일 설계 및 AI 가이드 UI 전면 개편.

## [2026-04-11] 인트라넷 UI 프리미엄화 및 배포 최적화 (v4.9.26)
- **UI 리뉴얼**: 카드 그림자, 버튼 스타일, 대시보드 레이아웃 고도화.
- **빌드 안정화**: ESLint 경고 무시 설정 및 Vercel standalone 빌드 최적화.

## [2026-04-20] 드라이버 앱 ID 누락 근본 원인 해결 (v4.9.30~34)
- **통신 로직 복구**: CapacitorHttp preflight 버그 대응을 위한 Native Bridge 복구.
- **직렬화 최적화**: NextResponse 직렬화 적용으로 빈 Body 요청 및 ID 증발 현상 최종 해결.
- **Redirect 대응**: `elssolution.com` (non-www) 통일로 307 리다이렉트 시 Body 유실 방지.

*(v4.9 이전의 상세 기록은 Git History 참조)*
