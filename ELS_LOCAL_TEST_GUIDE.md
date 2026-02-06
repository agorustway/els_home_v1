# 🚀 ELS 컨테이너 이력조회 로컬 테스트 가이드

## ✅ 수정 완료 내역 (2026-02-06 14:25)

### 1️⃣ **백엔드 CORS 설정 수정**
- **파일**: `docker/els-backend/app.py`
- **변경**: CORS를 와일드카드(`*`)로 변경하여 모든 포트 허용
- **이유**: 프론트엔드가 2929 포트로 접속하는데 CORS가 3000만 허용하던 문제 해결

### 2️⃣ **결과 데이터 구조 통일**
- **파일**: `docker/els-backend/app.py` (196번 줄)
- **변경**: `df.to_dict('records')` → `df.values.tolist()`
- **이유**: 프론트엔드가 `row[j]` 인덱스로 접근하는데 객체 배열이 반환되던 문제 해결

### 3️⃣ **프론트엔드 테이블 렌더링 수정**
- **파일**: `web/app/employees/container-history/page.js` (240번 줄)
- **변경**: `HEADERS.map((_, j) => row[j])` → `row.map((cell, j) => cell || '')`
- **이유**: 배열 길이 불일치로 인한 렌더링 오류 방지

### 4️⃣ **데몬 에러 핸들링 강화**
- **파일**: `elsbot/els_web_runner_daemon.py`
- **변경**: 로그인/조회 실패 시 `traceback.print_exc()` 추가
- **이유**: 디버깅 용이성 향상

### 5️⃣ **브라우저 표시 옵션 추가**
- **파일**: `elsbot/els_bot.py` (147번 줄)
- **변경**: `HEADLESS` 환경 변수로 headless 모드 제어
- **이유**: 로컬 테스트 시 브라우저 동작 확인 가능

---

## 🔧 로컬 테스트 환경 구축

### 1단계: 필수 패키지 설치

```powershell
# Python 패키지 설치 (elsbot 폴더에서)
cd c:\Users\hoon\Desktop\els_home_v1\elsbot
pip install flask flask-cors pandas openpyxl selenium webdriver-manager

# 또는 requirements.txt 사용
cd c:\Users\hoon\Desktop\els_home_v1\docker\els-backend
pip install -r requirements.txt
```

### 2단계: 계정 설정 파일 생성

`elsbot/els_config.json` 파일을 생성하고 아래 내용 입력:

```json
{
  "user_id": "형의ETRANS아이디",
  "user_pw": "형의ETRANS비밀번호"
}
```

### 3단계: 서버 실행

**방법 1: 자동 실행 (권장)**
```powershell
# 프로젝트 루트에서
.\start_local_test.bat
```

**방법 2: 수동 실행**
```powershell
# 터미널 1: 데몬 서버
cd c:\Users\hoon\Desktop\els_home_v1\elsbot
set HEADLESS=0
python els_web_runner_daemon.py

# 터미널 2: 백엔드 서버
cd c:\Users\hoon\Desktop\els_home_v1\docker\els-backend
python app.py

# 터미널 3: 프론트엔드 서버
cd c:\Users\hoon\Desktop\els_home_v1\web
npm run dev
```

### 4단계: 브라우저 접속

```
http://localhost:3000/employees/container-history
```

---

## 🧪 테스트 시나리오

### 1️⃣ 로그인 테스트
1. 페이지 접속
2. "저장된 계정 사용" 체크박스 확인
3. "로그인" 버튼 클릭
4. **시스템 상태** 패널에서 진행 상황 확인:
   - `[ OK ] Initialize Driver`
   - `[ OK ] Start Browser`
   - `[ OK ] Connect to ETRANS`
   - `[ OK ] User Auth`
   - `[ OK ] Load Menu`
5. 상세 로그에서 "[성공] 로그인 완료" 메시지 확인

### 2️⃣ 조회 테스트
1. 컨테이너 입력란에 번호 입력 (예: `TEMU1234567`)
2. "조회 실행" 버튼 클릭
3. 상세 로그에서 조회 진행 상황 확인
4. 하단에 **조회 결과 테이블** 표시 확인
5. "엑셀 다운로드" 버튼으로 파일 다운로드 테스트

---

## 🐛 문제 해결 (Troubleshooting)

### ❌ "CORS policy" 에러
**증상**: 브라우저 콘솔에 CORS 에러 표시
**해결**: 
- 백엔드 서버 재시작
- `docker/els-backend/app.py` 26번 줄 확인 (`origins: "*"`)

### ❌ "활성화된 브라우저 세션이 없습니다"
**증상**: 조회 시 세션 에러
**해결**:
- 로그인 먼저 실행
- 데몬 서버 재시작 후 다시 로그인

### ❌ 테이블에 데이터가 안 보임
**증상**: 조회는 성공했는데 테이블이 비어있음
**해결**:
- 브라우저 개발자 도구(F12) → Console 탭에서 에러 확인
- 백엔드 터미널에서 `RESULT:` 로그 확인
- `sheet1` 데이터 구조 확인 (2차원 배열이어야 함)

### ❌ ModuleNotFoundError
**증상**: `No module named 'flask_cors'` 등
**해결**:
```powershell
pip install flask flask-cors pandas openpyxl selenium webdriver-manager
```

### ❌ ChromeDriver 에러
**증상**: `chromedriver` 실행 불가
**해결**:
```powershell
pip install --upgrade webdriver-manager
```

---

## 📊 로그 분석 가이드

### 정상 로그인 흐름
```
[네트워크] http://localhost:2929/api/els/login 접속 중...
LOG:[데몬] 계정으로 새 세션 로그인 시도 중...
LOG:[  0.50s] 로그인 시도 중...
LOG:[  5.20s] 메뉴 진입 시도 중...
LOG:[ 10.30s] 메뉴 진입 성공
LOG:[데몬] 로그인 및 메뉴 진입 성공!
[성공] 로그인 완료. 조회를 시작하세요.
```

### 정상 조회 흐름
```
LOG:Daemon 모드로 조회를 시작합니다.
LOG:[TEMU1234567] 조회 요청 중...
LOG:[데몬] 컨테이너 TEMU1234567 조회 명령 수신
LOG:[데몬] TEMU1234567 데이터 추출 완료
LOG:[TEMU1234567] 조회 완료 (데이터 3건)
LOG:결과 데이터 집계 중...
```

---

## 🚀 다음 단계 (배포)

로컬 테스트 성공 후:

1. **나스 도커 빌드**
   ```bash
   cd /volume1/docker/els_home_v1
   sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .
   ```

2. **컨테이너 재시작**
   ```bash
   sudo docker-compose -f docker/docker-compose.yml up -d --force-recreate
   ```

3. **로그 확인**
   ```bash
   sudo docker logs -f els-backend
   ```

---

## 📝 체크리스트

- [ ] Python 패키지 설치 완료
- [ ] `els_config.json` 파일 생성
- [ ] 데몬 서버 정상 실행 (31999 포트)
- [ ] 백엔드 서버 정상 실행 (2929 포트)
- [ ] 프론트엔드 서버 정상 실행 (3000 포트)
- [ ] 로그인 성공
- [ ] 조회 성공
- [ ] 테이블 데이터 표시 확인
- [ ] 엑셀 다운로드 성공

---

**작성일**: 2026-02-06  
**작성자**: Antigravity Agent  
**버전**: 1.0
