# 📡 05. NAS API SPECIFICATION (나스 통신 규약)

이 문서는 ELS Solution의 고부하 트래픽을 처리하는 **나스(Internal NAS) 백엔드**의 API 규격 및 데이터 흐름을 강박적으로 기술합니다.

## 🚀 AI/IDE Quick Scan (API Snapshot)
- **Base URL**: `http://192.168.0.4:5000` (내부망)
- **Protocol**: HTTP/JSON (RESTful)
- **DB Sink**: Supabase PostgreSQL (Direct Connection)
- **Proxying**: S3 MinIO, WebDAV, Supabase Storage Bridge

---

## 🏗️ 1. 활동 로그 및 보안 (Logging & Auth)

### [POST] `/api/logs`
**전역 활동 로그 수집**
- **Usage**: 모든 사용자 액션(클릭, 페이지 이동, 사진 보기 등)을 수집.
- **Body**:
```json
{
  "user_email": "string",
  "action_type": "string",
  "path": "string",
  "metadata": "object"
}
```
- **Process**: `user_activity_logs` 테이블에 즉시 INSERT.

---

## 📡 2. 실시간 관제 및 추적 (Vehicle Tracking)

### [GET] `/api/vehicle-tracking`
**실시간 차량 위치 목록 조회**
- **Usage**: 대시보드에서 모든 운전원의 최신 위치와 상태를 한눈에 파악.
- **Response**: `Array<VehicleObject>` (24시간 내 데이터 및 최신 위치 병합)

### [GET] `/api/vehicle-tracking/trips/[id]/locations`
**특정 트립의 이동 경로 기록 조회**
- **Query**: `step` (샘플링 간격), `limit`
- **Output**: 좌표 리스트 (LineString 생성용 데이터)

---

## 📂 3. 파일 및 스토리지 프록시 (Storage Proxy)

### [GET] `/api/nas/preview`
**나스 로컬 저장소 파일 프리뷰**
- **Usage**: 웹 워크 독스(Work-Docs) 등 나스에 저장된 파일을 웹에서 직접 보기.
- **Header**: `Content-Type` 자동 판별 (PDF, Image, Video)

### [GET/POST] `/api/s3/files`
**S3 (Supabase / MinIO) 데이터 릴레이**
- **Usage**: AWS/Supabase 등 외부 스토리지 용량 부하를 나스가 대신 받아 처리.
- **Feature**: 업로드 URL 생성, 파일 바이너리 스트리밍.

---

## 🛠️ 4. 데이터 내보내기 (Export API)

### [GET] `/api/vehicle-tracking/trips/[id]/excel`
**운행 기록 엑셀 다운로드**
- **Format**: `openpyxl` 기반 정밀 서식 적용.

### [GET] `/api/vehicle-tracking/trips/[id]/zip`
**운행 중 촬영된 모든 사진 압축 다운로드**
- **Process**: S3에서 사진을 스트림으로 긁어모아 인메모리 ZIP 생성 후 전송.

---

## 🚨 운영 시 주의사항 (Developer Guardrails)
- **CORS 설정**: 나스 Flask 서버는 `nollae.com` 도메인으로부터의 요청만 정식 허용합니다. (Vercel IP 대역폭 인지)
- **Timeout**: 무거운 작업(ZIP 생성 등)은 최대 60초까지 소요될 수 있으므로 클라이언트(Next.js)단에서 타임아웃 처리가 필요합니다.
- **Logging**: 모든 `/api/*` 요청은 자동으로 로그 서버를 통과하여 기록됩니다.

---
*최종 개량일: 2026-04-01 (by Antigravity)*
