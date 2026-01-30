# ELS 컨테이너 이력조회 설치 파일 보관

이 폴더에 아래 파일을 넣으면 **컨테이너 이력조회** 페이지에서 다운로드 링크로 제공됩니다.

| 파일명 | 설명 |
|--------|------|
| `els-container-history-setup.exe` | Windows용 설치 프로그램 (desktop 폴더에서 `npm run dist` 후 `desktop/dist/` 에 생성) |
| `els-container-history.apk` | Android용 앱 (데스크탑 앱과 같은 Wi‑Fi에서 접속용 WebView 앱) |

- exe/apk 파일을 이 폴더에 복사한 뒤 배포하면, 페이지 내 **다운로드** 버튼으로 받을 수 있습니다.
- 대용량 파일은 GitHub Releases 등 외부 URL에 올리고, 환경 변수로 링크를 지정할 수도 있습니다.
  - `NEXT_PUBLIC_ELS_DOWNLOAD_WIN` : Windows exe 다운로드 URL
  - `NEXT_PUBLIC_ELS_DOWNLOAD_ANDROID` : Android apk 다운로드 URL
