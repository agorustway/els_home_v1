# ELS 컨테이너 이력조회 데스크탑 앱

Windows에서 **Python**과 **Chrome**이 설치된 PC에서 컨테이너 이력조회를 사용할 수 있는 데스크탑 앱입니다.

## 사전 요구사항

- **Node.js** (v18 이상)
- **Python** (PATH에 등록, `python` 또는 `python3` 명령 사용 가능)
- **Chrome** 브라우저 (Selenium/ChromeDriver에서 사용)

## 개발 시 실행

1. **의존성 설치**
   ```bash
   cd desktop
   npm install
   cd renderer && npm install && cd ..
   ```

2. **UI 빌드** (renderer → renderer-dist)
   ```bash
   npm run build:renderer
   ```

3. **Electron 실행**
   ```bash
   npm start
   ```

## Windows 인스톨러(.exe) 만들기

1. 위와 같이 `npm install` 후 **renderer 빌드**
   ```bash
   npm run build:renderer
   ```

2. **인스톨러 패키징**
   ```bash
   npm run dist
   ```

3. `desktop/dist/` 폴더에 **ELS 컨테이너 이력조회 Setup x.x.x.exe** 등이 생성됩니다.

## 안드로이드에서 사용하려면

데스크탑 앱을 실행한 PC와 **같은 Wi‑Fi**에 안드로이드 기기를 연결한 뒤,  
안드로이드용 WebView 앱에서 **PC IP:2929** (예: `192.168.0.10:2929`) 로 접속하면 됩니다.  
(현재 데스크탑 앱은 기본적으로 `127.0.0.1`만 수신합니다. 같은 네트워크에서 접속하려면 서버 모드 옵션 추가가 필요할 수 있습니다.)

자세한 구조는 프로젝트 루트의 **DESKTOP_ANDROID_APPS.md** 를 참고하세요.
