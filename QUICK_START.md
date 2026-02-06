# ✅ ELS 로컬 테스트 빠른 시작 가이드

## 🚀 실행 방법

### PowerShell에서 실행
```powershell
.\start_local_test.ps1
```

### 또는 수동 실행
```powershell
# 터미널 1: 데몬
cd elsbot
python els_web_runner_daemon.py

# 터미널 2: 백엔드
cd docker\els-backend
python app.py

# 터미널 3: 프론트엔드
cd web
npm run dev
```

## 📝 사전 준비

### 1. 계정 설정 파일 생성
`elsbot/els_config.json` 파일을 만들고 아래 내용 입력:

```json
{
  "user_id": "ETRANS아이디",
  "user_pw": "ETRANS비밀번호"
}
```

### 2. 브라우저 접속
```
http://localhost:3000/employees/container-history
```

## 🧪 테스트 시나리오

1. **로그인 테스트**
   - "로그인" 버튼 클릭
   - 시스템 상태 패널에서 5단계 진행 확인
   - "[성공] 로그인 완료" 메시지 확인

2. **조회 테스트**
   - 컨테이너 번호 입력 (예: TEMU1234567)
   - "조회 실행" 버튼 클릭
   - 하단 테이블에 결과 표시 확인

3. **다운로드 테스트**
   - "엑셀 다운로드" 버튼 클릭
   - 파일 다운로드 확인

## 🛑 종료 방법

```powershell
.\stop_local_test.ps1
```

또는 각 PowerShell 창을 직접 닫기

## ⚠️ 문제 해결

### "ModuleNotFoundError" 발생 시
```powershell
pip install flask flask-cors pandas openpyxl selenium webdriver-manager
```

### 포트 충돌 시
다른 프로그램이 31999, 2929, 3000 포트를 사용 중인지 확인:
```powershell
netstat -ano | findstr "31999"
netstat -ano | findstr "2929"
netstat -ano | findstr "3000"
```

### 빌드 캐시 문제 시
```powershell
cd web
Remove-Item -Recurse -Force .next
npm run dev
```

## 📊 서버 상태 확인

- **데몬**: http://localhost:31999/health
- **백엔드**: http://localhost:2929/api/els/capabilities
- **프론트**: http://localhost:3000

## 🎯 성공 기준

- [ ] 3개 서버 모두 정상 실행
- [ ] 로그인 성공
- [ ] 컨테이너 조회 성공
- [ ] 테이블에 데이터 표시
- [ ] 엑셀 다운로드 성공

---

**작성일**: 2026-02-06  
**버전**: 1.1
