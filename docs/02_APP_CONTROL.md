# 📱 ELS 운송관리 네이티브 앱 개발 현황판 (APP_MISSION_CONTROL)

**마지막 업데이트**: 2026-03-25 (v4.0.0 완전 재구축)
**목적**: 기존 `nollae.com/driver-app` 웹뷰(WebView) 기반 PWA 방식에서 벗어나, 완전히 로컬에서 구동되는 독립형 안드로이드 네이티브(Standalone Native) 앱에 대한 개발 목표와 아키텍처, 작업 이력을 집중 관리하는 문서.

---

## 1. 🎯 네이티브 전환의 핵심 이유 (The "Why")
- **오프라인 동작 (Offline Capability)**: 산속, 터널 등 인터넷이 끊긴 상태에서도 빈 화면(웹 통신 오류)이 뜨지 않고 앱 자체 UI는 온전히 동작해야 함. 데이터 저장은 로컬에 큐잉하고 연결 시 재전송.
- **안정적인 위치 추적 (Background Location Tracking)**: 단순 웹 알림/오디오 꼼수를 넘어, 안드로이드 정식 `Foreground Service`를 사용하여 화면을 꺼도 앱이 죽지 않게 함.
- **TMAP 식 플로팅 위젯 (System Alert Window)**: 네비게이션 사용을 위해 앱을 백그라운드로 전환 시 시스템 위에 떠 있는 위젯 통제. (웹에서는 불가능한 권한)
- **앱 전용 UX (Native Feel)**: 웹 느낌이 나는 팝업/얼럿, 페이지 이동(로딩)을 제거. SPA를 넘어선 순수 오프라인 로컬 HTML 에셋 로딩 방식을 채택.

---

## 2. 🛠 기술 스택 (App Stack)

| 구분 | 기술 | 설명 |
|------|------|------|
| **코어 엔진** | Capacitor 8.x | 웹 기술을 네이티브 코드로 매핑 |
| **개발 언어 (앱 로직)** | Vanilla HTML/CSS/JS | React/Next.js 의존성을 완전히 제거하여 로컬 빌드 |
| **빌드/동기화** | `npx cap sync android` | `out/` 폴더의 에셋을 안드로이드 `assets/public/`에 복사 |
| **로컬 저장소** | `localStorage` | 기사 기본 정보 보존. 향후 오프라인 큐잉 시 SQLite 고려 |
| **안드로이드 네이티브** | Java (`MainActivity.java`, `Androidmanifest.xml`) | 오버레이(Floating) 및 Foreground Service 직접 구현 |
| **백엔드 통신** | Fetch API | `nollae.com/api/vehicle-tracking`의 기존 백엔드 재사용 |

---

## 3. 🚨 집중 작업 이력 및 할 일 (Milestones)

### ✅ Phase 1: 로컬 네이티브 전환 기초 (완료)
- [x] **URL 로딩 제거**: `capacitor.config.ts`에서 웹 주소를 지우고 패키지 내장(`out/` -> `assets/public/`) 파일을 읽게 변경.
- [x] **단일 페이지 구축**: `app.js`, `style.css`, `index.html` 단독 작성 (Vercel 의존성 제거).
- [x] **초기 구동 플로우 확립**: [오버레이/위치/카메라/알림 권한 설정] → [프로필 등록] → [메인 화면].
- [x] **연락처 기반 자동 복구 (Autofill)**: 프로필 등록 시 전화번호를 백엔드(`route.js`)와 대조해 이름/차량/ID 자동 입력 및 양방향 동기화(Upsert) 구현.

### ✅ Phase 2: 네이티브 기능 연동 최적화 (완료)
- [x] **Foreground Service 궤도 안착**: `NotificationChannel`을 통해 앱이 죽지 않고 백그라운드에서도 GPS(`https://nollae.com/api/vehicle-tracking/locations`) 실시간 전송.
- [x] **플로팅 위젯 양방향 제어(Two-Way)**: `OverlayPlugin.java`의 `BroadcastReceiver`를 통해 안드로이드 네이티브 버튼(일시정지, 종료) 신호를 `app.js`로 쏘아 TMAP 위에서도 즉시 앱 제어 가능 및 상태(색상) 자동 변환 처리.

### ✅ Phase 3: UI 안정화 및 통신 브릿지 확보 (완료)
- [x] **그리드 기반 UI 개편**: `display: grid`를 도입하여 소형 기기에서도 입력 필드가 잘리거나 겹치지 않도록 레이아웃 정예화.
- [x] **CORS 타파 (Capacitor Http)**: 브라우저 `fetch`가 아닌 네이티브 Http 브릿지를 통한 서버 통신(`smartFetch`) 기능을 구현하여 CORS 및 네트워크 정책 이슈 원천 차단.
- [x] **초기화 타이밍 보정**: 브릿지 로딩 대기 로직(0.5s)을 통해 `Overlay` 등 네이티브 플러그인 로드 안정성 확보.

### ✅ Phase 4: v4.0.0 완전 재구축 (2026-03-25 완료)
- [x] **Git 롤백 정책 수립**: `web/.gitignore`와 `web/android/.gitignore`에서 앱 에셋 제외 해제 → 이제 `git checkout`으로 롤백 가능
- [x] **PIP 완전 제거**: 화면 꺼짐 시 GPS/타이머 초기화 문제 근본 해결
- [x] **오버레이 위젯 재설계**: 3줄 표시 + 클릭복귀, 버튼 없음, Android 16 3단계 권한 유도
- [x] **GPS 유동적 수신**: 속도+자이로스코프 기반, WakeLock PARTIAL, 웹뷰+서비스 이중 수집
- [x] **긴급알림 시스템**: EmergencyPlugin, emergency API, 네이티브 고우선 알림
- [x] **UI 완전 재설계**: 화이트/각진/댄디, 4탭 구조, 설정 인라인

### 🚨 남은 과제
- [ ] **오프라인 데이터 큐잉**: 네트워크 단절 시 로컬 큐잉 → 재연결 시 자동 전송
- [ ] **긴급알림 발송 UI**: 웹 차량관제 페이지에 관리자 발송 버튼 추가

---

## 4. 📦 앱 빌드 및 수동 배포 (업데이트) 가이드
StandAlone (APK) 앱은 구글 플레이스토어를 거치지 않고 직접 수동 배포(OTA 방식)를 수행합니다.

- **APK 실제 서비스 경로**: `C:\Users\hoon\Desktop\els_home_v1\web\public\apk\els_driver.apk`
  - 안드로이드 스튜디오 빌드(Build Bundle/APK) 결과물인 `app-release.apk`를 이 경로에 복사(덮어쓰기)합니다.
- **버전 메타데이터 (업데이트 트리거) 경로**: `C:\Users\hoon\Desktop\els_home_v1\web\public\apk\version.json`
  - 배포할 새 APK의 버전 정보(`latestVersion` 등)를 이 JSON 파일에 수정 반영합니다.
- **실제 구동 원리**:
  1. 기사님들이 앱을 실행하거나 **[설정 > 수동 업데이트 확인]** 버튼을 누를 때마다 `https://www.nollae.com/apk/version.json`을 검사합니다.
  2. 현재 버전과 서버의 `latestVersion`이 다를 경우, 즉시 화면에 업데이트 알림창을 띄우고 `els_driver.apk` 다운로드 링크를 제공합니다.
