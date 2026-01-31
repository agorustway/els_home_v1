# ELS 컨테이너 이력조회 설치 파일 보관

이 폴더에 아래 파일을 넣으면 **컨테이너 이력조회** 페이지에서 다운로드 링크로 제공됩니다.

| 파일명 | 설명 |
|--------|------|
| `els-container-history-setup.exe` | Windows용 설치 프로그램 (desktop 폴더에서 빌드) |
| `els-container-history.apk` | Android용 앱 (데스크탑 앱과 같은 Wi‑Fi에서 접속용 WebView 앱) |

---

## 1. Windows 설치 프로그램 (.exe) 만들기

**사전 요구사항:** Node.js(v18 이상), Python(PATH 등록), Chrome 브라우저

1. **프로젝트 루트**에서 `desktop` 폴더로 이동 후 의존성 설치  
   ```bash
   cd desktop
   npm install
   ```
   (renderer는 `postinstall`으로 자동 설치됨. 수동이면 `cd renderer && npm install && cd ..`)

2. **UI 빌드 + Windows 인스톨러 패키징**  
   ```bash
   npm run dist
   ```
   - 내부적으로 `npm run build:renderer`(Vite 빌드) 후 `electron-builder --win`(NSIS 인스톨러) 실행

3. **생성된 파일 위치**  
   - `desktop/dist/` 안에 **ELS 컨테이너 이력조회 Setup 1.0.0.exe** 형태의 파일이 생성됨  
   - 버전은 `desktop/package.json`의 `version` 값(예: 1.0.0)

4. **이 폴더에 넣기**  
   - 위 exe 파일을 **이 폴더**(`web/public/downloads/`)로 복사  
   - 파일명을 **`els-container-history-setup.exe`** 로 바꿔 두면, 페이지 다운로드 버튼에서 그대로 제공됨  

   예 (Windows PowerShell):  
   ```powershell
   Copy-Item "desktop\dist\ELS 컨테이너 이력조회 Setup 1.0.0.exe" "web\public\downloads\els-container-history-setup.exe"
   ```

---

## 2. Android 앱 (.apk) 만들기

- **역할:** 데스크탑 앱을 “서버”로 쓰고, 같은 Wi‑Fi에서 **PC 주소(예: 192.168.0.10:2929)** 만 입력해 접속하는 **WebView 앱**입니다.  
- **이 저장소에는 Android 소스가 없습니다.** 별도 WebView 앱 프로젝트(React Native WebView, Capacitor, 네이티브 WebView 등)에서 “URL 입력 → 해당 주소 로드” 기능만 넣어 빌드한 apk를 사용합니다.

**이 폴더에 넣는 방법**

1. 사용 중인 Android 프로젝트에서 **Release APK** 빌드  
   - 예: Android Studio에서 Build → Build Bundle(s) / APK(s) → Build APK(s), 또는 `./gradlew assembleRelease`
2. 생성된 apk를 **이 폴더**(`web/public/downloads/`)로 복사  
3. 파일명을 **`els-container-history.apk`** 로 맞추면, 페이지의 “Android 앱 (.apk) 다운로드” 버튼으로 제공됨  

자세한 사용 흐름(데스크탑 서버 모드, 같은 Wi‑Fi 접속)은 프로젝트 루트의 **DESKTOP_ANDROID_APPS.md** 를 참고하세요.

---

## 다운로드 링크·환경 변수

- exe/apk 파일을 이 폴더에 넣고 배포하면, 페이지 내 **다운로드** 버튼(`/api/downloads/els-win`, `/api/downloads/els-android`)으로 받을 수 있습니다.
- **파일이 없을 때:** 클릭 시 404 대신 "설치 파일이 없습니다" 안내 페이지가 표시됩니다.
- 대용량 파일은 GitHub Releases 등 **외부 URL**에 올리고, 환경 변수로 링크를 지정할 수도 있습니다.
  - `NEXT_PUBLIC_ELS_DOWNLOAD_WIN` : Windows exe 다운로드 URL (설정 시 이 URL로 바로 이동)
  - `NEXT_PUBLIC_ELS_DOWNLOAD_ANDROID` : Android apk 다운로드 URL
