# 개발 로그

## 2026년 2월 4일 수요일
### els_bot.py 및 app.py 파일의 'time' 모듈 import 누락 수정
- `elsbot/els_bot.py`: `import time`이 이미 존재하여 수정하지 않음.
- `docker/els-backend/app.py`: `import time` 누락 확인 후 최상단에 추가.
- `[예외] name 'time' is not defined` 에러 해결.

### els_bot.py 엑셀 데이터 파싱 로직 수정
- `elsbot/els_bot.py` 내 `main` 함수의 파싱 로직 개선.
- `re.split` 대신 탭(`\t`)을 우선 기준으로 분리하도록 수정하여 날짜/시간 데이터의 공백 쪼개짐 방지.
- `row_data`의 길이를 검증(`len(row_data) < 5`)하고 `No` 필드의 유효성(`isdigit()`, `1 <= No <= 15`)을 추가하여 유효하지 않은 데이터 줄 필터링.
- `Sheet1`에 `No`가 '1'인 데이터만 들어가도록 하는 로직은 기존대로 유지됨 (파싱 정확도 개선으로 필터링 효과 증대).

### /api/els/login 500 에러 해결 및 els_bot.py 리팩토링
- `elsbot/els_bot.py` 및 `docker/els-backend/app.py` 파일에 `import time`이 확실히 있는지 재확인 (모두 존재).
- `elsbot/els_bot.py`의 `main` 함수를 `run_els_process` (핵심 로직)와 `cli_main` (CLI 실행 로직)으로 리팩토링.
- `els_bot.py`에서 불필요한 `input()` 코드 제거 및 `sys.argv`를 통한 실행 방식 분리.
- `argparse` 모듈을 사용하여 외부 호출 시 인자 파싱 및 JSON 결과 출력 로직 추가.

### 안전운임 조회 UI 개선 (버튼 기능 및 스타일 수정 - 최종)
- `web/app/employees/safe-freight/safe-freight.module.css` 파일에 `.tabDeveloping` CSS 클래스 추가 (옅은 빨강 배경 및 테두리).
- `web/app/employees/safe-freight/page.js` 파일 수정:
    - `구간조회` 버튼 `className`을 `styles.tabDeveloping`으로, 텍스트를 `구간조회(개발중)`으로 변경, `title`을 `네이버 지도로 경로 조회 (개발중)`으로 변경.
    - `포워더KR` 버튼 `onClick` 핸들러를 원래대로 `setView('forwarder')`로 되돌려 `iframe`이 열리도록 수정.
    - `포워더KR` 버튼 `title`을 `포워더케이알 운임정보 바로가기`로 변경.
    - 상단 `QUERY_TYPES` 탭 버튼들의 `onClick` 핸들러를 수정하여, `forwarder` 뷰 상태에서 클릭 시 `default` 뷰로 전환되고 해당 `queryType`이 설정되도록 변경.
    - `포워더KR` `iframeSection` 내 `안전운임 조회로 돌아가기` 버튼 제거 (불필요한 버튼 제거).

### 헤더 위젯 조건부 렌더링 (인트라넷 페이지에만 표시)
- `web/components/SiteLayout.js` 파일 수정:
    - `InfoTicker` 컴포넌트 (`현재시간, 날씨, 뉴스` 위젯 포함)가 `/employees` 또는 `/admin` 경로일 때만 렌더링되도록 조건부 렌더링 로직 적용.
    - `isEmployees` 변수를 활용하여 `InfoTicker` 컴포넌트의 렌더링을 제어.

### 뉴스 기사 페이지 iframe으로 변경 (팝업 차단 시도)
- `web/app/employees/news/article/page.js` 파일 수정:
    - 뉴스 기사 본문을 `fetch` API를 통한 직접 렌더링 방식에서 `iframe` 방식으로 변경.
    - 외부 기사 URL을 `iframe` `src`로 직접 로드하여 '사이트 이동' 버튼 없이 바로 기사 내용을 볼 수 있도록 개선.
    - `iframe`에 `sandbox="allow-scripts allow-same-origin allow-forms allow-modals"` 속성을 추가하여 팝업을 차단하고 보안 강화. 광고는 `iframe` 콘텐츠이므로 제거 불가.
    - 뉴스 목록으로 돌아가는 `Link`는 유지.

### 뉴스 기사 페이지 iframe 크기 조정 (본문 꽉 채우기)
- `web/app/employees/news/article/article.module.css` 파일 수정:
    - `.articleIframe` 클래스를 추가하여 `width: 100%`, `height: calc(100vh - 200px)`, `border: none; display: block;` 스타일 적용.
    - `infoText` 및 `iframeFooter` 클래스 스타일 추가하여 `iframe` 주변 요소들의 시각적 배치 개선.

### 컴파일 에러 해결 (React is not defined)
- `web/app/employees/safe-freight/page.js` 파일 수정:
    - `import React from 'react';` 추가하여 `React.Fragment` 사용으로 인한 `'React' is not defined` 에러 해결.

### [재수정] 안전운임 조회 UI - 포워더KR 사이트 새 창으로 열기 및 버튼 위치 조정
- `web/app/employees/safe-freight/page.js` 파일 수정:
    - `포워더KR` 버튼 `onClick` 로직을 `window.open('https://www.forwarder.kr/tariff/', '_blank')`로 변경하여 새 창에서 열리도록 수정. `title`은 `포워더케이알 운임정보`로 복원.
    - `view === 'forwarder'` 일 때 렌더링되던 `iframeSection` 블록 완전히 제거.
    - 버튼들의 순서 조정: `관련 법령·고시 안내` 버튼이 `이외구간` 왼쪽으로, `포워더KR` 버튼이 `구간조회(개발중)` 왼쪽으로 이동.

