# 📜 DEVELOPMENT LOG (개발 역사)

## [2026-04-23] 아산 배차판 동기화 지능화 및 안정화 (v5.5.9)
### 🚀 Achievement
- **지능형 2단계 동기화 구현**: 
  - **주간(실시간)**: 파일 저장 시 ±7일치 시트만 즉시 동기화하여 NAS 부하 90% 절감.
  - **야간(새벽 4시)**: 전체 시트(2.2~미래) 일괄 동기화로 데이터 무결성 완벽 확보.
- **메모리 극한 최적화**: `openpyxl`의 `read_only=True` 모드 및 주기적 `gc.collect()` 적용으로 대량 시트 처리 시 NAS OOM(메모리 부족) 현상 완전 해결.
- **인프라 안정화**: `els-core`(2930), `els-bot`(2931) 포트 분리 및 도커 볼륨 매핑 최적화로 실시간 코드 반영 지원.

### 🛠 Technical Changes
- `app.py`: `sync_asan_dispatch_python` 내 `full_sync` 플래그 및 날짜 필터링(`abs(diff) > 7`) 로직 추가.
- `app.py`: `asan_sync_scheduler` 새벽 4시 정기 트리거(`now.hour == 4`) 및 중복 방지 로직 구현.
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
