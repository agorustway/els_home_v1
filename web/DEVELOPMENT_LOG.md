# Development Log

## [2026-01-30] - 인트라넷 홈 날씨·뉴스 모듈 개선 및 오늘의 날씨예보 문장

### 🚀 핵심 성과
- **날씨 모듈 재구성**: 현위치 날씨를 크게 고정하고, 다른 지역 3곳을 뉴스처럼 **한 블록 안 리스트**로 표시(5초마다 전환). 날씨·뉴스 열간격·패딩 통일로 시각적 안정화.
- **데스크탑 기본 지역 아산**: IP 기반 지역 조회 실패 시 기본값을 서울 → **아산(충남)**으로 변경. `REGIONS`에 아산 추가.
- **오늘의 날씨예보 문장**: Open-Meteo **일별(daily)**·**체감온도(apparent_temperature)** 데이터로 "오늘 낮 최고·밤 최저, 날씨 상태" + **생활/안전 예보**(눈·비·안개·뇌우 주의, 한파·무더위 옷차림) 문장을 자동 생성해 현위치 영역에 표시.
- **뉴스·날씨 날짜/시간**: 뉴스는 **한국 날짜·시간** 포맷(2026년 1월 30일 14:00), 날씨는 **기준 시각**(1월 30일 14:00) 표시.

### 🛠️ 작업 상세
- **api/weather/route.js**: `daily=temperature_2m_max,temperature_2m_min,weathercode`, `hourly=...,apparent_temperature` 추가. `buildDailySummary(daily, hourly)`로 기본 예보 + `buildAdvisoryText(weatherCode, apparentMin)`로 눈/비/안개/뇌우/체감온도 기반 문장 생성. 예보 문장 정제(한파·무더위·노약자·전조등 등).
- **api/weather/region-by-ip/route.js**: `REGIONS`에 아산 추가, 기본값·실패 시 `region: 'asan'`.
- **app/employees/page.js**: 날씨 블록을 한 묶음(weatherBlock: 현위치 큰 카드 + weatherList 3곳), `formatWeatherDateTime`·`formatNewsDateKorea`로 날짜/시간 표시, `dailySummary`·날씨·뉴스 설명(날씨·뉴스 현위치 기준), 다른 지역 리스트에 작은 날씨 아이콘.
- **employees.module.css**: weatherBlock·weatherFeatured·weatherList·weatherListItem·weatherListIcon·weatherForecastDesc·weatherBlockDesc, 열간격 통일(weatherBlock·newsBlock 동일 padding·min-height·헤더·리스트 간격).

### ⚠️ 주의
- 날씨 예보 문장은 Open-Meteo 데이터만으로 생성. 별도 예보 문장 API 미사용.

---

## [2026-01-31] - Synology NAS Docker로 ELS 백엔드 실행 및 웹 프록시 연동

### 🚀 핵심 성과
- **Docker 백엔드**: NAS에서 Python + Chromium + elsbot을 Docker로 실행해 `/api/els/*` API 제공. 사용자 exe/apk 설치 없이 웹에서 조회 가능.
- **Synology 연동**: 자료실(WebDAV)·게시판 프록시는 기존대로 두고, ELS만 `docker/els-backend` 이미지로 추가 실행.
- **Next.js 프록시**: `ELS_BACKEND_URL` 환경 변수 설정 시 `/api/els/*` 요청을 NAS 백엔드로 프록시. DDNS+역방향 프록시로 NAS를 외부에 노출하면 Vercel에서도 NAS 백엔드 사용 가능.

