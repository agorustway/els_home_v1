---
description: ELS 드라이버 APK 배포 워크플로우
triggers:
  - "배포해줘"
  - "배포"
  - "/deploy"
---

형, 배포 시작할게!

## 배포 절차

### 1. 버전 증분
`web/android/app/build.gradle` 에서 **versionCode +1, versionName 마이너 +0.0.1** 올리기.
- 이 파일이 단일 진실 소스 — 여기만 바꾸면 나머지는 스크립트가 전부 자동 처리.
- `assets/public/`, `store.js`, `version.json` 등 절대 직접 편집하지 말 것.

### 2. 빌드 스크립트 실행 (원스톱)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1
```
이 스크립트가 자동으로 처리하는 것:
- `driver-src/modules/store.js` — APP_VERSION, BUILD_CODE 갱신
- `driver-src/index.html`, `app.js`, `modules/*.js` — ?v=BUILD_CODE 전체 치환
- `web/public/apk/version.json` — latestVersion, versionCode, downloadUrl 갱신
- `npx cap sync` — driver-src/ → assets/public/ 복사
- `gradlew clean assembleDebug` — 클린 빌드
- **APK 배포 경로 복사** — `app-debug.apk` → `web/public/apk/els_driver.apk`
- **자동 검증** — 현재시각, 빌드시각, 배포시각 비교 + APK 내부 버전 확인

### 4. 현황판 및 개발로그 갱신
- `docs/01_MISSION_CONTROL.md` — Current Build 버전 업데이트
- `docs/02_DEVELOPMENT_LOG.md` — 배포 내역 한 줄 추가

### 5. 커밋 및 푸시
```
git commit -F commit_msg.txt  # 한글 커밋, commit_msg.txt 삭제
git push
```

## 주의사항
- `npx cap sync` 단독 실행 금지 (스크립트 안에서만)
- 강제 업데이트 배포 시: `-ForceUpdate` 플래그 추가
