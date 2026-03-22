# 📱 ELS 운송관리 네이티브 앱 개발 현황판 (APP_MISSION_CONTROL)

**마지막 업데이트**: 2026-03-22
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

### 🚨 해결 과제 (TODO)
- [x] **다른 앱 위에 표시 전환 오류**: 삼성 갤럭시(Android 14+) 등에서 `package:` 스킴 인텐트가 막히는 현상에 대응하여, Fallback 인텐트(옵션 미지정 및 앱 상세 정보) 2단계를 적용하여 해결 완료.
- [x] **사진 업로드(FormData) 실패**: Blob이 포함된 FormData가 CapacitorHttp 환경에서 깨지는 현상 원천 차단. 사진을 `Base64` 문자열로 변환 후 순수 `application/json`으로 업로드하도록 구조 변경 (서버 API 동시 개편).
- [x] **운송 시작(Start Trip) 서버 연결 불가**: 미인증(Anon) 세션에서의 Supabase RLS 차단 문제로 판명, POST 백엔드 엔드포인트에 `createAdminClient`를 도입하여 RLS 우회 처리.
- [ ] **오프라인 데이터 큐잉 및 싱크 (진행 예정)**: 네트워크가 없는 상태에서 운송 시작/종료 시 로컬 스토리지에 Action을 큐잉(Queue).
- [ ] **백그라운드 싱크**: 앱이 다시 `online` 이벤트를 받을 때 큐잉된 내역을 순차적으로 서버에 전송.

