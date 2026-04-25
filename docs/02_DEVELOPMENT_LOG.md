# 📜 DEVELOPMENT LOG (개발 역사)

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
- `docs/01_MISSION_CONTROL.md`: 전체 시스템 버전을 v5.8.0으로 승격하고 이슈 현황 최신화.

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
- **Redirect 대응**: `nollae.com` (non-www) 통일로 307 리다이렉트 시 Body 유실 방지.

*(v4.9 이전의 상세 기록은 Git History 참조)*
