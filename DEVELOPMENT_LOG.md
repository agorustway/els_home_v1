# Development Log

## [2026-01-23] - S3(MinIO) 연결 성공 및 UI/UX 대규모 개선

### 🚀 핵심 성과
- **S3(MinIO) 연결 완전 정복**: ISP 포트 차단(9000번 대) 문제를 HTTPS 역방향 프록시(443)와 WebSocket 헤더 설정을 통해 해결.
- **관리자 권한 관리 모바일화**: 테이블 형태의 레이아웃을 카드 슬롯(Card View) 방식으로 전면 개편하여 모바일 조작 편의성 극대화.
- **UI/UX 폴리싱**: 전사 메인 레이아웃 패딩 최적화, 헤더 유격 수정, 푸터 사이즈 축소 등 프리미엄 디자인 완성.

### 🛠️ 작업 상세
#### 1. 인프라 및 API
- `.env.local`: `NAS_ENDPOINT`를 HTTPS 프록시 주소로 설정.
- `lib/s3.js`: S3 클라이언트 설정 최적화 및 `getFileBufferFromS3` 추가로 이미지 서빙 안정화.
- `app/api/s3/files/route.js`: POST(업로드), GET(프록시 다운로드) 로직 구현.

#### 2. 프론트엔드 개선
- `app/admin/users/page.js`: 모바일용 카드 뷰 추가 및 반응형 레이아웃 적용. (Intranet 공통 모듈 연동)
- `app/employees/webzine/page.js`: S3 이미지 로딩 버그 수정 및 썸네일 경로 로직 최적화.
- `webzine/[id]/page.js`: 상세보기에서 Cloud 이미지 경로 인식하도록 수정.

#### 3. 기타 수정
- 소위원회 및 회사소개 페이지 서브메뉴 유격(20px) 제거.
- 푸터 높이 및 여백 축소.

### ⚠️ 주의사항 및 향후 과제
- **시놀로지 설정 유지**: 역방향 프록시에서 `X-Forwarded-Proto` 헤더와 `192.168.0.4` 대상 세팅이 바뀌면 S3 업로드가 바로 막힐 수 있음.
- **Webzine 이미지**: 이제 `Webzine/`으로 시작하는 모든 경로는 S3 Proxy API를 거쳐야 함.

---

## [2026-01-23] - 오픈 준비: 사용자 활동 로그(Audit Log) 시스템 구축

### 🚀 핵심 성과
- **전사 로그 시스템 도입**: 모든 사용자의 행위(이동, 클릭, 다운로드)를 실시간으로 기록하여 보안 및 운영 도구 확보.
- **3년 보관 정책 수립**: 서비스 오픈 가이드에 따라 로그 데이터를 최소 3년 동안 보관하도록 설계.

### 🛠️ 작업 상세
#### 1. 데이터베이스 (`web/supabase_user_logs.sql`)
- `user_activity_logs` 테이블 생성: `user_id`, `action_type`, `path`, `metadata`, `created_at` 등 포함.
- **보안**: RLS 설정을 통해 일반 사용자는 자기 로그만 생성 가능하고, 조지는 오직 `Admin` 권한자만 가능하도록 격리.

#### 2. 로깅 모듈 (`utils/logger.js`, `utils/loggerServer.js`)
- 클라이언트와 서버 양측에서 로그를 남길 수 있는 통합 유틸리티 구현.

#### 3. 자동 추적 (`components/ActivityLogger.js`)
- `RootLayout`에 탑재되어 페이지 뷰(URL) 및 중요 클릭 이벤트를 비동기로 자동 기록.

#### 4. 파일 접근 로깅 (`api/nas/preview`, `api/s3/files`)
- NAS 및 S3 파일 다운로드/조회 시 서버 레벨에서 정확한 파일명과 함께 로그 생성.

### 📋 운영 가이드 (보관 및 삭제)
- **보관 기한**: 3년 (2026~2029)
- **삭제 방법**: Supabase SQL Editor를 통해 `INTERVAL '3 years'` 기준 삭제 쿼리 권장.
