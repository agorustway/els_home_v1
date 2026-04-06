---
description: ELS Driver App 자동 배포 및 APK 빌드 (v4.1.7+)
---

// turbo-all

형, 배포 작업을 시작할게! 소스 동기화 후 안드로이드 APK 빌드부터 깃허브 푸시까지 한 방에 처리할 거야. 🫡

1. **버전 증분**
   * `web/public/apk/version.json`, `web/android/app/build.gradle`, `web/android/app/src/main/assets/public/modules/store.js`에서 앱 버전을 1단계 올릴 거야.
2. **웹뷰 Cache Buster(캐시 무효화) 버전 일치화**
   * `index.html`, `app.js` 내부에 하드코딩된 `?v=x.x.x` 값들을 새 버전으로 일괄 치환(Replace)할 거야. (이걸 안 하면 안드로이드 캐시 때문에 예전 코드가 돌아감!)
3. **Android APK 빌드 (Debug)**
   ```powershell
   cd web/android; ./gradlew.bat assembleDebug
   ```
4. **APK 배포 경로 복사**
   ```powershell
   Copy-Item web/android/app/build/outputs/apk/debug/app-debug.apk web/public/apk/els_driver.apk -Force
   ```
5. **현황판 및 개발로그 자동 업데이트**
   *   `docs/01_MISSION_CONTROL.md`, `docs/06_DEV_LOG.md`를 최신 버전 정보로 갱신할게.
6. **커밋 및 푸시**
   ```powershell
   git add .; git commit -m "[vX.X.X] 드라이버 앱 빌드 및 자동 배포"; git push
   ```

배포 완료 보고는 한 번에 몰아서 해줄게! 🔥💪
