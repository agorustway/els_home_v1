# 📱 ELS 운송관리 네이티브 앱 개발 현황판 (APP_MISSION_CONTROL)

**마지막 업데이트**: 2026-03-21
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

### 🏃 Phase 3: 완벽한 오프라인 컨트롤 시나리오 (진행 중)
- [ ] **에러 방어력**: 네트워크가 없는 상태에서 운송 시작/종료 시 로컬 스토리지에 Action을 큐잉(Queue).
- [ ] **백그라운드 싱크**: 앱이 다시 `online` 이벤트를 받을 때 큐잉된 내역을 순차적으로 서버에 전송.
