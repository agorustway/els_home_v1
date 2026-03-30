# ELS Solution 마이그레이션 계획서 (Personal -> Company)

> **목표**: 기존 개인 계정에 연동된 모든 서드파티 서비스(Supabase, Vercel, Naver Map 등) 및 소스코드 저장소를 신규 회사/법인 계정으로 100% 이관하고, 도메인을 `elssolution.net`으로 안전하게 전환한다.

## 1. 마이그레이션 사전 준비 (Phase 1)
- [ ] **통합 이메일 생성**: 모든 서비스 가입 시 사용할 공용 이메일 준비 (예: `admin@elssolution.net` 또는 `admin.elssolution@gmail.com`).
- [ ] **신규 도메인 구입**: 가비아, 호스팅케이알 등에서 `elssolution.net` 도메인을 구입.
- [ ] **신규 서비스 가입**: 해당 통합 이메일을 사용하여 GitHub, Vercel, Supabase, 네이버 클라우드, 카카오/네이버 디벨로퍼스 가입 진행.

## 2. API 키 및 연동 서비스 재발급 (Phase 2)
### A. 지도 및 로그인 API
- [ ] **Naver Cloud Platform**: 신규 앱을 등록하고 **Naver Map API (Web/Mobile Dynamic Map, Geocoding)** 키 발급. 도메인은 `elssolution.net`으로 허용 등록.
- [ ] **Kakao Developers**: 신규 내 애플리케이션 생성 후 REST API 🔑, Client Secret 발급. [Web 도메인: `https://www.elssolution.net`], [Redirect URI: Supabase 인증용 URI] 
- [ ] **Naver Developers**: 네이버 로그인 API 재가입 후 Client ID/Secret 발급.
- [ ] **오피넷(OPINET)**: 유가 API 사용자 재가입 및 API Key 발급.

### B. 소스코드 형상관리 (GitHub)
- [ ] 신규 GitHub Organization 또는 계정 생성.
- [ ] 개인 레포지토리(`agorustway/els_home_v1`)를 신규 계정으로 **Transfer(소유권 이전)** 하거나, 새로 Push.
- [ ] NAS 백엔드를 위한 GitHub Personal Access Token (PAT) 신규 발급.

## 3. 데이터베이스 & 인증 이관 (Supabase) (Phase 3)
- [ ] **신규 프로젝트 생성**: 신규 Supabase 계정에서 새 프로젝트 생성.
- [ ] **스키마 및 데이터 백업**: 개인 Supabase에서 덤프 스크립트 실행 (Supabase CLI 사용 권장).
    ```bash
    # 구 계정 데이터/스키마 백업 추출
    supabase db dump -f roles.sql -U postgres --role-only
    supabase db dump -f schema.sql -U postgres --schema-only
    supabase db dump -f data.sql -U postgres --data-only
    ```
- [ ] **데이터 복원 & 연동**: 신규 Supabase에 SQL 덤프 삽입. Storage 버킷(`avatars`, `docs` 등) 재생성, 다운로드 후 재업로드.
- [ ] **소셜 로그인 세팅**: 새로 발급받은 Kakao, Naver Client ID를 신규 Supabase의 Auth Provider 설정에 입력.

## 4. 프론트엔드 호스팅 및 도메인 연결 (Vercel) (Phase 4)
- [ ] **Vercel 프로젝트 생성**: 신규 Vercel 계정에서 신규 GitHub 레포지토리를 Import.
- [ ] **환경변수(.env) 이식**: 신규 발급받은 Supabase URL/KEY, 네이버/카카오 키, 오피넷 키 등을 Vercel Environment Variables에 전부 박아넣음.
- [ ] **기존 환경변수 확인 (교체 목록)**:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`
  - `OPINET_API_KEY`
  - `NEXT_PUBLIC_KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`
  - `NEXT_PUBLIC_NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- [ ] **도메인 연결**: Vercel Domains 탭에서 `elssolution.net` 및 `www.elssolution.net` 추가 후, 도메인 구입처 DNS 설정에서 Vercel의 네임서버/A레코드 반영.

## 5. 안드로이드 앱 및 백엔드(NAS) 갱신 (Phase 5)
- [ ] **기사님 앱(Driver App) 상수 변경**: `web/android/app/src/main/assets/public/app.js` 등 안드로이드 내부에서 호출하는 `BASE_URL` 상수 및 API 엔드포인트를 `https://www.nollae.com`에서 `https://www.elssolution.net`으로 즉시 변경.
- [ ] **앱 재배포**: `v4.3.X` 버전으로 클린 빌드 후 APK 새로 추출 ('앱을 무조건 업데이트' 하도록 공지).
- [ ] **통합 NAS 점검**: 시놀로지 NAS Docker 환경 내 `.env`의 Supabase 및 Github Token을 신규 발급본으로 교체한 뒤 `restart_backend.ps1` 스크립트로 백엔드 재시작.

## 6. 완료 및 기존 서비스 해지 (Rollback/Cleanup)
- [ ] 모든 서비스(안드로이드 봇, ETRANS 조회, 모바일 맵 연동, 유가조회) 정상작동 확인.
- [ ] 기존 Vercel (`nollae.com`) 다운타임 예방차 도메인 리다이렉트(301)를 일주일간 유지해 줌.
- [ ] 이전 개인 프로젝트(Supabase, Vercel) 삭제 혹은 Pause 전환.
