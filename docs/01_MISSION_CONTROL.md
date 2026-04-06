# ELS MISSION CONTROL
> 마지막 업데이트: 2026-04-07 (KST)

## 📦 최신 배포 정보
- **Current Build**: `v4.9.7` (versionCode 497)
- **APK**: `web/public/apk/els_driver.apk`
- **Vercel**: `nollae.com` (main 브랜치 자동 배포)
- **Repo**: main 브랜치 up-to-date

## ⚠️ APK 빌드 절차 (필독)
```
# ✅ 올바른 APK 빌드
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1

# ❌ 절대 금지 (흰화면/캐시 지옥 유발)
npx cap sync   ← 단독 실행 금지
web/android/app/src/main/assets/public/ ← 직접 편집 금지
```
드라이버 앱 소스 = `web/driver-src/` | 버전 소스 = `build.gradle` 단일 진실

---

## 🚧 IN-PROGRESS — v4.9.8 컨테이너 조회 잠금 해제 개선 (2026-04-07)

### ✅ 해결된 항목 (v4.9.8)
| 항목 | 수정 내용 | 위치 |
|------|----------|------|
| 조회 잠금 미해제 (핵심) | `generate()` 내 `try/finally`로 스트림 중단 시에도 잠금 해제 보장 | `app_bot.py`, `app.py` |
| 좀비 타임아웃 과다 | 20분 → 5분으로 단축 (capabilities 체크 시 자동 해제) | `app.py`, `app_bot.py` |
| 유휴 잠금 미해제 | 마지막 개별 조회 완료 후 3분 무활동 시 자동 해제 | `app_bot.py`, `app.py` |
| 프론트 대기 시간 과다 | "다른 직원 조회 중" 최대 대기: 25분 → 6분 | `page.js` |
| stop-daemon 누락 | `app_bot.py`에 `stop-daemon` 엔드포인트 추가 | `app_bot.py` |

### ❌ 미해결 항목

#### 1. NAS S3 사진 프록시 500 에러
- **증상**: 운행 사진 업로드는 성공하나, 일지에서 사진 조회 시 깨짐(X표시)
- **진단 결과**: `GET /api/vehicle-tracking/photos/view?key=...` → NAS S3 `GetObject` 실패 500
- **확인 필요**: Vercel Functions 로그, NAS MinIO 서비스 상태

---

## ⏳ 다음 할 일
- [ ] NAS 도커 재빌드/재시작 (`app.py`, `app_bot.py` 변경 반영)
- [ ] 컨테이너 조회 실 테스트 (잠금 해제 정상 동작 확인)
- [ ] NAS 사진 프록시 500 에러 원인 조사

## 🗺️ 주요 상세 문서
- **[02. DEVELOPMENT LOG](./02_DEVELOPMENT_LOG.md)**
- **[04. MASTER ARCHITECTURE](./04_MASTER_ARCHITECTURE.md)**
- **[05. NAS API SPEC](./05_NAS_API_SPEC.md)**
- **[07. RUNBOOK](./07_RUNBOOK.md)**

---
*최종 갱신: 2026-04-07 (by Antigravity/Claude Opus 4.6)*