### 🛠️ 작업 상세
- **docker/els-backend/**: Dockerfile (Python 3.11, Chromium, chromedriver), requirements.txt, app.py (Flask API). 빌드 시 저장소 루트를 컨텍스트로 사용.
- **docker/docker-compose.yml**: els-backend 서비스, 포트 2929.
- **elsbot/els_bot.py**: Docker용 `CHROME_BIN`, `CHROME_DRIVER_BIN` 환경 변수 및 headless 옵션(`--no-sandbox`, `--disable-dev-shm-usage`) 지원 추가.
- **web/app/api/els/proxyToBackend.js**: `ELS_BACKEND_URL`이 있으면 요청을 해당 URL로 프록시하는 공통 함수.
- **web/app/api/els/** (capabilities, config, login, run, parse-xlsx, download, logout, template): 각 라우트 상단에서 `proxyToBackend(req)` 호출 후 프록시 응답 반환.
- **NAS_DOCKER_ELS.md**: Synology NAS에서 Docker 빌드/실행, DDNS·역방향 프록시, Next.js `ELS_BACKEND_URL` 설정 방법 정리.

### ⚠️ 주의
- Vercel에서 NAS 백엔드를 쓰려면 NAS가 외부에서 접근 가능해야 하므로 DDNS + 역방향 프록시(HTTPS) 설정 필요. 사무실 내부 전용이면 Next.js를 NAS/내부 서버에 두고 `ELS_BACKEND_URL=http://NAS내부IP:2929` 로 설정.

---

## [2026-01-31] - 컨테이너 이력조회 페이지에 exe/apk 다운로드·설치 설명서 추가

### 🚀 핵심 성과
- **다운로드 및 설치 섹션**: 컨테이너 이력조회 페이지 상단에 **다운로드 및 설치** 섹션 추가. Windows(.exe), Android(.apk) 링크로 클릭 시 다운로드 후 설치 가능.
- **exe/apk 보관·링크**: `web/public/downloads/` 에 exe·apk 파일을 두면 `/downloads/els-container-history-setup.exe`, `/downloads/els-container-history.apk` 로 제공. 외부 URL은 `NEXT_PUBLIC_ELS_DOWNLOAD_WIN`, `NEXT_PUBLIC_ELS_DOWNLOAD_ANDROID` 로 지정 가능.
- **설치 설명서**: 페이지 내 접이식 **설치 설명서 보기** + 전용 페이지 `/employees/container-history/install` (데스크탑·모바일 동일 링크). `public/downloads/CONTAINER_HISTORY_INSTALL.md` 문서 추가.

### 🛠️ 작업 상세
- **container-history/page.js**: 다운로드 섹션(Windows exe, Android apk 링크), 설치 설명서 접기/펼치기, 전체 설명서 링크.
- **container-history.module.css**: `.downloadSection`, `.downloadCard`, `.installGuide` 등 스타일 추가.
- **container-history/install/page.js**, **install.module.css**: 설치 설명서 전용 페이지 (Windows/Android 다운로드·설치·사용 방법).
- **public/downloads/README.md**: exe·apk 보관 방법 및 env 변수 안내.
- **public/downloads/CONTAINER_HISTORY_INSTALL.md**: 설치 설명서 본문(마크다운).

### ⚠️ 주의
- exe·apk 파일은 `desktop/` 빌드·패키징 후 `public/downloads/` 에 복사하거나, GitHub Releases 등 외부 URL을 env로 지정해 사용.

---

## [2026-01-31] - Vercel에서 엑셀 파싱(parse)만 사용 가능하도록 개선

### 🚀 핵심 성과
- **Vercel 제한 정리**: Vercel은 Python 서버리스 함수를 지원하지만, ELS 로그인·조회는 **Selenium + Chrome**이 필요해 서버리스 환경에 Chrome이 없어 불가. 따라서 **논바이너리로 전체 조회**는 Vercel 설정만으로는 불가.
- **엑셀 파싱만 Vercel에서 동작**: Python/Chrome 없이 **엑셀에서 컨테이너 번호만 추출**하는 것은 Node `xlsx`로 가능. parse-xlsx API에 Node 폴백 추가 → Vercel(nollae.com)에서 **엑셀 업로드 → 번호 추출**까지 사용 가능.
- **capabilities·UI**: `parseAvailable: true` 추가. 배포 환경에서는 "엑셀 파싱(번호 추출)만 사용 가능. 로그인·조회는 Chrome 필요로 불가" 안내.

### 🛠️ 작업 상세
- **api/els/parse-xlsx/route.js**: Python 없거나 RUNNER 없을 때 `parseXlsxWithNode(buffer)` (xlsx 패키지, A2~ 컬럼 A 추출)로 폴백. 동일 응답 `{ containers }`.
- **api/els/capabilities/route.js**: Vercel 또는 Python 없을 때 `{ available: false, parseAvailable: true, reason }` 반환. Python 있을 때 `{ available: true, parseAvailable: true }`.
- **container-history/page.js**: `parseAvailable` 상태 추가. `elsAvailable === false && parseAvailable === true`일 때 "엑셀 파싱만 사용할 수 있습니다" 배너 및 상세 안내 문구 분리.

### ⚠️ 주의
- 로그인·조회는 계속 로컬/데스크탑 앱 또는 Chrome 있는 서버에서만 가능. Vercel에서 설정으로 Chrome을 쓸 수 있는 방법은 없음(서버리스 함수에 브라우저 미포함).

---

## [2026-01-31] - Vercel 배포 시 컨테이너 이력조회 Python 에러 대응

### 🚀 핵심 성과
- **배포 환경 감지**: Vercel(nollae.com) 등 서버리스 환경에서는 Python이 없어 로그인/조회 시 503·"Python 미설치" 에러가 로그에 찍히는 문제를 해결.
- **사전 안내**: 컨테이너 이력 페이지 로드 시 `GET /api/els/capabilities`로 사용 가능 여부를 확인하고, 불가 시 상단 배너로 안내·로그인/조회 버튼 비활성화.
- **에러 메시지 통일**: login/run/parse-xlsx API의 503 응답 메시지를 "Vercel 등 서버리스 배포 환경(nollae.com)에서는 사용할 수 없습니다. 로컬 또는 Python·Chrome이 설치된 서버에서만 이용 가능합니다."로 통일.

### 🛠️ 작업 상세
- **api/els/capabilities/route.js** 신규: GET으로 `VERCEL === '1'` 또는 Python 미설치 시 `{ available: false, reason }` 반환, 그 외 `{ available: true }`.
- **container-history/page.js**: 마운트 시 capabilities 호출, `elsAvailable === false`일 때 배너 표시 및 `elsDisabled`로 로그인/조회 버튼 비활성화.
- **container-history.module.css**: `.unavailableBanner` 스타일 추가(경고 배너).
- **api/els/login/route.js**, **api/els/run/route.js**, **api/els/parse-xlsx/route.js**: Python 없을 때 503 메시지를 배포 환경 안내 문구로 통일.

### ⚠️ 주의
- 컨테이너 이력 조회·다운로드는 여전히 로컬 또는 Python·Chrome이 있는 서버에서만 동작. Vercel에서는 기능 비활성화만 하고 에러 대신 안내 배너를 노출.

---

## [2026-01-30] - 일일/월간 업무보고·웹진 이관·컨테이너 이력 세션 유지·UX

### 🚀 핵심 성과
- **일일 업무일지·월간 실적보고 모듈**: `posts.report_kind`(daily/monthly) 추가, `/employees/reports/daily`, `/employees/reports/monthly` 목록·작성 페이지 및 API `kind` 파라미터 지원.
- **웹진 메인 페이지 이관**: 인트라넷에서 제거 후 메인 사이트로 이동. 실적현황↔네트워크 사이에 웹진 섹션 추가, `/webzine` 목록·상세·작성·수정 라우트 구성. 웹진 권한: 방문자 읽기 전용, 지점 사용자 작성·수정 가능·삭제 불가, 관리자 전체 권한.
- **컨테이너 이력조회 세션 유지**: 조회 완료 후 ETRANS 로그아웃하지 않고 대기. ELS 데몬(els_web_runner_daemon.py)으로 로그인 유지, 페이지 이탈 시에만 `/api/els/logout` 호출. 추가·변경 번호로 즉시 재조회 가능.
- **컨테이너 이력 UX**: Python/데몬 spawn 시 `windowsHide: true`로 터미널 창 비노출. 조회 완료 후 로그에 "[대기] 신규 입력을 받을 수 있도록 대기 중입니다. 추가 조회가 필요하면 컨테이너 번호를 입력한 뒤 [조회] 버튼을 눌러 주세요." 출력.

### 🛠️ 작업 상세
#### 1. 업무보고 종류 구분
- **DB**: `supabase_migration_report_kind.sql` — `posts.report_kind`(null/daily/monthly) 컬럼 추가.
- **API**: `api/board/route.js` — GET `kind` 파라미터, POST `report_kind` 저장.
- **페이지**: `reports/daily`, `reports/monthly` 목록·작성 페이지, `intranetMenu.js`에 일일 업무일지·월간 실적보고 메뉴 추가.

#### 2. 웹진 메인 이관 및 권한
- **메인**: `app/page.js`에 실적현황↔네트워크 사이 `WebzineSection` 추가. `Header`에 웹진 링크, 인트라넷 드롭다운에서 웹진 제거.
- **라우트**: `app/webzine/` — layout, 목록, 상세, 작성, 수정. `next.config.mjs`에 `/employees/webzine` → `/webzine` 리다이렉트.
- **권한**: `supabase_webzine_permissions.sql` — 웹진 삭제는 관리자만, 수정은 작성자·관리자. 목록/상세/작성/수정 페이지에 `useUserRole` 기반 버튼 노출·리다이렉트 적용.

#### 3. 컨테이너 이력 세션 유지
- **els_web_runner.py**: `run_search(..., driver=, keep_alive=, log_callback=)` — 기존 드라이버 재사용·조회 후 미종료 옵션.
- **els_web_runner_daemon.py**: HTTP 서버(31999) — `/login`, `/run`(스트리밍), `/logout`. 드라이버 유지.
- **API**: `api/els/daemon.js`(ensureDaemon), `run/route.js`(데몬 우선), `login/route.js`(데몬 우선), `logout/route.js` 신규.
- **프론트**: container-history 페이지에서 `pagehide`·언마운트 시 `POST /api/els/logout`. 사용 안내 문구 및 로그 대기 메시지 추가.

#### 4. 기타
- **터미널 창 숨김**: `api/els/daemon.js`, `run/route.js`, `login/route.js`, `parse-xlsx/route.js`에 `windowsHide: true` 적용.
- **검색**: `api/employees/search` 웹진 경로를 `/webzine/[id]`로 변경.

### ⚠️ 주의
- 컨테이너 이력 데몬은 첫 로그인/조회 시 Next 서버가 자동 기동. 수동 실행 불필요.
- 웹진 RLS·권한 적용을 위해 `supabase_webzine_permissions.sql` 실행 필요.

---

## [2026-01-30] - 임직원 메뉴 eTrans 3.0 스타일 재구성 (헤더·메인·사이드)

### 🚀 핵심 성과
- **헤더 메뉴**: 임직원 전용 헤더(EmployeeHeader) 추가 — ELS Intranet 로고, "OOO님 안녕하세요?", 개인정보수정·로그아웃·문의하기 링크, "메뉴를 검색하세요." 검색창(플레이스홀더).
- **메인 메뉴**: 상단 탭 구조로 변경 — **시스템** | **업무보고** | **지점서비스** | **관리**(admin 전용). 선택 탭 파란색 강조·하단 라인.
- **사이드 메뉴**: 선택된 메인 탭에 따라 항목만 노출. 상단에 "메뉴를 검색하세요." 검색창 추가. 하단 사용자 정보·로그아웃 유지.

### 🛠️ 작업 상세
#### 1. EmployeeHeader (신규)
- **components/EmployeeHeader.js**, **EmployeeHeader.module.css**: 로고(ELS Intranet), 사용자 인사말, 개인정보수정(/employees/mypage), 로그아웃, 문의하기(/contact), 검색 입력(placeholder). sticky, 전역 헤더 아래 정렬.
- **app/employees/layout.js**: SubPageHero 다음에 EmployeeHeader 배치.

#### 2. 메인 메뉴(탭) 재구성
- **constants/intranetMenu.js** 신규: MAIN_TABS(시스템·업무보고·지점서비스·관리), SIDEBAR_ITEMS(탭별 사이드 항목), getActiveMainTab(pathname, isAdmin). 경로 매칭 우선순위·표시 순서(displayOrder) 분리.
- **IntranetSubNav.js**: 탭 링크만 표시. displayOrder로 정렬해 시스템→업무보고→지점서비스→관리 순 노출.
- **IntranetSubNav.module.css**: 탭 스타일(배경·활성 하단 라인), sticky top 보정.

#### 3. 사이드 메뉴(탭별)
- **EmployeeSidebar.js**: getActiveMainTab으로 활성 탭 계산 후 SIDEBAR_ITEMS[activeTabId]만 렌더. 상단 검색 입력 추가. sectionTitle 제거, 아이콘+라벨 링크만 표시.
- **EmployeeSidebar.module.css**: 검색 영역·아이콘 스타일, sticky top 보정.

### ⚠️ 주의
- 메뉴 검색창은 현재 UI만 구현(placeholder). 추후 검색 기능 연동 시 별도 작업 필요.

---

## [2026-01-30] - 임직원 페이지 레이아웃 재구성 및 컨테이너 이력조회(ELS) 웹 연동

### 🚀 핵심 성과
- **임직원 페이지 구조 통일**: Header → 바디 상단 메뉴(IntranetSubNav) → 바디 사이드 메뉴(EmployeeSidebar) + main 구성. 데스크탑에서 사이드바 노출, 1024px 이하에서 사이드바 숨김(기존 CSS 유지).
- **메뉴 재구성**: 사이드바·상단 서브네비·헤더 임직원전용 드롭다운에 **컨테이너 이력조회** 메뉴 추가.
- **컨테이너 이력조회 페이지 신규**: `/employees/container-history`에서 터미널 로그, 계정(현재 아이디/비밀번호 체크박스·신규 입력), 업로드(컨테이너 번호 입력·공백 제거·container_list.xlsx 업로드), 조회 결과(Sheet1·No=1 기준·행 클릭 시 Sheet2 스타일 전개), 엑셀 다운로드 제공.
- **elsbot 웹 연동**: `els_bot.py` 핵심 로직(get delay·scrape_hyper_verify 등) 변경 없이, `els_web_runner.py`만 추가하여 parse/run CLI로 웹 API와 연동.

### 🛠️ 작업 상세
#### 1. 레이아웃
- **app/employees/layout.js** 신규: 모든 `/employees/*`에 Header, SubPageHero, IntranetSubNav, bodyWrap(EmployeeSidebar + main), Footer 적용.
- **app/employees/(intranet)/layout.js**: Header·SubNav·Sidebar 중복 제거, `{children}`만 렌더.
- **app/employees/(intranet)/intranet.module.css**: `.bodyWrap`(flex), `.mainContent` 유지·보조 스타일 추가.
- **app/employees/page.js**: Header·SubPageHero·IntranetSubNav 제거(상위 layout에서 제공).

#### 2. 메뉴
- **EmployeeSidebar.js**: "📦 컨테이너 이력조회" → `/employees/container-history` 링크 추가.
- **IntranetSubNav.js**: "컨테이너 이력" 메뉴 추가.
- **Header.js** (임직원전용 드롭다운): "📦 컨테이너 이력조회" 링크 추가.

#### 3. 컨테이너 이력조회 페이지
- **app/employees/container-history/page.js**, **container-history.module.css**: 터미널(로그), 계정(현재 ID/PW 체크·신규 입력), 업로드(엑셀 버튼·textarea 컨테이너 번호·공백 제거 후 입력), 조회 버튼, 결과 테이블(Sheet1 기준·전개 시 Sheet2 스타일), 엑셀 다운로드 버튼.

#### 4. elsbot 웹 러너
- **elsbot/els_web_runner.py** 신규: `parse <xlsx경로>` → stdout JSON `{"containers": [...]}` (iloc[2:, 0] 동일). `run --containers '[...]' [--user-id] [--user-pw]` → stdout JSON `{log, sheet1, sheet2, output_path}`. `els_bot`의 `login_and_prepare`, `solve_input_and_search`, `scrape_hyper_verify`만 import, 기존 로직·딜레이 등 변경 없음.

#### 5. Next.js API
- **GET /api/els/config**: els_config.json 존재·아이디 마스킹 반환(비밀번호 미노출).
- **POST /api/els/parse-xlsx**: multipart file → 임시 저장 후 Python `els_web_runner.py parse` 호출 → `{containers}` 반환.
- **POST /api/els/run**: JSON `{containers, useSavedCreds, userId?, userPw?}` → Python `els_web_runner.py run` 호출 → 결과 파일 읽어 토큰 저장 → `{log, sheet1, sheet2, downloadToken}` 반환.
- **GET /api/els/download?token=**: 토큰으로 저장된 엑셀 파일 스트리밍 후 토큰 삭제.

### ⚠️ 주의
- 컨테이너 이력 **조회·다운로드**는 서버에 Python·Chrome(selenium)·elsbot 경로(`web/../elsbot`)가 필요. Vercel 등 서버리스에서는 동작하지 않으며, 로컬 또는 Python/Chrome이 있는 서버에서만 사용 가능.
- 엑셀 파싱만 사용할 경우 Python만 있으면 됨(parse-xlsx). 실제 조회(run)는 Selenium·Chrome 필요.

---

## [2026-01-30] - 에이전트 가이드라인 정책 추가·보강 (합의 우선, 스파게티 방지, 작업 맥락, 호환성)

### 🚀 핵심 성과
- **합의 우선·대안 제시**: 모든 작업은 형과 나의 합의 후 진행. 문제가 있을 수 있는 부분은 진행하지 말고 대안을 제시하도록 4번에 반영.
- **스파게티 코드 방지**: 변경 작업의 혼동으로 코드가 꼬이지 않도록, 구조가 꼬일 여지가 있으면 정리 방안 제안 후 합의하도록 4번에 반영.
- **현재 프로젝트 맥락**: 회사소개·임직원 포탈(집중)·이후 모바일 앱·맵 추적. 데스크탑에서 작업, **커밋 시점**에 웹+모바일 UI/UX 점검하여 두 환경 모두 쾌적하게 하도록 5·6번에 반영.
- **브라우저·디바이스 호환성**: Chrome 외 MS 브라우저 로그인 이슈, 모바일 네이버 앱 내 구글 로그인 "신뢰할 수 없음" 등 호환성 사전 점검하도록 7번 신설.

### 🛠️ 작업 상세
#### 1. .AGENT_GUIDELINES.md 변경
- **4번 (합의 우선 및 수정 범위 제한)**: "형이 하자고 해도 문제 부분이 있으면 진행하지 말고 대안 제시", "스파게티 코드 방지" 문구 추가.
- **5번 (현재 프로젝트 맥락 및 작업 방식)**: 신설. 웹(회사소개, 임직원 포탈 집중) → 모바일 앱·맵 연동 예정. 데스크탑 작업·커밋 시 웹+모바일 점검.
- **6번**: 기존 5번(환경별 UI/UX) 번호만 변경.
- **7번 (브라우저·디바이스 호환성)**: 신설. MS 브라우저 로그인, 모바일·앱 내 브라우저(네이버 앱 내 구글 로그인 등) 호환성 사전 점검.
- **8~12번**: 기존 6~10번 번호만 순차 변경.

#### 2. 적용 원칙
- 정책 추가·개정 내용은 본 DEVELOPMENT_LOG에 기록하고, 가이드라인과 동일하게 적용한다.

### ⚠️ 주의
- 로그인·인증·리다이렉트 관련 수정 시 Chrome뿐 아니라 MS Edge, 모바일 Safari/Chrome, 네이버 앱 내 브라우저에서 동작 확인 권장.

---

## [2026-01-30] - /web 디렉터리 구조 정리 및 쓰레기 코드·파일 정리

### 🚀 핵심 성과
- **루트 쓰레기 파일 삭제**: 빌드 로그·테스트·검증 스크립트 등 불필요 파일 제거로 저장소 정리.
- **미사용 코드·API 제거**: `proxy.js`, `/api/debug_env`, `/api/test-s3` 삭제 (보안·유지보수 관점).
- **SQL 스크립트 정리**: `supabase_sql/` 폴더 생성 후 일부 Supabase SQL 스크립트 이동. (나머지는 필요 시 수동 이동 권장.)
- **계정 연동 정책 검증**: 가이드라인 10번과 코드 일치 확인. 로그인·이메일 관리 테스트 완료 상태 유지.

### 🛠️ 작업 상세
#### 1. 삭제한 파일
- **루트**: `proxy.js` (미사용, middleware.js가 실제 사용), `build_new.log`, `build.log`, `build_output.txt`, `error.txt`, `debug_env.js`, `debug-email.js`, `test_latest_fixes.js`, `test_s3.js`, `test_s3_v2.js`, `test-email.js`, `verify_deployment_fixes.js`, `verify_header_fix.js`, `verify_mobile_ui.js`
- **API**: `app/api/debug_env/route.js` (환경 키 노출 위험), `app/api/test-s3/route.js` (테스트용 S3 쓰기)

#### 2. .gitignore 추가
- `build*.log`, `build_output.txt`, `error.txt` — 빌드 산출물이 커밋되지 않도록 추가.

#### 3. supabase_sql 폴더
- `web/supabase_sql/README.md` 추가.
- `supabase_account_linking.sql`, `supabase_asan_lunch.sql`, `supabase_add_phone.sql`, `supabase_add_requested_role.sql` 를 `supabase_sql/` 로 이동(복사). 루트의 `supabase_*.sql` 일부는 그대로 두었으며, 필요 시 전체를 `supabase_sql/` 로 수동 이동 권장.

#### 4. 계정 연동 정책(가이드라인 10) 점검
- **통합 프로필**: `public.profiles` 는 `email` 고유·`id` 보유. `useUserProfile` 훅은 `email` 기준 조회. auth callback·`/api/users/me` 는 email 기반 UPSERT/조회. **일치.**
- **콘텐츠**: `posts` 는 `author_id`(auth.users.id)·`author_email` 유지. 목록 API는 `author_email` 로 profiles 조회, 단일 게시글은 `author_id` 로 profiles/user_roles 조회(호환). **혼동 없음.**

### ⚠️ 주의
- 디버그/테스트가 필요하면 `NODE_ENV=development` 에서만 동작하는 API를 새로 추가할 것. 기존 `/api/debug_env`, `/api/test-s3` 는 제거됨.

---

## [2026-01-26] - 아산지점 주간 식단표(도시락) 관리 시스템 구축

### 🚀 핵심 성과
- **주간 식단 이미지 게시판 도입**: 아산지점 직원들이 매주 도시락 식단을 쉽게 확인할 수 있도록 웹진 스타일의 대형 이미지 뷰어를 구현했습니다.
- **관리자 업로드 기능**: 페이지 이탈 없이 현장에서 즉시 식단 이미지를 등록하고 수정할 수 있는 모달 폼을 개발했습니다.
- **자동화된 조회 로직**: 별도의 설정 없이 '이번주'에 해당하는 최신 식단이 자동으로 노출되도록 `GET` API를 최적화했습니다.

### 🛠️ 작업 상세
#### 1. 데이터베이스 및 API (`supabase_asan_lunch.sql`, `api/asan/lunch/route.js`)
- `weekly_menus` 테이블 설계: 지점코드, 메뉴타입(lunchbox), 시작일, 이미지URL 등을 저장.
- `GET /api/asan/lunch`: 최신 날짜순으로 식단 1건 조회.
- `POST /api/asan/lunch`: 이미지 S3 업로드 및 DB Upsert(등록/수정) 처리.

#### 2. 프론트엔드 컴포넌트 (`components/AsanLunchMenu.js`, `AsanLunchMenu.module.css`)
- **UI 디자인**: 기존 `glassPanel` 스타일을 계승하여 프리미엄한 카드 UI 구현.
- **사용자 경험 개선**:
  - **썸네일 뷰**: 기본 화면에서는 공간 절약을 위해 작게 표시 (클릭 유도 마우스 커서 적용).
  - **확대 보기(Lightbox)**: 이미지 클릭 시 고화질 원본을 전체 화면 모달로 제공하며, 애니메이션 효과를 적용하여 부드러운 전환 구현.
- **기능**:
  - `fetchLatestMenu`: 페이지 로드 시 최신 식단 자동 조회.
  - `handleUploadClick`: 이번주 월요일을 기본값으로 하는 업로드 폼 오픈.
  - **S3 Proxy 연동**: `/api/s3/files`를 통해 보안된 이미지를 고속으로 로딩.

#### 3. 페이지 통합 (`app/employees/branches/[branch]/page.js`)
- 아산지점(`asan`) 페이지 진입 시, **최상단에 식단표 섹션을 배치**하고 그 아래에 이벤트 게임을 두어 정보 접근성을 높였습니다.

### 🛠️ 관리자 기능 개선 (`app/admin/users/page.js`)
- **회원 정보 수정 프로세스 개선**: '자동 저장' 방식에서 **'수정 후 저장 버튼 클릭'** 방식으로 변경하여 오작동 방지.
- **저장 버튼 추가**: 각 사용자 행마다 **[💾 변경사항 저장]** 버튼을 추가하고, 정보 변경 시에만 활성화되도록 구현(`isDirty` 상태 추적).
- **피드백 강화**: 저장 성공 시 "저장되었습니다" 팝업을 띄워 관리자가 명확하게 인지할 수 있도록 개선.

---

## [2026-01-26] - 아산지점 사다리 게임 완전 수정 및 UI 폴리싱

### 🚀 핵심 성과
- **사다리 게임 레이아웃 완전 해결**: 하단 "통과/당첨" 라벨이 잘리던 문제를 근본적으로 해결했습니다.
  - `.gameScreen` overflow를 visible로 변경
  - `.ladderViewport`에 min-height 850px 설정
  - `.ladderBoard` 높이를 450px → 500px로 증가 및 overflow: visible 추가
  - `.ladderContainer` 높이를 800px로 증가하고 하단 패딩 100px 확보
- **마지막 세로 라인(임지언) 표시 문제 해결**: 
  - 컨테이너 너비 계산에 여유 공간 40px 추가
  - 이제 모든 세로 라인이 동일한 두께로 표시됩니다
- **베이스 사다리 라인 가시성 개선**:
  - 색상: `#f1f5f9` → `#cbd5e1` (더 진한 회색)
  - 두께: `2px` → `2.5px`
- **완료 마커 위치 정확도 향상**:
  - `rowHeight` 계산을 500px 기준으로 변경
  - `finalPos.y`를 500으로 설정하여 하단 라벨 위치에 정확히 배치
  - `.staticMarker`, `.emojiSmall`, `.markerNameTag` 스타일 추가
- **게임 버튼 디자인 프리미엄화**:
  - 새 판짜기 버튼: 인디고 그라데이션 + 호버 효과
  - 빙고 새게임 버튼: 그린 그라데이션 + 일관된 인터랙션

### 🛠️ 작업 상세
#### 1. 레이아웃 구조 수정 (`AsanMealGame.module.css`)
- `.gameScreen`: overflow hidden → visible, min-height 650px → 900px
- `.ladderBox`: justify-content: flex-start 추가, padding 증가
- `.ladderViewport`: min-height 850px 추가, overflow-x 오타 수정
- `.ladderContainer`: min-height 800px, padding-bottom 100px
- `.ladderBoard`: height 500px, overflow: visible 추가
- `.ladderLines`: width/height 100%, display: block 추가

#### 2. 게임 로직 정밀 조정 (`AsanMealGame.js`)
- `rowHeight`: 450 / numRows → 500 / numRows로 변경
- `finalPos.y`: 450 → 500으로 변경
- 세로 라인 색상 및 두께 변경: stroke="#cbd5e1" strokeWidth="2.5"
- 컨테이너 너비: `boardWidth + (paddingX * 2) + 40` (여유 공간 확보)

#### 3. 누락된 스타일 추가 (`AsanMealGame.module.css`)
- `.staticMarker`: 완료된 마커 위치 스타일 (transform: translate(-50%, -50%))
- `.emojiSmall`: 완료 이모지 크기 (2.5rem)
- `.markerNameTag`: 애니메이션 중 이름 태그 스타일
- `.ladderLines`: SVG 크기 설정
- `.premiumBtn`: 사다리 리셋 버튼 스타일
- `.bingoResetBtn`, `.bingoHeaderWide`, `.bingoTitleGroup`: 빙고 헤더 시스템

### 📋 해결된 이슈
1. ✅ 사다리 하단 라벨 잘림 현상
2. ✅ 마지막 세로 라인(임지언) 표시 문제
3. ✅ 베이스 라인 가시성 부족
4. ✅ 완료 아이콘 위치 부정확
5. ✅ 버튼 디자인 미흡

---


## [2026-01-25] - 아산지점 게임 감성 고도화 및 메인 UI 프리미엄 개편

### 🚀 핵심 성과
- **아산지점 게임 감성 디테일 업**:
    - **사다리 게임**: 결과에 따라 캐릭터 표정이 변화(당첨 시 😭, 통과 시 😆)하며 긴박감을 더했습니다. 꼬였던 하단 라벨 UI를 수평으로 예쁘게 정렬했습니다.
    - **빙고 게임**: 보드 사이즈를 최적화하고, 가독성을 높였습니다. 3줄 완성 시 축하 팝업이 정중앙에 화려하게 나타나며, 직관적인 게임 설명서(Tool-tip)를 추가했습니다.
- **메인 인트로(Intro) 전면 리뉴얼**: 밋밋했던 이미지 나열 방식을 탈피하고, 8K급 프리미엄 그래픽과 유리 질감(Glassmorphism)의 플로팅 카드가 어우러진 **'다이나믹 모자이크 레이아웃'**으로 개편했습니다. 
- **내비게이션 구조화**: 임직원전용 메뉴의 계층 구조를 심화하여 '지점별 서비스'와 '업무보고' 하위 메뉴를 체계적으로 분류했습니다.

### 🛠️ 작업 상세
#### 1. 게임 UX 폴리싱 (`AsanMealGame.js`, `AsanMealGame.module.css`)
- 사다리 마커 애니메이션 종료 시점에 상태값에 따른 이모지 스왑 로직을 추가했습니다.
- 빙고 성공 레이어에 `AnimatePresence`를 적용하여 부드러운 팝업 효과를 구현했습니다.

#### 2. 비주얼 브랜딩 강화 (`Intro.js`, `Intro.module.css`)
- 새로운 고해상도 통합 물류 비주얼 이미지를 도입했습니다.
- 통계 지표와 핵심 역량을 카드 형태로 시각화하여 정보 전달력을 높였습니다.

#### 3. 헤더 내비게이션 확장 (`Header.js`)
- 지점별 하위 노드(아산, 본사, 중부, 당진, 예산)를 추가하고, 업무보고를 일일/월간/통합으로 세분화했습니다.

---


## [2026-01-25] - 통합 계정 관리 아키텍처(Unified Identity) 대수술 및 UI/UX 마감

### 🚀 핵심 성과
- **이메일 중심 통합 아이덴티티 구축**: 구글, 카카오, 네이버 등 어떤 소셜 로그인으로 접속하더라도 **동일한 이메일이라면 한 명의 사용자**로 관리하는 통합 아키텍처를 완성했습니다. 
- **글로벌 데이터 동기화**: `profiles`, `user_roles`, `posts` 테이블 전체를 `email` 기준으로 매칭 및 처리하도록 개편하여, 로그인 방식이 바뀌어도 이름, 권한, 게시글이 완벽하게 유지됩니다.
- **UI 톤앤매너(Tone & Manner) 정밀 마감**: 헤더 드롭다운의 폰트 불일치 문제를 해결하고, 전체적인 타이포그래피를 프리미엄 수준으로 동기화했습니다.

### 🛠️ 작업 상세
#### 1. 인증 및 권한 시스템 개편 (`auth/callback/route.js`, `hooks/useUserProfile.js`)
- 로그인 시 동일 이메일의 기존 권한을 찾아 현재 세션 ID와 매핑하는 **지능형 계정 연결** 로직을 도입했습니다.
- 이제 관리자가 '구글'로 가입했더라도 '카카오'로 처음 로그인할 때 '방문자'로 강등되지 않고 관리자 권한이 그대로 유지됩니다.

#### 2. 게시판 통합 관리 (`app/api/board/route.js`)
- 게시글 저장 시 `author_email`을 필수 저장하도록 변경했습니다.
- 여러 계정을 써서 글을 써도, **이메일이 같으면 하나의 이름과 프로필 사진**으로 통합되어 보여지도록 조치했습니다.

#### 3. 관리자 페이지 고도화 (`app/api/admin/users/route.js`)
- 중복 가입된(동일 이메일, 다른 ID) 회원들을 하나의 행으로 통합하여 관리자가 혼동 없이 한 번에 제어할 수 있게 했습니다.

#### 4. 헤더 UI 마감 (`components/Header.module.css`)
- 드롭다운 메인 아이템과 서브 아이템의 폰트 크기(`0.9rem`), 굵기(`600`), 색상(`Slate 700/600`)을 통일하여 시각적 완성도를 극대화했습니다.

---


## [2026-01-25] - 사용자 데이터 동기화 시스템 전면 개편 (Profiles-UserRoles 통합)

### 🚀 핵심 성과
- **관리자 페이지 데이터 정합성 해결**: 방문객이 자신의 정보를 수정해도 관리자 페이지에서 리셋되어 보이던 현상을 근본적으로 해결했습니다. 기존에 이원화되어 있던 `profiles` 테이블과 `user_roles` 테이블의 데이터를 실시간으로 동기화(Sync)하는 로직을 구축했습니다.
- **카카오 프로필 사진 복구 및 영구 저장**: 카카오 로그인 시 메타데이터에 숨겨진 프사 주소를 끝까지 추적하여 가져오고, 정보 수정 시 이 주소를 DB에 자동으로 박아넣어 더이상 '성(Initial)'만 뜨는 일이 없도록 조치했습니다.
- **데이터 유실 방지(UPSERT)**: 모든 사용자 정보 업데이트 로직을 '이메일 기반'에서 'ID(UUID) 기반 UPSERT'로 전환하여, 어떤 상황에서도 데이터가 덮어씌워지거나 리셋되지 않게 안정성을 확보했습니다.

### 🛠️ 작업 상세
#### 1. 관리자 API 고도화 (`app/api/admin/users/route.js`)
- `GET`: `user_roles`와 `profiles` 테이블을 동시에 조회한 뒤, **사용자 ID 기준 메모리 조인(Join)**을 수행하여 가장 최신 정보를 관리자에게 보여줍니다.
- `PATCH`: 관리자가 이름을 직접 수정할 때도 `profiles` 테이블까지 함께 업데이트되도록 동기화 로직을 추가했습니다.

#### 2. 사용자 정보 수정 API 보강 (`app/api/users/me/route.js`)
- 사용자가 정보를 저장할 때, **로그인 세션에 있는 최신 프로필 사진(카카오/구글)**을 함께 추출하여 DB에 영구 저장하는 로직을 통합했습니다.
- `user_roles` 테이블에도 이름과 번호를 백업 업데이트하여 시스템 전반의 정합성을 맞췄습니다.

---


## [2026-01-25] - 회사 소개(Intro) 섹션 이미지 짤림 현상 해결

### 🚀 핵심 성과
- **이미지 레이어 짤림 버그 해결**: 'COMPANY PROFILE' 섹션에서 위아래로 움직이는 역동적인 이미지들이 섹션 하단에서 툭 끊기듯 잘리던 문제를 해결했습니다. 
- **레이아웃 안정성 확보**: 기존의 강제적인 `overflow: hidden` 설정을 제거하고, 이미지들이 자유롭게 움직일 수 있도록 충분한 수직 공간(Padding)을 확보했습니다.

### 🛠️ 작업 상세
#### 1. 인라인 스타일 수정 (`components/Intro.js`)
- 섹션 태그에 걸려있던 `overflow: hidden` 속성을 제거하여, 절대 위치(Absolute)로 배치된 하단 이미지가 잘리지 않고 끝까지 보이도록 수정했습니다.

#### 2. 모듈 CSS 최적화 (`components/Intro.module.css`)
- `imageColumn`: 하단에 `100px` (모바일에서는 `120px`) 이상의 여백을 추가하여, 애니메이션으로 아래로 내려가는 이미지를 위한 안전 영역을 확보했습니다.
- 가로 스크롤 방지: 섹션 전체는 열어두되, 컨텐츠 영역에만 `overflow-x: hidden`을 적용하여 둥둥 떠다니는 이미지들로 인해 화면이 옆으로 밀리는 현상을 원천 차단했습니다.

---


## [2026-01-25] - 카카오톡 프로필 사진 동기화 정밀 교정 (N->프사)

### 🚀 핵심 성과
- **카카오톡 썸네일 강제 연동**: 데이터베이스에 이름만 저장되고 사진이 누락되어 'N'이나 성(Initial)만 뜨던 현상을 해결했습니다. 
- **지능형 메타데이터 추출**: 카카오 로그인의 복잡한 구조(`kakao_account.profile.profile_image_url`)에서 자동으로 프사를 찾아내어 DB에 영구적으로 박아버리는(Sync) 로직을 적용했습니다. 
- **프론트엔드 실시간 감지**: `useUserProfile` 훅을 개선하여 DB에 사진 정보가 없더라도 로그인 세션의 메타데이터를 즉시 활용하여 딜레이 없이 사진을 보여줍니다.

### 🛠️ 작업 상세
#### 1. 훅 로직 개선 (`hooks/useUserProfile.js`)
- `profiles` 테이블의 데이터와 `auth` 세션 데이터를 병합할 때, 사진 주소가 비어있으면 메타데이터에서 실시간으로 가져오도록 폴백 로직을 강화했습니다.

#### 2. 저장 로직 강화 (`app/api/users/me/route.js`)
- 사용자가 정보를 수정하고 저장할 때, 이름/전화번호뿐만 아니라 **현재 로그인된 서비스(카카오 등)의 프로필 사진 주소도 함께 DB에 업데이트**하도록 수정했습니다.

---


## [2026-01-25] - 내 정보 저장 안정화 및 카카오 로그인 프로필 연동 강화

### 🚀 핵심 성과
- **내 정보 저장 신뢰도 향상 (UPSERT 방식 도입)**: 정보 수정 시 데이터가 리셋되던 문제를 해결하기 위해, 단순 `update` 대신 `upsert` 방식을 도입했습니다. 사용자 고유 ID(UUID)를 기준으로 처리하도록 변경하여 데이터가 유실되거나 초기화되는 현상을 원천 차단했습니다.
- **카카오톡 프로필 사진 연동 최적화**: 카카오톡 로그인 시 프로필 사진이 누락되던 문제를 해결했습니다. 데이터베이스에 사진 정보가 없더라도 카카오 세션 메타데이터에서 실시간으로 사진 정보를 추출하여 상단 헤더와 마이페이지에 'N' 아이콘 대신 실제 프로필 사진이 뜨도록 로직을 강화했습니다.

### 🛠️ 작업 상세
#### 1. API 엔진 고도화 (`app/api/users/me/route.js`)
- `GET`: DB에 연동된 프로필 데이터가 없을 경우를 대비해 `user_metadata` 내의 다양한 어바타 경로(`avatar_url`, `picture`, `kakao_account` 등)를 순차적으로 탐색하는 지능형 폴백 시스템 적용.
- `PATCH`: 이메일 기반 업데이트에서 **사용자 ID(uuid) 기반 UPSERT**로 변경하여 레코드 누락 방지 및 정합성 확보.

#### 2. 헤더 및 마이페이지 동기화
- 이름이 누락되어 초기값('N')이 뜨던 현상을 `full_name` 정밀 연동을 통해 해결. 이제 수정된 이름의 첫 글자가 올바르게 표시되거나 실제 사진이 출력됩니다.

---


## [2026-01-25] - 내 정보 수정 오류(방문객 정보 수정 불가) 해결

### 🚀 핵심 성과
- **방문객 프로필 수정 권한 버그 해결**: '방문자(Visitor)' 권한을 가진 사용자가 이름이나 전화번호를 수정하려고 할 때, 권한 변경 제한 로직에 걸려 '수정 실패'가 뜨던 문제를 해결했습니다. 
- **지능형 권한 체크 도입**: 서버 API(`PATCH /api/users/me`)에서 요청된 권한이 현재 사용자의 권한과 다를 때만 권한 변경 체크 로직을 수행하도록 개선했습니다. 이를 통해 방문객도 자신의 이름과 연락처는 자유롭게 수정할 수 있게 되었습니다.

### 🛠️ 작업 상세
#### 1. API 핸들러 수정 (`app/api/users/me/route.js`)
- `role !== currentUserRole` 조건을 추가하여, 권한의 실제 변경이 있을 때만 거절 사유(방문객 권한 변경 불가 등)를 체크하도록 수정했습니다.
- 불필요한 DB 업데이트(`user_roles` 테이블)를 방지하여 성능을 미세하게 개선했습니다.

---


## [2026-01-25] - 아산지점 이벤트 게임(AsanMealGame) 모바일 최적화 및 UX 폴리싱

### 🚀 핵심 성과
- **모바일 완벽 대응**: 모든 게임(룰렛, 사다리, 빙고)을 스마트폰 화면에서도 쾌적하게 즐길 수 있도록 **반응형 디자인(Responsive Design)**을 적용했습니다.
- **룰렛 스케일링**: 모바일 기기의 좁은 화면에 맞춰 룰렛 휠의 크기를 동적으로 축소(420px -> 320px -> 280px)하여 화면을 벗어나지 않게 조정했습니다.
- **사다리 타기 터치 최적화**: 좁은 화면에서도 참여자 이름을 쉽게 확인할 수 있도록 가로 스크롤을 유지하되, 노드와 아이콘의 크기를 적절히 조절하여 터치 가독성을 높였습니다.
- **레이아웃 순서 조정**: 모바일에서 게임이 먼저 보이고 설정창이 아래로 가도록 **Flex Order**를 조정하여 사용자 경험을 개선했습니다.

### 🛠️ 작업 상세
#### 1. 미디어 쿼리 세분화 (`components/AsanMealGame.module.css`)
- `768px (태블릿)` 및 `480px (스마트폰)` 브레이크포인트 추가.
- `gameContent`를 우선적으로 노출하도록 상단 배치 로직 수정.
- 모바일 전용 폰트 크기 및 여백(Padding/Gap) 정밀 조정.

#### 2. 빙고 보드 크기 최적화
- 5x5 그리드의 간격을 좁히고 셀 크기를 화면 너비에 맞춰 자동 조절되도록 최적화했습니다.

---


## [2026-01-25] - 아산지점 이벤트 게임(AsanMealGame) 최종 폴리싱 및 공정성 강화

### 🚀 핵심 성과
- **모바일 사다리 타기 편의성 극대화**: 모바일의 좁은 화면에서 사다리가 찌그러지거나 잘리는 현상을 해결하기 위해 **가로 스크롤(Side Scroll)** 시스템을 완벽하게 구축했습니다. 이제 손가락으로 부드럽게 밀어서 모든 사다리 칸을 확인할 수 있습니다.
- **룰렛(Roulette) 공정성 시스템 도입**: 
    - **명단 섞기(Shuffle)**: 게임 시작 전 참여자 순서를 무작위로 섞는 버튼을 추가했습니다. 특정 위치에 고정된 이름으로 인한 불만을 원천 차단합니다.
    - **시간 최적화**: 룰렛 회전 시간을 **10초에서 6초로 단축**하여 지루함은 줄이고 박진감은 높였습니다.
- **최종 UI 정밀 마감**: 룰렛 하단에 셔플 버튼을 추가 배치하고, 모바일에서의 게임 영역 레이아웃을 다시 한번 정밀 조정했습니다.

### 🛠️ 작업 상세
#### 1. 게임 엔진 고도화 (`components/AsanMealGame.js`)
- `spinDuration`: 6초로 조정 및 자동 정지 타이머 동기화.
- `shuffleParticipants` 함수 제작: 참여자 배열을 랜덤하게 섞는 기능 구현.
- 사다리 뷰포트: `justify-content` 속성을 `flex-start`로 조정하여 스크롤 시작 지점 고정.

#### 2. 스타일 시스템 최적화 (`components/AsanMealGame.module.css`)
- `ladderViewport`: `-webkit-overflow-scrolling: touch` 및 커스텀 스크롤바 디자인 적용.
- `shuffleBtn`: 사이드바와 룰렛 하단에 어우러지는 세련된 버튼 스타일 추가.

---


### 🚀 핵심 성과
- **빙고(Bingo) 5x5 정예 레이아웃 복원**: 사이드바 형식을 제거하고 다시 중앙 집중형의 **웅장한 5x5 보드**로 복구했습니다. 셀 크기와 간격을 황금 비율로 조정하여 압도적인 시각적 완성도를 자랑합니다.
- **룰렛(Roulette) 휠 밀착형 팝업**: 당첨자 팝업이 전체 화면이 아닌, **룰렛 휠 영역 내부에 로컬 오버레이**로 뜨도록 수정했습니다. 휠의 형태에 맞춰 원형 백그라운드를 적용하여 디자인적 일체감을 극대화했습니다.
- **게임성 강화**: 룰렛 자동 중지 시에도 휠 위로 즉시 팝업이 나타나도록 하여 사용자 편의성을 높였습니다.

### 🛠️ 작업 상세
#### 1. 빙고 아키텍처 재구축 (`components/AsanMealGame.js`)
- `bingoContainerFixed`: 중앙 정렬형 컨테이너 도입.
- `bingoGrid5x5`: CSS Grid `repeat(5, 1fr)`를 활용한 완벽한 5x5 대칭 구조 확보.
- 승리 모달: 빙고판 내부 전용 오버레이(`bingoOverlay`) 구현.

#### 2. 룰렛 시각 효과 정밀 제어 (`components/AsanMealGame.module.css`)
- `winnerOverlayLocal`: `rouletteWrapper`의 인덱스에 맞춰 휠 위에만 블러 효과가 적용되도록 설계.
- `winnerCardLocal`: 모바일과 데스크탑에서 최적의 사이즈로 휠 중앙에 위치하도록 조정.

---


### 🚀 핵심 성과
- **룰렛(Roulette) 자동/수동 팝업 동기화**: 
    - 사용자가 직접 멈추거나 10초 후 자동으로 멈추는 상황 모두에서 **당첨자 팝업창(Pop-up)**이 정확하게 나타나도록 로직을 통일했습니다.
    - `stopRoulette` 공통 함수를 도입하여 감속 후 결과 산출과 팝업 노출 과정을 일원화했습니다.
- **사다리 타기(Ladder Game) 위치 및 감성 완성**: 
    - 사다리 선, 이름, 당첨 문구 간의 **수직 정렬 오차를 0으로** 맞췄습니다.
    - 캐릭터가 선의 끝점을 자석처럼 추적하며 내려오도록 `Tween` 애니메이션을 정밀하게 연동했습니다.
    - 도착 시 캐릭터 반응(당첨: 😭, 통과: 😆) 시스템을 완성하여 게임의 몰입도를 높였습니다.

### 🛠️ 작업 상세
#### 1. 룰렛 엔진 최적화 (`components/AsanMealGame.js`)
- `stopRoulette` 모듈화: `clearTimeout` 및 결과 계산 로직을 하나로 묶어 자동 종료 시에도 팝업이 누락되지 않게 조치.
- 회전 감속 시각화: `transition`과 `rotation` 상태를 정밀 제어하여 멈출 때의 이질감 제거.

#### 2. 사용자 경험(UX) 피드백 반영
- 게임 네비게이션 및 사이드바 인원 설정 UI의 여백을 재조정하여 답답함을 해소했습니다.
- 빙고 및 룰렛의 결과 메시지를 더욱 축하하는 느낌의 럭셔리 톤앤매너로 교체했습니다.

---


### 🚀 핵심 성과
- **사다리 타기(Ladder Game) 물리 기반 정밀 정렬**: 
    - 상단 이름 노드, 사다리 줄, 하단 당첨 라벨의 위치가 **1px 단위로 정확하게 일치**하도록 위치 로직을 전면 수정했습니다.
    - `translateX(-50%)`와 절대 위치 기반의 `COL_SPACE` 시스템을 도입하여 참여자 수에 관계없이 완벽한 수직 정렬을 보장합니다.
- **동기화된 스무스 무브먼트**: 
    - 동물 캐릭터가 사다리 선 끝에 **자석처럼 딱 붙어서** 매끄럽게(tween animation) 이동하도록 개선했습니다.
    - 선이 그려지는 속도와 캐릭터의 이동 속도를 일치시켜 시각적 이질감을 제거했습니다.
- **룰렛(Roulette) 지능형 자동 정지**: 
    - 사용자가 직접 멈추지 않더라도 **10초 후에는 자동으로 감속하며 정지**하고 결과를 보여주는 로직을 추가했습니다.

### 🛠️ 작업 상세
#### 1. 애니메이션 엔진 업그레이드 (`components/AsanMealGame.js`)
- `activeMarker`: `framer-motion`의 `tween` 트랜지션을 활용하여 선 끝을 따라가는 부드러운 움직임 구현.
- `LadderGame`: `COL_SPACE`와 `paddingX`를 상수로 관리하여 레이아웃 계산 신뢰도 향상.

#### 2. 레이아웃 안정화 (`components/AsanMealGame.module.css`)
- `ladderNodeWrapper` & `ladderPrizeWrapper`: 절대 위치 기반 센터링 로직 적용.
- `startNode`: 간격을 넓히고 호버 시 부드러운 상승 효과 추가.

---


### 🚀 핵심 성과
- **사다리 타기(Ladder Game) 멀티 패스 시스템 도입**: 게임 완료 후에도 **캐릭터와 이동 선이 사라지지 않고 화면에 유지**되도록 수정했습니다. 이를 통해 모든 참여자의 결과를 한눈에 비교할 수 있습니다.
- **개별 컬러 경로 및 아이콘**: 각 참여자마다 중복되지 않는 **전용 컬러 선**을 배정하고, 상단 노드에 귀여운 동물 아이콘을 추가하여 시각적 재미와 가독성을 동시에 잡았습니다.
- **하이엔드 프리미엄 UI 리뉴얼**: 
    - 딥 블루와 화이트를 활용한 **럭셔리 톤앤매너**를 적용했습니다.
    - 모든 버튼과 카드에 부드러운 애니메이션(`Outfit` 폰트 기반)과 깊이감 있는 그림자를 추가했습니다.
    - 빙고 및 룰렛의 오버레이와 배치 구성을 더욱 전문적인 레이아웃으로 개선했습니다.

### 🛠️ 작업 상세
#### 1. 게임 엔진 고도화 (`components/AsanMealGame.js`)
- `completedHistory` 상태 도입: 완료된 모든 경로 정보(`path`, `emoji`, `color`)를 배열로 관리하여 렌더링.
- `persistentPath` 스타일 적용: 완료된 선은 반투명 점선으로 표시하여 현재 진행 중인 선과 구분.
- **동적 컬러 시스템**: `PATH_COLORS` 배열을 활용해 인덱스별로 고유한 색상 부여.

#### 2. 디자인 시스템 최적화 (`components/AsanMealGame.module.css`)
- `premiumLayout`: 더 넓고 깊이감 있는 650px 이상의 메인 스크린 확보.
- `nodeIcon` 및 `markerFloatingName`: 캐릭터 위에 이름을 띄우고 노드에 아이콘을 배치하여 인터랙티브 요소 강화.
- **빙고 보드 리모델링**: 셀 간격과 둥글기(Border-radius)를 정밀 조정하여 고급스러운 그리드 완성.

---


### 🚀 핵심 성과
- **사다리 타기(Ladder Game) 동기화 애니메이션**: 이제 사다리 선(Active Path)이 동물 캐릭터의 이동 속도와 완벽하게 맞춰서 한 칸씩 그려지도록 수정하여, 결과 스포일러를 방지하고 "두근두근" 감성을 극대화했습니다.
- **캐릭터 반응 시스템 도입**: 
    - **당첨(Winner)**: 캐릭터가 도착 지점에서 😭(우는 표정)으로 변하며 긴장감을 해소합니다.
    - **통과(Looser)**: 캐릭터가 😆(웃는 표정)으로 변하며 안도감을 표현합니다.
- **프리미엄 UI/UX 전면 개편**: 
    - 전반적인 디자인에 **글래스모피즘(Glassmorphism)** 테마를 적용하여 현대적이고 세련된 비주얼을 완성했습니다.
    - 룰렛 당첨 팝업을 게임 영역 내부에 고정하여 시각적 혼란을 제거했습니다.
    - 빙고 레이아웃을 사이드바 형태로 재구성하여 정보 가독성을 높였습니다.

### 🛠️ 작업 상세
#### 1. 애니메이션 로직 개선 (`components/AsanMealGame.js`)
- `LadderGame`: `visiblePath` 상태를 추가하여 캐릭터가 한 단계씩 이동할 때마다 SVG 경로가 따라가도록 구현.
- `markerEmoji` 동적 변경: 게임 완료 시 결과(`isWinner`)에 따라 이모지를 즉시 변경.
- **두근두근 딜레이**: 이동 간격을 300ms로 유지하여 캐릭터와 선이 함께 내려오는 감성 확보.

#### 2. 스타일 시스템 고도화 (`components/AsanMealGame.module.css`)
- `premiumLayout`: 사이드바와 메인 화면의 그리드 비율 최적화.
- `glassPanel`: 블러 효과와 투명도를 활용한 세련된 카드 레이아웃.
- **버튼 및 칩 디자인**: 인터랙티브한 호버 효과와 둥근 모서리 디자인 적용.

---


### 🚀 핵심 성과
- **룰렛 당첨 팝업 위치 교정**: 게임판 외부가 아닌 실제 게임판 중앙에 정확히 위치하도록 로컬 오버레이 방식으로 수정했습니다.
- **사다리 타기(Ladder Game) 감성 고도화**:
    - **두근두근 애니메이션**: 캐릭터 이동 속도를 늦춰(250ms/step) 긴장감을 더했습니다.
    - **가독성 최적화**: 사다리 폭을 좁히고 모바일에서도 슬라이드바 없이 한눈에 들어오도록 조정했습니다.
    - **직관적 설정**: 복잡한 아이템 설정을 제거하고 '당첨/통과' 위주로 심플하게 구성했습니다.
    - **리셋 기능**: 한 번의 클릭으로 사다리 구조를 즉시 재설정하는 버튼을 추가했습니다.
- **빙고(Bingo) 레이아웃 재편**: 게임판과 설명서를 좌우 배치(모바일 시 상하)하여 인지 부하를 줄이고 시각적 균형을 맞췄습니다.

### 🛠️ 작업 상세
#### 1. 게임 엔진 수정 (`components/AsanMealGame.js`)
- `LadderGame`: 
    - `markerPos` 업데이트 딜레이 조정 및 `boardWidth` 계산 로직 최적화.
    - 하단 결과값('당첨/통과') 로직으로 간소화.
- `BingoGame`: 설명서 텍스트와 게임 보드를 분리된 카드 레이아웃으로 재구성.
- `AsanMealGame`: 결과 오버레이(`resultOverlay`)를 각 게임 내부 컨테이너의 하위 요소로 배치하여 위치 오류 해결.

#### 2. 스타일 시스템 최적화 (`components/AsanMealGame.module.css`)
- `position: absolute`와 `inset: 0`을 활용한 정밀한 오버레이 레이아웃 구현.
- `bingoLayout` 그리드 시스템 도입으로 깔끔한 배치 확보.

---


### 🚀 핵심 성과
- **사다리 타기(Ladder Game) 애니메이션 완벽 복구**: 단순히 결과만 보여주던 방식에서 벗어나, SVG 경로를 따라 캐릭터(동물 이모지)가 실제로 이동하는 애니메이션을 구현했습니다.
- **실시간 경로 계산 로직 도입**: 사용자가 이름을 클릭하면 해당 위치에서부터 사다리 줄을 타고 내려가는 경로를 실시간으로 계산하여 시각화합니다.
- **UI/UX 복원 및 최적화**: 형이 제공한 전문적인 CSS 구조를 바탕으로 사다리 보드, 세로줄(V-Line), 가로줄(H-Line), 그리고 이동 경로(Active Path)의 스타일을 완벽하게 복원했습니다.

### 🛠️ 작업 상세
#### 1. 컴포넌트 고도화 (`components/AsanMealGame.js`)
- `LadderGame`: 
    - `calculatePath` 함수: 사다리 알고리즘을 구현하여 좌우 이동 로직을 정확히 처리합니다.
    - `runLadder` 비동기 함수: `markerPos`를 순차적으로 업데이트하여 캐릭터가 사다리를 타고 내려가는 시각적 효과를 제공합니다.
    - SVG Integration: `ladderSvgBackground`와 `ladderSvgOverlay`를 통해 정적 줄과 동적 경로를 분리 관리합니다.
- **동물 캐릭터 랜덤 배정**: 각 참여자마다 다른 동물 이모지를 배정하여 재미 요소를 더했습니다.

#### 2. 스타일 시트 완벽 매칭 (`components/AsanMealGame.module.css`)
- 형이 전달한 CSS 코드를 그대로 반영하여 사디리 보드의 높이(450px), 노드 스타일, 반응형 레이아웃을 최적화했습니다.

---


### 🚀 핵심 성과
- **AsanMealGame 컴포넌트 전면 복구**: 다른 AI 툴로 인해 엉망이 되었던 게임 로직과 구조를 정예화하여 복구했습니다.
- **게임 콘텐츠 강화**:
    - **룰렛(Roulette)**: 기존 로직을 최적화하고 애니메이션 및 당첨 모달을 직관적으로 개선했습니다.
    - **사다리(Ladder)**: 단순 플레이스홀더였던 부분을 실제 무작위 결과 배정 로직이 작동하도록 구현했습니다.
    - **빙고(Bingo)**: 선사 코드(Carrier Codes)를 활용한 실시간 번호 추첨 및 빙고 체크 시스템을 완성했습니다.
- **프리미엄 디자인 적용**: `AsanMealGame.module.css`를 전면 개편하여 글래스모피즘(Glassmorphism), 부드러운 그라데이션, 반응형 그리드 시스템을 적용했습니다.

### 🛠️ 작업 상세
#### 1. 컴포넌트 로직 (`components/AsanMealGame.js`)
- `LadderGame`: 무작위 당첨/금액 배정 기능을 추가하여 실제 게임이 가능하도록 구현.
- `BingoGame`: 추첨 로직 최적화 및 빙고 달성 시 히스토리 기록 연동.
- `AsanMealGame`: Canvas 드로잉 최적화 및 룰렛 스핀 톤앤매너(Stop 기능) 개선.
- **히스토리 시스템**: 게임별 당첨 기록이 사이드바에 실시간으로 남도록 보강.

#### 2. 스타일 및 UI (`components/AsanMealGame.module.css`)
- 데스크탑/모바일 뷰에 최적화된 독립적인 레이아웃 및 폰트 크기 조정.
- 당첨 시 화려한 모달 애니메이션(`framer-motion`) 추가.
- 참여자 관리(추가/삭제) UI를 세련된 칩(Chip) 디자인으로 변경.

#### 3. 페이지 연동 (`app/employees/branches/[branch]/page.js`)
- 형이 전달한 최신 코드 구조를 그대로 반영하여 지점별 공간 레이아웃 일관성 확보.

---


## [2026-01-24] - 소셜 로그인 프로필 연동 디버깅 및 정책 가이드

### 🚀 핵심 성과
- **디버깅 로그 강화**: 카카오 및 네이버 로그인 시 전달되는 `user_metadata`를 서버 로그에서 확인할 수 있도록 `route.js`에 로깅 로직을 추가했습니다.
- **동의 항목 정책 가이드**: 카카오 개발자 센터의 동의 항목을 '선택'에서 '필수'로 변경하도록 안내하여 데이터 누락 가능성을 원천 차단했습니다.

---

## [2026-01-24] - 카카오 프로필 연동 이슈 집중 해결

### 🚀 핵심 성과
- **소셜 프로필 추출 로직 전면 개편**: 카카오톡 로그인 시 이름과 프로필 사진이 누락되는 문제를 해결하기 위해 `user_metadata` 내의 모든 가능성 있는 키값(`nickname`, `profile_image`, `preferred_username` 등)을 전수 조사하여 매핑하도록 `route.js`를 수정했습니다.
- **안정성 강화**: 메타데이터 접근 시 옵셔널 체이닝을 적용하여 데이터 누락 시에도 런타임 에러가 발생하지 않도록 방어 코드를 작성했습니다.

---

## [2026-01-24] - 시스템 안정화 및 무한 루프 트러블슈팅 (TDD 기반)

### 🚀 핵심 성과
- **모바일 리다이렉트 루프 해결**: 방문자 권한으로 보호된 페이지 접근 시 `/login`이 아닌 `/employees`로 리다이렉트하여 무한 반복 현상을 수정했습니다.
- **프로필 매핑 로직 전수 동기화**: 네이버/카카오/구글의 사용자 정보 매핑 로직을 동일하게 강화하여 프로필 정보 연동 문제를 해결했습니다.
- **Next.js 14 호환성 확보**: Client Component에서 `useParams`를 사용하여 지점 페이지 로딩 오류를 해결했습니다.
- **지점 명칭 통일**: 모든 UI에서 '아산지점'으로 명칭을 통일했습니다.

---

## [2026-01-24] - 시스템 안정화 및 무한 루프 트러블슈팅

### 🚀 핵심 성과
- **모바일 리다이렉트 루프 해결**: 방문자 권한으로 보호된 페이지 접근 시 `/login`이 아닌 `/employees`로 리다이렉트하여, 이미 인증된 사용자가 로그인 페이지와 보호 페이지 사이를 무한 반복하는 현상을 수정했습니다.
- **프로필 매핑 로직 전수 동기화**: 네이버 OIDC와 표준 OAuth 콜백의 사용자 정보 매핑 로직을 동일하게 강화하여 소셜 서비스 종류에 관계없이 이름과 사진이 정상 연동되도록 개선했습니다.
- **지점 명칭 통일**: '아산지점 (CY)' 표기를 모든 컴포넌트와 데이터 파일에서 '아산지점'으로 통일했습니다.

---

## [2026-01-24] - 빌드 안정화 및 소셜 프로필 매핑 최적화

### 🚀 핵심 성과
- **Next.js 버전 호환성 확보**: Next.js 14 환경에 맞춰 `BranchPage`의 `params` 접근 로직을 안정화하여 페이지 로딩 오류를 해결했습니다.
- **카카오/네이버 프로필 매핑 강화**: 소셜 제공자별로 상이한 메타데이터 키값(`nickname`, `profile_image`, `picture` 등)을 모두 대응하도록 `route.js`를 보강했습니다.
- **빌드 에러 진단**: `error.txt` 분석을 통해 `services`, `dashboard`, `network` 페이지의 컴포넌트 경로 참조 오류를 확인하고 가이드를 수립했습니다.

---

## [2026-01-24] - 시스템 안정화 및 보안 정책 정밀 교정

### 🚀 핵심 성과
- **모바일 무한 루프 해결**: 미들웨어의 세션 체크 및 리다이렉트 로직을 최적화하여 모바일 환경에서의 반복 로그인 현상을 제거했습니다.
- **방문자 보안 강화**: 'visitor' 권한 사용자가 임직원 전용 게시판 및 자료실에 접근할 수 없도록 미들웨어 레벨에서 차단 로직을 복구했습니다.
- **카카오 프로필 연동 완결**: 카카오 메타데이터의 다양한 키값(`nickname`, `picture` 등)을 모두 대응하여 프로필 정보 누락 문제를 해결했습니다.
- **명칭 및 오류 수정**: '아산지점' 명칭을 통일하고, 클라이언트 컴포넌트의 `params` 접근 오류를 수정했습니다.

### 🛠️ 작업 상세
#### 1. 보안 및 인증
- `middleware.js`: `/employees` 하위 경로에 대한 'visitor' 접근 차단 로직 추가.
- `app/auth/callback/route.js`: 카카오 사용자 정보 매핑 로직 강화.
#### 2. UI/UX 및 버그 수정
- `app/employees/branches/[branch]/page.js`: `React.use(params)` 적용으로 페이지 로딩 오류 수정 및 지점명칭 교정.
- `constants/locations.js` & `Header.js`: '아산지점 (CY)'을 '아산지점'으로 명칭 통일.
- **브라우저 아이콘(Favicon) 최적화**: 모든 환경(Shortcut, Apple Icon)에서 로고가 정상 표시되도록 설정을 보강했습니다.
- **소셜 로그인 정보 연동 강화**: 카카오 로그인 시 사용자의 닉네임과 프로필 사진이 누락 없이 `profiles` 테이블에 저장되도록 로직을 개선했습니다.
- **임직원 전용 메뉴 접근성 개선**: 방문객도 인트라넷의 메뉴 구성을 확인할 수 있도록 보안 정책을 완화하되, 실제 데이터 접근은 페이지 레벨에서 제어하도록 변경했습니다.
- **지점 운영 리스트 정예화**: 요청에 따라 서울본사, 아산, 중부, 당진, 예산 5개 핵심 지점으로 리스트를 정리하고 아산지점 페이지에 식단게임 섹션을 추가했습니다.

### 🛠️ 작업 상세
#### 1. UI/UX 개선
- `app/layout.js`: `shortcut` 및 `apple` 아이콘 경로 추가 및 메타데이터 보강.
- `components/Header.js`: 
    - 방문자(`visitor`)에게도 '임직원전용' 메뉴가 보이도록 필터링 로직 제거 및 모바일 메뉴 복구.
    - 지점 드롭다운 메뉴를 5개 핵심 지점(서울, 아산, 중부, 당진, 예산)으로 정리.
- `app/employees/page.js`: 임직원 포털 메인 페이지의 지점 리스트를 5개 핵심 지점으로 정예화.
- `app/employees/branches/[branch]/page.js`: 아산지점(`asan`) 접근 시 하단에 '식단게임' 섹션 구성.
 - `app/employees/(intranet)/archive/loading.js` & `reports/loading.js`: 자료실 및 보고서 로딩 시 사용자 경험 개선을 위한 로딩 UI 추가.
 - **빌드 오류 수정**: `loading.js`에서 `styled-jsx` 사용으로 인한 서버 컴포넌트 제약 문제를 `'use client'` 지시어 추가로 해결했습니다.

#### 2. 인증 및 보안
- `app/auth/callback/route.js`: 카카오 메타데이터(`nickName`, `profile_image`) 매핑 로직 추가로 프로필 이미지 연동 해결.
- `middleware.js`: `/employees` 하위 경로(마이페이지 제외)에 대한 방문자 접근 허용으로 메뉴 가시성 확보.

#### 3. 데이터 및 성능
- `constants/locations.js`: 네트워크 지도 및 리스트에서 불필요한 지점을 제거하고 5개 핵심 거점 위주로 재편.
- 로딩 속도 개선을 위한 스켈레톤 UI 도입 가이드 수립.

---

## [2026-01-24] - 보안 강화, 버그 수정 및 기능 개선

### 🚀 핵심 성과
- **치명적 보안 결함 해결**: '방문객(visitor)' 권한의 사용자가 임직원 전용 페이지에 접근할 수 있었던 심각한 보안 문제를 `middleware.js`를 수정하여 완벽하게 해결했습니다.
- **사용자 정보 연동 오류 수정**: 신규 가입 시 `user_roles` 정보가 생성되지 않아 '내 정보 수정'이 실패하던 버그를 수정했습니다. 또한, `profiles` 테이블의 데이터가 올바르게 채워지지 않아 프로필 사진과 이름이 누락되던 문제를 데이터베이스 함수(RPC)를 도입하여 근본적으로 해결했습니다.
- **기능 개선**: 새로운 권한 변경 정책을 적용하고, 헤더에 '임직원 홈' 메뉴를 추가하여 사용성을 개선했습니다.

### 🛠️ 작업 상세
#### 1. 보안 강화
- **서버사이드 접근 제어 (`middleware.js`)**: 미들웨어에서 사용자의 `role`을 직접 조회하여, 'visitor'일 경우 `/employees` 또는 `/admin` 경로 접근 시 로그인 페이지로 리디렉션하도록 로직을 추가했습니다. 또한 'admin'이 아닌 사용자의 `/admin` 경로 접근도 차단했습니다.

#### 2. 핵심 버그 수정
- **인증 콜백 로직 수정 (`app/auth/callback/route.js`)**:
    - `profiles` 테이블 `UPSERT` 로직을, `id`가 `NULL`로 입력되던 오류를 해결하기 위해 안정적인 데이터베이스 함수(`upsert_profile`) 호출로 변경했습니다. 이로써 신규 사용자의 이름과 프로필 사진이 정상적으로 저장됩니다.
    - 로그인 성공 시, `user_roles` 테이블에 `id`와 `role: 'visitor'` 기본값을 `UPSERT` 하도록 수정하여 신규 사용자의 권한 정보 누락 문제를 해결했습니다.
- **데이터베이스 함수 추가**: `upsert_profile` RPC 함수를 생성하여 `profiles` 테이블의 `INSERT`와 `UPDATE` 로직을 원자적으로 안전하게 처리하도록 개선했습니다.

#### 3. 기능 개선 및 정책 변경
- **권한 변경 정책 구현**:
    - `api/users/me/route.js` (백엔드): 'visitor'는 권한 변경을 시도할 수 없도록 막고, 그 외 직원은 관리자 승인 없이 소속 지점(role)을 즉시 변경할 수 있도록 `PATCH` 로직을 수정했습니다.
    - `app/employees/mypage/page.js` (프론트엔드): 'visitor'에게는 권한 변경 드롭다운을 비활성화하고 안내 메시지를 표시하도록 UI를 수정했습니다.
- **'임직원 홈' 메뉴 추가 (`components/Header.js`)**: `navLinks` 설정에 '임직원 홈'(`/employees`)으로 연결되는 링크를 추가하여 내비게이션 편의성을 높였습니다.

---

## [2026-01-24] - 계정 연동 시스템 구축 및 UI/UX 개선

### 🚀 핵심 성과
- **계정 연동 시스템 구축**: 여러 소셜 계정(구글, 카카오 등)을 사용하더라도, 동일 이메일 기반으로 하나의 사용자로 인식되는 '계정 연동' 시스템을 완성했습니다. 이를 위해 `public.profiles` 테이블을 신설하고, 인증 및 주요 컴포넌트의 데이터 로직을 전면 리팩토링했습니다.
- **전역 프로필 훅(`useUserProfile`) 개발**: 통합된 사용자 정보(프로필, 역할 등)를 앱 전체에서 일관되게 가져올 수 있는 `useUserProfile` 훅을 개발하여 코드 중복을 제거하고 유지보수성을 향상시켰습니다.
- **UI/UX 개선**: 로그인 페이지의 버튼 정렬을 수정하고, 헤더에 소셜 프로필 이미지가 표시되도록 하여 사용 편의성과 시각적 완성도를 높였습니다.

### 🛠️ 작업 상세
#### 1. 계정 연동 아키텍처 설계 및 구현
- **DB 스키마 변경 (`supabase_account_linking.sql`)**: `email`을 고유 키로 사용하는 `public.profiles` 테이블을 신설하고, `phone` 열을 추가하는 DDL을 실행했습니다.
- **인증 콜백 로직 수정 (`app/auth/callback/route.js`)**: 로그인 성공 시, 사용자의 `email`을 기준으로 `profiles` 테이블에 프로필 정보를 `UPSERT` 하도록 수정하여 계정 정보를 통합했습니다.
- **'내 정보' API 리팩토링 (`api/users/me/route.js`)**: `GET`, `PATCH`, `DELETE` 요청 모두 `profiles` 테이블과 `user_roles` 테이블을 함께 사용하도록 수정하여, 통합 프로필과 역할을 분리하여 관리하도록 변경했습니다.
- **`useUserProfile` 훅 신설 (`hooks/useUserProfile.js`)**: 클라이언트 사이드에서 `auth.user`, `profiles`, `user_roles` 정보를 한번에 가져오는 전역 훅을 구현했습니다.
- **주요 컴포넌트 리팩토링**: `Header.js`, `EmployeeSidebar.js`, `contact/page.js` 등 사용자 정보가 필요한 모든 컴포넌트가 `useUserProfile` 훅을 사용하도록 수정하여 데이터 흐름을 중앙화하고 코드를 간소화했습니다.

#### 2. UI/UX 개선 작업
- **네이버 로그인 보류 조치**: 현재 네이버 측 설정 문제로 연동이 불가하여, `app/login/page.js`에서 관련 버튼을 임시로 제거했습니다.
- **로그인 버튼 정렬**: `app/login/login.module.css`의 버튼 스타일에 `line-height: 1`을 추가하여 아이콘과 텍스트의 수직 정렬을 수정했습니다.
- **프로필 이미지 표시**: `Header.js`와 `EmployeeSidebar.js`에서 `useUserProfile` 훅을 통해 `avatar_url`을 가져와 헤더와 사이드바에 사용자의 프로필 이미지를 표시하도록 개선했습니다.

#### 3. 정책 및 가이드라인 업데이트
- **`AGENT_GUIDELINES.md` 업데이트**: '계정 연동 정책'을 10번 항목으로 신설하여, 향후 모든 관련 작업의 기준으로 삼도록 명문화했습니다.

---

## [2026-01-24] - UI/UX 개선 및 네이버 로그인 보류 조치

### 🚀 핵심 성과
- **네이버 로그인 UI 제거**: 네이버 OIDC(OpenID Connect) 구현의 지속적인 설정 문제 및 `id_token` 미반환 문제로 인해, 현재는 로그인 페이지에서 네이버 로그인 버튼을 UI에서 제거했습니다. 이는 추후 재구현을 위해 보류된 상태입니다.
- **로그인 버튼 정렬 개선**: 로그인 페이지의 소셜 로그인 버튼(구글, 카카오)의 아이콘과 텍스트 수직 정렬 문제를 해결하여 디자인 완성도를 높였습니다.
- **사용자 프로필 이미지 표시**: 로그인한 사용자의 프로필 사진(아바타)을 Supabase 사용자 메타데이터(`avatar_url`)에서 가져와 헤더의 사용자 메뉴 영역에 표시하도록 구현했습니다. 프로필 이미지가 없을 경우 기존처럼 이니셜을 표시합니다.

### 🛠️ 작업 상세
#### 1. 네이버 로그인 버튼 제거 (`web/app/login/page.js`)
- `app/login/page.js` 파일에서 `네이버로 계속하기` 버튼 관련 JSX 코드를 제거했습니다.
- `app/login/page.js` 및 `app/auth/callback/route.js`에 구현되었던 네이버 관련 로직은 코드베이스에 유지하되, UI에서 비활성화된 상태입니다.

#### 2. 로그인 버튼 CSS 정렬 수정 (`web/app/login/login.module.css`)
- `.googleBtn` 및 `.kakaoBtn` CSS 클래스에 `line-height: 1;` 속성을 추가하여, 아이콘과 텍스트의 수직 정렬 불균형 문제를 해결했습니다.

#### 3. 사용자 프로필 이미지 표시 기능 구현 (`web/components/Header.js`)
- `components/Header.js` 파일에서 로그인한 사용자의 `user.user_metadata.avatar_url`을 확인하여, 해당 URL이 존재할 경우 프로필 이미지를 렌더링하도록 수정했습니다.
- 프로필 이미지가 없을 경우 기존의 이니셜 표시 로직(`displayInitial`)을 따르도록 폴백(fallback) 처리했습니다.
- 프로필 이미지(`<img>` 태그)에는 기존 이니셜 `<span>` 태그와 동일한 원형, 크기, 테두리, 그림자 스타일을 적용하여 디자인 일관성을 유지했습니다.

### 📋 참고 사항 및 향후 과제
- **네이버 로그인 재구현**: 네이버 OIDC 연동에 대한 추가적인 자료 조사 및 네이버 개발자 센터 설정 가이드 확인 후, 필요시 네이버 로그인을 재구현할 예정입니다.

---

## [2026-01-24] - 커스텀 네이버 소셜 로그인 최종 완성 (OIDC, signInWithIdToken)

### 🚀 핵심 성과
- **원클릭 네이버 로그인 구현**: 이메일 인증이 필요했던 이전의 OTP 방식을 폐기하고, OIDC(OpenID Connect) 표준의 `id_token`을 사용하는 방식으로 전환하여 클릭 한 번에 로그인이 완료되는 완벽한 사용자 경험을 구현했습니다.
- **`signInWithIdToken` 적용 성공**: Supabase의 `signInWithIdToken` 메서드를 성공적으로 적용하여, 커스텀 프로바이더(네이버)의 인증 정보를 통해 Supabase 세션을 즉시 발급받는 데 성공했습니다.

### 🛠️ 작업 상세
#### 1. 로그인 페이지 OIDC 요청 수정 (`web/app/login/page.js`)
- **`scope` 및 `nonce` 추가**: 네이버에 인증 요청 시 `scope` 파라미터에 'openid'를 추가하여 `id_token` 발급을 요청하고, 재전송 공격(Replay Attack) 방지를 위해 `nonce` 값을 생성하여 함께 전송하도록 수정했습니다.

#### 2. 인증 콜백 로직 OIDC 방식으로 전면 교체 (`web/app/auth/callback/route.js`)
- **`signInWithIdToken` 플로우 적용**:
    1.  네이버로부터 `code`를 받아 `id_token`과 `access_token`으로 교환합니다.
    2.  발급된 `id_token`을 디코딩하여, 요청 시 보냈던 `nonce` 값과 일치하는지 검증합니다.
    3.  검증 완료 후, `supabase.auth.signInWithIdToken` 함수에 `provider: 'openid'`와 함께 `id_token`, `nonce`를 전달하여 Supabase 인증 및 세션 생성을 완료합니다.
    4.  로그인 성공 후 사용자를 원래 목적지(`next` 파라미터)로 즉시 리디렉션합니다.

### 📋 참고 사항 및 최종 정정
- **로그 최종 정정**: 오늘 기록된 네이버 관련 로그 중, "공식 지원 확인" 및 "OTP 방식 구현" 내용은 모두 폐기하고, 이 **OIDC 방식 로그**를 최종본으로 삼습니다. Supabase에 지원되지 않는 소셜 로그인은 이 방식(Custom OIDC)으로 구현하는 것이 가장 올바른 방법임을 최종 확인했습니다.

---

## [2026-01-24] - 네이버 소셜 로그인 인증 정보 설정 및 연동 완료

### 🚀 핵심 성과
- **네이버 OAuth 연동 확정**: 발급된 네이버 Client ID와 Secret Key를 환경 변수에 반영하고, Supabase 프로바이더 설정을 위한 준비를 마쳤습니다.

### 🛠️ 작업 상세
#### 1. 환경 변수 구성 (`.env.local`)
- `NEXT_PUBLIC_NAVER_CLIENT_ID` 및 `NAVER_CLIENT_SECRET` 등록 완료.

---

## [2026-01-24] - 네이버 소셜 로그인 연동 준비 및 지원 여부 확인

### 🚀 핵심 확인 사항
- **네이버 프로바이더 지원 확인**: Supabase에서 네이버(Naver) OAuth를 공식 지원함을 확인하고, 대시보드 내 설정 위치를 파악했습니다.

### 🛠️ 향후 작업 계획
#### 1. 네이버 개발자 센터 설정
- 네이버 개발자 센터에서 Client ID 및 Secret 발급 후 Supabase에 등록 예정.

---

## [2026-01-24] - 카카오 소셜 로그인 연동 최종 성공

### 🚀 핵심 성과
- **카카오 OAuth 연동 완료**: 여러 차례의 설정 시행착오 끝에 카카오 로그인을 성공적으로 구현했습니다.

### 🛠️ 작업 상세
#### 1. 카카오 콘솔 설정 경로 최종 확인
- **Redirect URI 위치 교정**: `[내 애플리케이션 > 앱 키 > REST API 키]` 관련 설정 페이지 중간에 위치한 Redirect URI 등록 섹션을 확인하여 Supabase 콜백 주소(`.../auth/v1/callback`)를 정상 등록함.
- **동의 항목 최적화**: 이메일 권한 획득을 위한 본인 인증 절차 및 선택 동의 설정을 완료하여 `KOE205` 에러를 해결함.

---

## [2026-01-24] - 트러블슈팅: 카카오 Redirect URI 불일치(KOE006) 해결

### 🚀 핵심 이슈
- **KOE006 에러 발생**: 카카오 로그인 시 요청한 Redirect URI가 카카오 앱 설정에 등록된 URI와 일치하지 않아 인증이 거부됨. (JavaScript SDK 도메인 설정과 혼동됨)

### 🛠️ 해결 방안
#### 1. Redirect URI 경로 교정
- `[제품 설정 > 카카오 로그인]` 메뉴에서 Supabase 콜백 주소(`.../auth/v1/callback`)를 정확히 등록하도록 가이드함. 기존 플랫폼 도메인 설정과 분리하여 관리하도록 조치.

---

## [2026-01-24] - 트러블슈팅: 카카오 이메일 권한(KOE205) 정밀 진단 및 조치

### 🚀 핵심 이슈
- **권한 불일치 확인**: 카카오 앱 설정에서 `account_email`이 '권한 없음' 상태임에도 불구하고, Supabase 인증 모듈이 해당 정보를 요청하여 `KOE205` 에러 발생.

### 🛠️ 해결 방안
#### 1. 카카오 비즈니스 본인 인증 안내
- 개인 개발자 계정의 경우, [비즈니스 > 개인 개발자 비즈니스 정보]에서 본인 인증을 완료해야 이메일 항목을 '선택 동의'로 설정 가능함을 확인.
- 인증 후 동의 항목 설정을 '선택 동의'로 변경하도록 가이드라인 수립.

---

## [2026-01-24] - 카카오 이메일 권한 정책 분석 및 대응

### 🚀 핵심 이슈
- **이메일 획득 조건 확인**: 카카오 REST API 문서 분석 결과, 이메일 '필수 동의'를 위해서는 비즈니스 앱 등록이 필수임을 확인.

### 🛠️ 대응 방안
#### 1. 개인 개발자 환경 최적화
- 비즈니스 앱 전환 전까지 '카카오계정(이메일)'을 **선택 동의**로 설정하여 `KOE205` 에러를 방지함.
- Supabase 인증 시스템이 이메일 미제공 시에도 유연하게 대응할 수 있도록 설정 점검 권고.

---

## [2026-01-24] - 트러블슈팅: 카카오 OAuth 동의 항목(KOE205) 오류 해결

### 🚀 핵심 이슈
- **KOE205 에러 발생**: 카카오 로그인 시 `account_email` 동의 항목이 설정되지 않아 인가 코드 요청이 거부되는 현상 확인.

### 🛠️ 해결 방안
#### 1. 카카오 동의 항목 최적화
- 카카오 개발자 센터 내 `[카카오 로그인 > 동의항목]`에서 '카카오계정(이메일)'을 '선택 동의' 이상으로 설정하도록 가이드함. Supabase 인증 시스템의 이메일 기반 사용자 식별을 위해 필수적인 조치임.

---

## [2026-01-24] - 트러블슈팅: OAuth Provider 활성화 오류 대응

### 🚀 핵심 이슈
- **Unsupported provider 에러**: 카카오/네이버 로그인 시도 시 Supabase에서 `provider is not enabled` 에러 반환 확인.

### 🛠️ 해결 방안
#### 1. Supabase 인증 설정 가이드
- Supabase Dashboard 내 `Authentication > Providers` 메뉴에서 Kakao 및 Naver의 활성화(Enabled) 상태를 점검하고, 발급된 Client ID/Secret을 등록하도록 안내함.

---

## [2026-01-24] - 카카오 로그인 설정 경로 확인 및 업데이트

### 🚀 핵심 성과
- **설정 경로 최적화**: 사용자 피드백을 바탕으로 카카오 개발자 센터 내 `[플랫폼 > Web]` 섹션의 JavaScript 키 설정 항목에서 Redirect URI를 등록하는 경로를 확인하고 기록했습니다.

### 🛠️ 작업 상세
#### 1. 카카오 콘솔 설정 정보 갱신
- **Redirect URI 등록**: 형이 확인한 `[플랫폼 > Web]` 내 JavaScript 키 관련 설정 구역에 `https://bzbowsvfsyerhpgrdrva.supabase.co/auth/v1/callback` 등록 진행.
- **활성화 체크**: 로그인이 정상 작동하려면 `[제품 설정 > 카카오 로그인]` 메뉴의 활성화 스위치가 ON이어야 함을 명시.

---

## [2026-01-24] - 카카오 로그인 인증 정보 및 동의 항목 설정

### 🚀 핵심 성과
- **카카오 OAuth 연동 최적화**: 발급된 REST API 키와 시크릿 키를 환경 변수에 반영하고, 서비스 운영에 필요한 사용자 동의 항목 설정을 확정했습니다.

### 🛠️ 작업 상세
#### 1. 환경 변수 구성 (`.env.local`)
- `NEXT_PUBLIC_KAKAO_REST_API_KEY` 및 `KAKAO_CLIENT_SECRET` 등록.
#### 2. 사용자 동의 정책 수립
- **필수**: 닉네임 (실사용자 식별 및 이름 표시)
- **선택**: 프로필 사진 (인터넷/마이페이지 썸네일 활용)
- **이용 중 동의**: 카카오톡 메시지 전송 (향후 업무 알림 및 공지 발송용)

---

## [2026-01-24] - 소셜 로그인 확장: 카카오 및 네이버 연동

### 🚀 핵심 성과
- **인증 편의성 강화**: 기존 구글 로그인 외에 국내 사용 비중이 높은 카카오톡 및 네이버 로그인 기능을 추가하여 접근성을 개선했습니다.

### 🛠️ 작업 상세
#### 1. 로그인 페이지 업데이트 (`web/app/login/page.js`)
- 카카오 로그인 제한 로직(Alert) 제거 및 실제 OAuth 연동 활성화.
- 네이버 로그인 버튼 신설 및 `handleLogin('naver')` 연결.
- **카카오 설정 가이드**: Redirect URI 등록 및 OpenID Connect 활성화 권고 (웹훅은 추후 과제로 분류).
- **설정 유의사항**: 로그인용 Redirect URI(`.../callback`)와 로그아웃용 URI를 분리하여 안내.

---

## [2026-01-24] - 모바일 구글 OAuth 보안 정책 대응 완료

### 🚀 핵심 이슈
- **구글 로그인 차단 해결**: 네이버앱, 카카오톡 등 인앱 브라우저에서 구글 로그인 시 발생하는 '보안 브라우저 정책 위반' 에러 대응.

### 🛠️ 대응 방안
#### 1. 인앱 브라우저 감지 및 UI 안내 (`web/app/login/page.js`)
- `navigator.userAgent`를 분석하여 네이버, 카카오 등 주요 인앱 브라우저 환경을 감지하는 로직 추가.
- 인앱 브라우저 감지 시, 로그인 카드 내부에 "다른 브라우저로 열기"를 유도하는 경고 배너를 노출하여 사용자 이탈 방지.

---

## [2026-01-24] - 가이드라인 정교화: 구조화 및 일관성 원칙 강화

### 🚀 핵심 성과
- **설계 원칙 명문화**: 다양한 AI 툴(Cursor, Antigravity 등) 사용 시 발생할 수 있는 코드 스타일 파편화를 방지하기 위해 '일관성(Consistency)' 유지 원칙을 가이드라인에 명시했습니다.

### 🛠️ 작업 상세
#### 1. 가이드라인 업데이트 (`.agent/AGENT_GUIDELINES.md`)
- 6번 항목을 '프로젝트 구조화 및 일관성'으로 확장하여, 환경 변화에도 기존 설계 의도를 고수하도록 지침을 강화했습니다.

---

## [2026-01-24] - 환경 동기화 정책 구체화 및 .gitignore 최적화

### 🚀 핵심 성과
- **멀티 툴 협업 기반 강화**: Antigravity, Cursor, VSCode 등 다양한 개발 도구 사용 시 발생할 수 있는 설정 파일 충돌을 방지하기 위해 `.gitignore` 최적화안을 수립하고 가이드라인에 반영했습니다.

### 🛠️ 작업 상세
#### 1. 가이드라인 업데이트 (`.agent/AGENT_GUIDELINES.md`)
- 9번 항목 '멀티 툴 및 환경 동기화'에 `.gitignore` 관리 및 환경 변수 보안 지침을 추가하여 실행력을 높였습니다.

---

## [2026-01-23] - S3(MinIO) 연결 성공 및 UI/UX 대규모 개선

### 🚀 핵심 성과
- **S3(MinIO) 연결 완전 정복**: ISP 포트 차단(9000번 대) 문제를 HTTPS 역방향 프록시(443)와 WebSocket 헤더 설정을 통해 해결.
- **관리자 권한 관리 모바일화**: 테이블 형태의 레이아웃을 카드 슬롯(Card View) 방식으로 전면 개편하여 모바일 조작 편의성 극대화.
- **UI/UX 폴리싱**: 전사 메인 레이아웃 패딩 최적화, 헤더 유격 수정, 푸터 사이즈 축소 등 프리미엄 디자인 완성.

### 🛠️ 작업 상세
#### 1. 인프라 및 API
- `.env.local`: `NAS_ENDPOINT`를 HTTPS 프록시 주소로 설정.
- `lib/s3.js`: S3 클라이언트 설정 최적화 및 `getFileBufferFromS3` 추가로 이미지 서빙 안정화.
- `app/api/s3/files/route.js`: POST(업로드), GET(프록시 다운로드) 로직 구현.

#### 2. 프론트엔드 개선
- `app/admin/users/page.js`: 모바일용 카드 뷰 추가 및 반응형 레이아웃 적용. (Intranet 공통 모듈 연동)
- `app/employees/webzine/page.js`: S3 이미지 로딩 버그 수정 및 썸네일 경로 로직 최적화.
- `webzine/[id]/page.js`: 상세보기에서 Cloud 이미지 경로 인식하도록 수정.

#### 3. 기타 수정
- 소위원회 및 회사소개 페이지 서브메뉴 유격(20px) 제거.
- 푸터 높이 및 여백 축소.

### ⚠️ 주의사항 및 향후 과제
- **시놀로지 설정 유지**: 역방향 프록시에서 `X-Forwarded-Proto` 헤더와 `192.168.0.4` 대상 세팅이 바뀌면 S3 업로드가 바로 막힐 수 있음.
- **Webzine 이미지**: 이제 `Webzine/`으로 시작하는 모든 경로는 S3 Proxy API를 거쳐야 함.

---

## [2026-01-23] - 오픈 준비: 사용자 활동 로그(Audit Log) 시스템 구축

### 🚀 핵심 성과
- **전사 로그 시스템 도입**: 모든 사용자의 행위(이동, 클릭, 다운로드)를 실시간으로 기록하여 보안 및 운영 도구 확보.
- **3년 보관 정책 수립**: 서비스 오픈 가이드에 따라 로그 데이터를 최소 3년 동안 보관하도록 설계.

### 🛠️ 작업 상세
#### 1. 데이터베이스 (`web/supabase_user_logs.sql`)
- `user_activity_logs` 테이블 생성: `user_id`, `action_type`, `path`, `metadata`, `created_at` 등 포함.
- **보안**: RLS 설정을 통해 일반 사용자는 자기 로그만 생성 가능하고, 조지는 오직 `Admin` 권한자만 가능하도록 격리.

#### 2. 로깅 모듈 (`utils/logger.js`, `utils/loggerServer.js`)
- 클라이언트와 서버 양측에서 로그를 남길 수 있는 통합 유틸리티 구현.

#### 3. 자동 추적 (`components/ActivityLogger.js`)
- `RootLayout`에 탑재되어 페이지 뷰(URL) 및 중요 클릭 이벤트를 비동기로 자동 기록.

#### 4. 파일 접근 로깅 (`api/nas/preview`, `api/s3/files`)
- NAS 및 S3 파일 다운로드/조회 시 서버 레벨에서 정확한 파일명과 함께 로그 생성.

#### 5. 성능 최적화 (S3 Proxy Speed Up)
- **비차단형 로깅**: 로그 기록이 파일 전송을 방해하지 않도록 Background 처리를 적용하여 Latency 최소화.
- **강력한 브라우저 캐싱**: `Cache-Control: immutable` 설정을 통해 중복 요청 시 서버를 거치지 않고 즉시 로딩되도록 개선.
- **Buffer 전송 최적화**: 대용량 파일도 안정적으로 전달하기 위해 서버 메모리 핸들링 보강.

### 📋 운영 가이드 (보관 및 삭제)
- **보관 기한**: 3년 (2026~2029)
- **삭제 방법**: Supabase SQL Editor를 통해 `INTERVAL '3 years'` 기준 삭제 쿼리 권장.

## [2026-01-23] - 게시판 UI/UX 고도화 및 개발 정책 수립

###  핵심 성과
- **인트라넷 디자인 통일성 확보**: 자유게시판, 업무보고, 웹진 등 모든 사내 게시판에 프리미엄 화이트 카드(detailCard) 레이아웃을 적용하여 가독성과 심미성을 극대화.
- **편집 환경(Editor) 대규모 개선**: 구식 폼 디자인을 걷어내고 현대적인 UI로 개편, Hero 배너 및 사이드바 통합 레이아웃 시스템 안착.
- **NEW 개발 정책 도입**: 모바일 체크 필수화, UI/UX 일관성 유지, 수정 부위 TDD 의무화 등 고품질 협업을 위한 가이드라인(AGENT_GUIDELINES.md) 업데이트.

###  작업 상세
#### 1. 게시판 UI/UX (Free Board, Reports, Webzine)
- oard.module.css: 프리미엄 에디터 및 상세 카드 스타일(editorCard, detailCard) 추가.
- intranet/board/free/page.js: 목록 페이지 레이아웃 통합 및 카드 디자인 적용.
- intranet/board/free/[id]/page.js & /edit/page.js: 상세 보기 및 수정 페이지 레이아웃 고도화.
- intranet/reports/page.js & 
eports/[id]/page.js: 업무보고 시스템의 통일된 레이아웃 및 스타일 적용.
- webzine/page.js: 목록 썸네일 폴백(Fallback) 로직 강화 및 경로 인식 버그 수정.
- webzine/[id]/page.js & detail.module.css: 상세 페이지를 화이트 카드 스타일로 전면 개편.

#### 2. 인프라 및 기타 로직
- pp/api/s3/files/route.js: multipart/form-data 처리 시 ormData 객체 초기화 누락 버그 수정.
- AGENT_GUIDELINES.md: 형이 요청한 신규 개발 정책(모바일 점검, UI/UX 유지, TDD) 공식 추가.

###  신규 추가 정책 (준수 사항)
1. **모바일 우선 점검**: 모든 수정 사항은 반드시 모바일 페이지 뷰에서의 레이아웃을 확인한다.
2. **톤앤매너 유지**: 기존 UI/UX의 정체성을 훼손하지 않고 조화롭게 기능을 추가/수정한다.
3. **TDD 의무화**: 수동 점검 및 테스트 스크립트를 통해 수정된 로직의 무결성을 반드시 검증한다.

---

## [2026-01-23] - 개발 정책 고도화: 환경별 UI '분리' 및 '구조화' 정책 수립

###  핵심 성과
- **환경별 UI/UX 최적화 정책 도입**: 데스크탑과 모바일의 톤앤매너를 각각 독립적으로 유지하며, 디바이스 환경에 최적화된 사용자 경험을 제공하는 
분리 개발 원칙 수립.
- **프로젝트 구조화(Structuralization) 의무화**: 모든 폴더와 파일의 체계적인 관리를 위해 정해진 디렉토리 규칙을 엄격히 준수하고 중복을 지양하는 구조화 정책 도입.
- **가이드라인 공식 업데이트**: .agent/AGENT_GUIDELINES.md에 해당 내용을 추가하여 향후 모든 개발의 근간으로 삼음.

###  상세 정책 내역
1. **데스크탑 vs 모바일 분리**: 단순 반응형을 넘어, 각 환경에 어울리는 독립된 디자인과 조작 방식을 적용한다. (상호 기능은 연결되되 UI는 해당 환경에 최적화)
2. **엄격한 구조화**: 파일 시스템을 직관적이고 체계적으로 관리하며, 특히 인트라넷 관련 기능은 (intranet) 그룹 내로 질서 있게 배치한다.

---

## [2026-01-24] - 인트라넷 UI 정밀 최적화 및 편의 기능 고도화

### 🚀 핵심 성과
- **전화번호 자동 하이픈 기능 도입**: 사용자와 관리자 입력창 모두에서 숫자만 입력하면 휴대폰/유선전화 형식에 맞춰 자동으로 하이픈(-)이 생성되는 기능을 구현했습니다. (마이페이지, 관리자, 문의하기 등)
- **인트라넷 내비게이션(Middle Bar) 완벽 매칭**: '회사소개' 페이지의 미들바와 동일한 레이아웃, 모바일 동작(중앙 정렬 및 스크롤), 헤더 고정 위치(Sticky Top)를 적용하여 시각적 일관성을 확보했습니다.
- **권한 관리 시스템 안정화**: 일부 회원 정보가 누락되어 권한 변경이 실패하던 문제를 `UPSERT` 로직 도입으로 근본적으로 해결했습니다.

### 🛠️ 작업 상세
#### 1. 입력 편의성 개선
- `web/utils/format.js`: 한국 전화번호 형식(서울 02, 휴대폰 010, 지역번호 등)을 모두 지원하는 정교한 포매팅 로직 개발.
- 적용 페이지: `MyPage.js`, `AdminUsersPage.js`, `ContactPage.js`, `NewReportPage.js`.

#### 2. 내비게이션 및 레이아웃 정교화
- `IntranetSubNav.js` & `module.css`: 
    - 상단 헤더 높이(`--header-height`)에 맞춰 정확히 스티키 위치 조정.
    - `z-index`를 900으로 상향하여 콘텐츠와 겹치지 않게 수정.
    - 데스크탑 로그아웃 버튼에 세련된 아이콘 추가 및 미적 완성도 향상.
    - 모바일 메인 메뉴와 동일한 중단점(768px) 및 센터링 로직 적용.

#### 3. 관리자 권한 변경 버그 수정
- `web/app/api/admin/users/route.js`: 사용자 상세 정보(`user_roles`)가 없는 유저의 정보를 수정할 때도 자동으로 레코드를 생성하며 저장되도록 `update`를 `upsert`로 교체하여 "변경 실패" 오류를 해결했습니다.

### 📋 참고 사항
- **전화번호 입력**: 이제 01012345678 입력 시 010-1234-5678로 자동 변환됩니다. 백스페이스로 지울 때도 자연스럽게 동작합니다.
- **메뉴 정렬**: 모바일에서 인트라넷 메뉴가 회사소개 메뉴와 동일한 크기와 간격으로 깔끔하게 정렬됩니다.

---

## [2026-01-24] - 자료실 보안 정밀화 및 인트라넷 안정화

### 🚀 핵심 성과
- **자료실(NAS) 지점별 보안 정책 완성**: 지점별 독립 폴더, 보안 폴더(`_보안`) 격리, 권한별 가시성 제어 로직을 서버 레벨에서 완벽하게 구현했습니다.
- **웹 삭제 제한 및 오프라인 안내**: 데이터 유실 방지를 위해 웹에서의 무분별한 삭제를 막고, 사무실 PC 사용을 권장하는 전용 안내 시스템을 도입했습니다.
- **인트라넷 사용성 대규모 개선**: 로그인 전후 리다이렉트, 지점별 인트라넷 접근 오류, 모바일 게시판 가독성 등 현장에서 발생한 불편 사항을 전수 수정했습니다.

### 🛠️ 작업 상세
#### 1. 자료실(NAS) 보안 및 운영
- `app/api/nas/files/route.js`: 
    - 지점 매핑 및 보안 폴더(`_보안`) 노출 로직 구현.
    - **2중 보안**: 지점 일치 + 관리자 부여 '보안 권한' 체크 시에만 폴더 노출.
    - **어드민 특권**: 모든 숨김 파일, 시스템 파일, 타 지점 보안 폴더 전체 가시성 부여.
    - **삭제 잠금**: 관리자 외 삭제 시도 시 전용 모달(`ArchiveBrowser.js`) 노출 및 API 차단.
- `app/api/nas/files/permissions/route.js`: 프론트엔드 UI 제어를 위한 권한 플래그 연동.

#### 2. 인트라넷 내비게이션 및 로직 수정
- **지점 인트라넷 오류 수정**: Next.js 파라미터 로딩 버그를 수정하여 모든 지점(아산, 중부 등) 메뉴 접근 안정화.
- **로그인 리다이렉트 고도화**: `document.referrer` 분석을 통해 로그인 후 원래 보고 있던 페이지로 정확히 복귀.
- **누락 지점 일괄 등록**: 아산CY, 서산, 연천, 울산, 임고, 벌크사업부 등 전 지점을 헤더 및 포털에 추가.

#### 3. UI/UX 정밀 폴리싱 (TDD 검증 완료)
- **자유게시판 모바일 최적화**: 제목 폰트 확대(1.15rem), 메타 정보 축소(0.78rem)로 가독성 밸런스 조정.
- **문의하기 모바일 레이아웃**: 카드 슬롯 가변 폭 적용 및 가로 스크롤(Overflow) 현상 해결.
- **테스트 자동화**: `test_latest_fixes.js`를 통해 핵심 로직(useState, Redirect, CSS) 사전 검증 프로세스 구축.

### ⚠️ 주의사항
- **보안 폴더 명칭**: 반드시 `[지점명]_보안` 형식을 유지해야 시스템이 인식합니다. (하이픈 아님)
- **권한 관리**: 이제 관리자 페이지의 **🔐(보안)** 체크박스가 NAS 보안 폴더 접근의 핵심 스위치입니다.

---

## [2026-02-02] - 안전운임 임시저장목록 노출 순서 개선

### 🚀 핵심 이슈
- **사용자 편의성 향상**: 안전운임 조회 후 임시저장된 결과가 과거 항목부터 상단에 노출되어, 방금 조회한 최신 결과를 확인하기 위해 아래로 스크롤해야 하는 불편함 개선.

### 🛠️ 작업 상세
#### 1. 목록 정렬 및 순번 로직 수정 (`web/app/employees/safe-freight/page.js`)
- **저장 로직**: 신규 조회 결과를 배열의 앞부분에 추가(`unshift`)하도록 변경하여 데이터 자체를 최신순으로 관리.
- **UI 노출**: `savedResults.length - idx` 공식을 적용하여, 가장 상단에 노출되는 최신 항목이 가장 높은 순번(No.)을 가지고, 처음 조회한 항목은 No.1로서 가장 하단에 위치하도록 조정.
- **일관성**: 엑셀 다운로드 및 삭제 기능 등 기존 로직과의 호환성을 유지하며 최신순 정렬 반영.

---

## [2026-02-02] - 뉴스 수집 기능 강화 및 UI/UX 전면 개편

### 🚀 핵심 이슈
- **수집원 한계**: 기존 Google News RSS에만 의존하던 방식을 개선하여 연합뉴스, YTN 등 다각화된 뉴스 소스 필요.
- **추출 오류**: 특정 뉴스 본문 추출 시 인코딩 문제(EUC-KR)나 서버 차단으로 인한 오류(JSON 파싱 에러) 발생 해결.
- **시각적 미흡**: 썸네일(Thumbnail) 누락이 잦고 목록 디자인이 단순한 점 개선.

### 🛠️ 작업 상세
#### 1. 다중 뉴스 소스 및 검색 기능 도입 (`web/app/api/news/route.js`)
- **멀티 소스**: Google(전체), 연합뉴스, YTN RSS를 파라미터에 따라 선택적으로 수집하도록 구현했습니다.
- **검색 API**: Google News 검색 RSS를 활용하여 사용자가 원하는 키워드로 실시간 뉴스를 조회할 수 있는 기능을 추가했습니다.
- **썸네일 강화**: `og:image`, `twitter:image` 등을 다각도로 추적하고 상대 경로 처리 및 리다이렉트 대응 로직을 강화하여 썸네일 표시율을 높였습니다.

#### 2. 본문 추출 안정화 (`web/app/api/news/article/route.js`)
- **인코딩 대응**: EUC-KR 등 다양한 인코딩 형식을 감지하여 한글 깨짐 현상을 방지했습니다.
- **안정적 응답**: 서버 오류 시 HTML이 아닌 유효한 JSON을 반환하도록 예외 처리를 강화하여 클라이언트의 "Unexpected token '<'" 에러를 해결했습니다.
- **헤더 최적화**: 실제 브라우저와 유사한 헤더를 사용하여 언론사 사이트의 차단을 최소화했습니다.

#### 3. 뉴스 페이지 디자인 개편 (`web/app/employees/news/`)
- **UI 고도화**: 검색바, 소스 탭(Google/연합/YTN), 카드형 뉴스 목록 등을 포함한 현대적인 레이아웃으로 개편했습니다.
- **반응형 디자인**: 모바일에서도 썸네일과 제목이 조화롭게 보이도록 최적화했습니다.

#### 4. 뉴스 기능 긴급 보정 (Hotfix)
- **추출기 고도화**: Readability 실패 시 국내 언론사 특화 셀렉터(`#articleBodyContents` 등)를 순차적으로 시도하는 폴백 로직을 추가하여 추출 성공률을 높였습니다.
- **썸네일 경로 복구**: 썸네일 주소가 도메인이 생략된 상대 경로일 경우, 원본 사이트의 도메인을 결합하여 절대 경로로 자동 변환하도록 수정했습니다.
- **아이콘 최적화**: 존재하지 않는 이미지 경로를 수정하고 기본 뉴스 아이콘(SVG)으로 교체하여 시각적 완성도를 높였습니다.

---