### 로그인 500 에러 재발 해결 및 els_bot.py, app.py 로깅 보강
- `elsbot/els_bot.py` 파일 수정:
    - `CONFIG_FILE = os.path.join(os.path.dirname(__file__), "els_config.json")` 으로 절대 경로 강제 지정.
    - `load_config()` 함수에서 `FileNotFoundError` 발생 시 `[WARNING]` 로그, `json.JSONDecodeError` 발생 시 `[ERROR]` 로그 출력.
    - `cli_main()` 함수에서 `input()` 코드 및 `while True` 루프 제거, 엑셀 파일 로딩 및 `run_els_process` 호출 로직만 남김. (에러 메시지 및 성공 메시지에 `[ERROR]`, `[INFO]` 접두사 추가)
- `docker/els-backend/app.py` 파일 수정:
    - `login` 함수 내 `subprocess` 실행 후 에러 로깅을 `app.logger.exception`을 사용하여 스택 트레이스 및 `stdout`, `stderr` 내용을 더 상세하게 남기도록 보강.

### 뉴스 페이지 및 안전운임 조회 페이지 UI 개선 (여백, 버튼 위치 조정)
- **뉴스 페이지 (`web/app/employees/news/article/page.js`, `article.module.css`) 수정:**
    - 상단 안내 문구 (`<p className={styles.infoText}>...</p>`) 제거.
    - 하단 `iframeFooter` 내 `새 창에서 보기` 버튼 제거.
    - 상단 `<div className={styles.header}>` 내에 `뉴스 목록` `Link`와 `새 창에서 보기` `a` 태그를 통합하여 배치.
    - `article.module.css` 수정: `.header`의 `margin-bottom`을 줄이고 `display: flex` 속성 추가. `.card`의 상단 `padding`도 줄여 상단 여백 최소화.
- **안전운임 조회 페이지 (`web/app/employees/safe-freight/page.js`, `safe-freight.module.css`) 수정:**
    - 상단 설명 문구 (`<p className={styles.desc}>...</p>`) 제거.
    - `<div className={styles.tabs}>` 내의 버튼 순서 재조정: `관련 법령·고시 안내` 버튼이 `이외구간` 왼쪽으로, `포워더KR` 버튼이 `구간조회(개발중)` 왼쪽으로 이동.
    - `safe-freight.module.css` 수정: `.tabs` 클래스에 `display: flex`, `flex-wrap: wrap`, `align-items: center` 속성 추가. `.mlAuto` 클래스 (`margin-left: auto`) 추가하여 `구간조회(개발중)` 버튼을 오른쪽으로 정렬.

### 컴파일 에러 해결 (Expected '...', got '}') - 재수정
- `web/app/employees/safe-freight/page.js` 파일 수정:
    - `className` 속성의 템플릿 리터럴 문법 오류 ( `className={`$\{styles.tabDeveloping} ${styles.mlAuto}`} ` )를 올바른 `className={styles.tabDeveloping}` 형식으로 수정. (즉, `styles.mlAuto` 클래스 제거 및 JSX 문법 오류 해결)
    - 이제 "구간조회(개발중)" 버튼은 왼쪽으로 정렬됩니다. (형의 요청 반영)

### elsbot/els_bot.py: `sys`, `argparse` 모듈 import 추가 및 최종 검수
- `elsbot/els_bot.py` 파일 최상단 `import os` 아래에 `import sys`와 `import argparse` 추가.
- `input()` 함수 사용 여부 최종 확인: 더 이상 사용되지 않음.
- `time` 모듈 임포트 여부 최종 확인: `import time`이 파일 최상단에 존재.
- `CONFIG_FILE` 경로 유지 여부 최종 확인: `os.path.join(os.path.dirname(__file__), "els_config.json")` 경로가 잘 유지되어 있음.
- 모든 검수 항목 통과.

### 컴파일 에러 해결 (Expected '...', got '}') - JSX 주석 제거
- `web/app/employees/safe-freight/page.js` 파일 수정:
    - `className={styles.tabDeveloping} {/* 오른쪽으로 밀기 */}` 에서 ` {/* 오른쪽으로 밀기 */} ` JSX 주석 제거.
    - JSX 속성 값 뒤에 바로 붙은 주석으로 인한 파싱 오류 해결. (빌드 에러 해결)

### elsbot/els_web_runner.py: `import time` 누락 확인 및 전수 조사
- `elsbot/els_web_runner.py` 파일 최상단에 `import time`이 이미 존재함을 확인. (수정 사항 없음)
- `elsbot/els_bot.py`: `import time`, `import json`, `import os`, `import sys`, `import argparse` 모두 존재 확인.
- `docker/els-backend/app.py`: `import time`, `import json`, `import os`, `import sys` 모두 존재 확인.
- `elsbot/els_web_runner.py`: `import time`, `import json`, `import os`, `import sys`, `import argparse` 모두 존재 확인.
- `elsbot/els_bot.py`의 `CONFIG_FILE` 경로 (`os.path.join(...)`) 유지 확인.
- 모든 검수 항목 및 요청사항 확인 완료. (수정 사항 없음)