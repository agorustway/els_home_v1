# 🚀 운영 매뉴얼 (RUNBOOK)
#
# ╔══════════════════════════════════════════════════════════════════╗
# ║  이 파일은 "운영/배포/트러블슈팅"의 모든 것이다.                ║
# ║  로컬 개발, NAS Docker 배포, 문제 해결 절차를 담고 있다.        ║
# ║                                                                ║
# ║  🔗 통합 출처:                                                  ║
# ║  - /QUICK_START.md                                              ║
# ║  - /ELS_LOCAL_TEST_GUIDE.md                                     ║
# ║  - /NAS_DOCKER_ELS.md                                           ║
# ║  - /NAS_ENTWARE_INSTALL.md                                      ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# 마지막 업데이트: 2026-05-01

---

## 1. 로컬 개발 환경 (빠른 시작)

### 1-1. 사전 준비
```powershell
# Python 패키지 설치
cd c:\Users\hoon\Desktop\els_home_v1\docker\els-backend
pip install -r requirements.txt

# Node.js 패키지 설치
cd c:\Users\hoon\Desktop\els_home_v1\web
npm install
```

### 1-2. 계정 설정
`elsbot/els_config.json` 파일 생성:
```json
{
  "user_id": "ETRANS_ID",
  "user_pw": "ETRANS_PW"
}
```

### 1-3. 서버 실행

**방법 A: 자동 스크립트 (권장)**
```powershell
.\scripts\start_local_test.ps1
```

**방법 B: 수동 실행 (터미널 3개)**
```powershell
# 터미널 1: Selenium 데몬
cd elsbot
python els_web_runner_daemon.py

# 터미널 2: Flask 백엔드
cd docker\els-backend
python app.py

# 터미널 3: Next.js 프론트엔드
cd web
npm run dev
```

### 1-4. 접속 및 확인
| 서비스 | URL | 확인 방법 |
|--------|-----|-----------|
| 프론트엔드 | http://localhost:3000 | 페이지 표시 |
| 백엔드 API | http://localhost:2929/api/els/capabilities | `available: true` |
| 데몬 | http://localhost:31999/health | 상태 응답 |

### 1-5. 종료
```powershell
.\scripts\stop_local_test.ps1
```

---

## 2. 테스트 시나리오

### 2-1. 로그인 테스트
1. `http://localhost:3000/employees/container-history` 접속
2. "로그인" 버튼 클릭
3. 시스템 상태 패널에서 5단계 진행 확인:
   - `[ OK ] Initialize Driver`
   - `[ OK ] Start Browser`
   - `[ OK ] Connect to ETRANS`
   - `[ OK ] User Auth`
   - `[ OK ] Load Menu`
4. "[성공] 로그인 완료" 메시지 확인

### 2-2. 조회 테스트
1. 컨테이너 번호 입력 (예: `TEMU1234567`)
2. "조회 실행" 클릭
3. 하단 테이블에 결과 표시 확인
4. "엑셀 다운로드" 버튼 테스트

### 2-3. 정상 로그 패턴
```
[네트워크] http://localhost:2929/api/els/login 접속 중...
LOG:[데몬] 계정으로 새 세션 로그인 시도 중...
LOG:[  0.50s] 로그인 시도 중...
LOG:[  5.20s] 메뉴 진입 시도 중...
LOG:[ 10.30s] 메뉴 진입 성공
LOG:[데몬] 로그인 및 메뉴 진입 성공!
[성공] 로그인 완료. 조회를 시작하세요.
```

---

## 3. NAS Docker 배포

### 3-1. 프로젝트 구조 (유령 파일 금지)
```
docker/els-backend/
├── Dockerfile          ← 설계도 (여기만 존재해야 함)
├── app.py              ← 백엔드 심장
└── requirements.txt    ← 자재 목록

❌ 프로젝트 루트의 Dockerfile, app.py는 과거 찌꺼기 → 존재 시 삭제
❌ elsbot/app.py 도 중복 → 삭제
```

### 3-2. 배포 스케줄 (전체 또는 개별)
NAS SSH 접속 후 상황에 맞는 스크립트를 실행하세요:

**A. 전체 통합 배포 (Gateway + Bot + Core)**
- 모든 서비스를 처음부터 새로 올릴 때 사용합니다.
```bash
sh scripts/nas-deploy.sh
```

**B. Core API 전용 배포 (추천 - 1분 내 완료)**
- 관제, 로그, 배차판 동기화 로직만 수정했을 때 사훠합니다. **봇(Selenium)은 죽지 않고 계속 유지됩니다.**
```bash
sh scripts/deploy-core.sh
```

**C. Bot 전용 배포 (약 40분 소요)**
- 이트랜스 봇 로직이나 크롬 설정을 수정했을 때 사용합니다. **빌드 중에도 관제 서비스(Core)는 정상 작동합니다.**
```bash
sh scripts/deploy-bot.sh
```

### 3-3. 서비스 구조 및 포트
| 서비스명 | 포트(Internal) | 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **els-gateway** | 2929 | 외부 요청 분배 (Gateway) | **입구 (NAS 프록시 타겟)** |
| **els-core** | 2930 | 관제, 로그, 아산 동기화 | 경량 (빠른 빌드) |
| **els-bot** | 2931 | 이트랜스 셀레늄 봇 | 중량 (Chrome 포함) |

### 3-4. 로그 확인
특정 서비스의 로그만 집중해서 볼 수 있습니다.
```bash
sudo docker logs -f els-core    # 관제/동기화 로그
sudo docker logs -f els-bot     # 봇/셀레늄 로그
sudo docker logs -f els-gateway # 접속 분배 로그
```

### 3-4. 안드로이드 네이티브 앱 빌드 및 배포
독립형 운전원 앱(Capacitor) 배포 과정:
1. **AI 자동 배포 (권장)**:
   - 채팅창에 `/deploy` 입력 또는 "배포해줘"라고 요청.
   - AI가 자동으로 버전 증분, `npx cap sync`, `gradlew` 빌드, APK 복사, 문서 갱신, 커밋 및 푸시를 일괄 수행함.
2. **수동 배포 절차**:
   - `web/android/app/build.gradle`에서 `versionCode` 및 `versionName` 상향 조정.
   - `web/public/apk/version.json` 파일의 `latestVersion` 및 `changeLog` 업데이트 (필수!).
   - Android 에셋 동기화 및 빌드:
     ```powershell
     cd web; npx cap sync android
     cd web/android; ./gradlew.bat assembleDebug
     ```
   - 생성된 APK(`app-debug.apk`)를 `web/public/apk/els_driver.apk`로 복사.
   - `docs/01_MISSION_CONTROL.md` 최상단에 배포 정보 갱신.
   - 테스트: 앱 내 [설정 > 업데이트 확인]을 통해 정상 작동 확인.

---

## 3-5. 차량 업무유형/일반화물/협력사 관제 배포 체크리스트 (v5.10.42)

컨테이너 전용 관제에서 `컨테이너`/`일반화물` 혼합 관제로 확장되는 변경입니다. DB 스키마, 웹 관제, NAS 관제 API, 드라이버 앱 APK가 같은 규격을 사용하므로 아래 순서를 지켜야 합니다.

### 3-5-1. 사전 DB 마이그레이션
1. Supabase SQL Editor 또는 운영 배포 절차에서 다음 파일을 먼저 적용합니다.
   ```sql
   -- web/supabase_sql/20260501_vehicle_cargo_type_visibility.sql
   ```
2. 적용 후 `driver_contacts`에 아래 컬럼이 있는지 확인합니다.
   - `cargo_type`
   - `contract_type`
   - `map_visibility`
   - `partner_company`
   - `general_vehicle_type`
   - `general_payload`
   - `general_body_type`
3. `vehicle_trips`에 `cargo_type`, `driver_contract_type`, 일반화물 제원/운행구분 컬럼이 있는지 확인합니다.

### 3-5-2. 웹/NAS/API 배포 순서
1. Vercel 웹 배포: 운전원정보, 웹 관제 필터, 전체화면 지도 운행현황 패널, 일반화물 운행기록 UI를 반영합니다.
2. NAS core 배포: `docker/els-backend/app.py`, `app_core.py`가 운전원 메타를 조인해 `/api/vehicle-tracking` 응답에 업무유형/계약상태/지도공개범위를 포함합니다.
3. 웹 환경에서 `ELS_BACKEND_URL` 또는 `NEXT_PUBLIC_ELS_BACKEND_URL`이 NAS core로 연결된 경우, NAS 배포 누락 시 앱 지도 그룹 필터가 오래된 데이터로 보일 수 있습니다.

### 3-5-3. 드라이버 앱 APK 배포
드라이버 앱 소스는 `web/driver-src/`가 단일 진실 소스입니다. APK 반영은 아래 스크립트만 사용합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1
```

단독 `npx cap sync`는 캐시버스터와 버전 파일 자동 갱신을 우회하므로 금지합니다.

### 3-5-4. 배포 후 스모크 테스트
1. 운전원정보 신규 등록: 컨테이너 차량은 기존 차량 ID/컨테이너 기준 입력이 정상 저장되는지 확인합니다.
2. 운전원정보 신규 등록: 일반화물은 차량 ID 공란 저장이 가능하고 차량종류/적재중량/특장구분의 마지막 `기타` 옵션이 보이는지 확인합니다.
3. 운전원정보 목록/상세: 업무유형 1차 필터와 계약차량/미계약차량 2차 필터가 함께 동작하는지 확인합니다.
4. 드라이버 앱 차량설정: 지도 공개범위 선택 UI가 없고, 업무유형이 전화번호 왼쪽에 있으며, 일반화물 선택 시 차량 ID placeholder가 `생략가능`으로만 보이는지 확인합니다.
5. 드라이버 앱 지도: 상단 `전체보기` 버튼이 보이고, 웹 운전원정보에서 관리자가 지정한 지도 공개범위 정책에 맞는 그룹 차량만 노출되는지 확인합니다.
6. 웹 관제: 컨테이너/일반화물 1차 필터와 계약/미계약/협력사 2차 필터가 지도와 리스트에 동일하게 적용되는지 확인합니다.
7. 웹 지도 전체화면: 지도 상단 그룹 버튼과 우측 압축 운행현황 패널이 보이고, 패널 차량 클릭 시 해당 차량 위치/상세 상태를 확인할 수 있는지 확인합니다.
8. 운행기록: 일반화물 운행은 컨테이너 번호/씰번호 중심이 아니라 화물명/오더·관리번호, 차량종류/적재중량/특장구분 중심으로 보이는지 확인합니다.

### 3-5-5. 검증 기록
- TDD 임시 테스트는 `.tmp_test/vehicle_cargo_policy_test.mjs`, `.tmp_test/vehicle_web_policy_regression.mjs`로 실행 후 삭제합니다.
- 기본 검증 명령:
  ```powershell
  cd web
  npm.cmd run lint
  cd ..
  node --check web\driver-src\modules\profile.js
  node --check web\driver-src\modules\trip.js
  node --check web\driver-src\modules\map.js
  node --check web\driver-src\modules\log.js
  node --check web\driver-src\modules\cargoOptions.js
  node --check web\app\api\vehicle-tracking\trips\route.js
  node --check web\app\api\vehicle-tracking\trips\[id]\route.js
  node --check web\app\api\vehicle-tracking\drivers\route.js
  ```
- 현재 로컬 Codex 실행 환경에서는 `npm.cmd run build`가 compile 성공 후 Next.js type worker 생성 단계에서 `spawn EPERM`으로 멈출 수 있습니다. 운영 CI 또는 권한이 정상인 로컬 PowerShell에서 재확인합니다.

---

## 4. 트러블슈팅

### 🚨 CORS policy 에러
- **증상**: 브라우저 콘솔에 CORS 에러
- **원인**: 백엔드 CORS 설정 불일치
- **해결**: `docker/els-backend/app.py` → CORS `origins: "*"` 확인, 백엔드 재시작

### 🚨 ModuleNotFoundError: No module named 'flask_cors'
- **원인**: Docker 빌드 시 requirements.txt 무시
- **해결**: Dockerfile에서 `RUN pip install -r requirements.txt` 확인, `--no-cache` 빌드

### 🚨 502 Bad Gateway
- **원인**: 백엔드 Python 코드 에러로 서버 죽음
- **해결**: `docker logs`에서 NameError/ImportError 확인

### 🚨 503 / JSON Parsing Error (NaN)
- **원인**: 엑셀 빈 데이터에서 NaN 발생
- **해결**: `app.py`에서 `df.where(pd.notnull(df), None)` + `json.dumps(allow_nan=False)`

### 🚨 E: Unable to locate package libcursor1
- **원인**: apt-get 패키지 이름 오타
- **해결**: `libcursor1` → `libxcursor1`

### 🚨 "활성화된 브라우저 세션이 없습니다"
- **원인**: 세션 만료 또는 데몬 미실행
- **해결**: 데몬 재시작 후 다시 로그인

### 🚨 ChromeDriver 에러
- **해결**: `pip install --upgrade webdriver-manager`

### 🚨 import time 에러 (3일간 재발)
- **원인**: `__pycache__` 내 오래된 .pyc 우선 실행
- **해결**: 모든 `__pycache__` 삭제 + `PYTHONDONTWRITEBYTECODE=1` 설정

### 🚨 빌드 캐시 문제
```powershell
cd web
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 5. NAS Entware 설치 (Git 사용을 위한 사전 작업)

> NAS SSH에서 `git pull`을 사용하기 위해 Entware를 설치해야 합니다.
> 대상: Synology NAS, Intel Celeron J3455 (x86_64), DSM 6/7

### 5-1. 설치 순서 (요약)
```bash
# 1. 폴더 생성 (root로)
sudo -i
mkdir -p /volume1/@Entware/opt

# 2. /opt 마운트
rm -rf /opt && mkdir /opt
mount -o bind "/volume1/@Entware/opt" /opt
# mount 실패 시: ln -sf /volume1/@Entware/opt /opt

# 3. Entware 설치 (x86_64)
wget -O - https://bin.entware.net/x64-k3.2/installer/generic.sh | /bin/sh
# wget HTTPS 안 되면: curl -sSL 사용

# 4. Git 설치
/opt/bin/opkg update
/opt/bin/opkg install git
/opt/bin/git --version
```

### 5-2. 부팅 시 자동 마운트
DSM → 제어판 → 작업 스케줄러 → 트리거된 작업 → 부팅 시 실행:
```bash
#!/bin/bash
mkdir -p /opt
mount -o bind "/volume1/@Entware/opt" /opt
/opt/etc/init.d/rc.unslung start
if ! grep -qF '/opt/etc/profile' /etc/profile; then
  echo '[ -r "/opt/etc/profile" ] && . /opt/etc/profile' >> /etc/profile
fi
/opt/bin/opkg update
```

### 5-3. NAS SSH 접속
```bash
ssh elsadmin@elssolution.synology.me
sudo -i
```

---

## 6. Docker 용량 관리
```bash
# 용량 확인
sudo docker system df

# 기본 정리
sudo docker system prune -f

# 강력 정리 (미사용 이미지까지 삭제)
docker system prune -a -f
```

---

## 7. 환경 전환 체크리스트

---

## 8. 안전운임 & 아산 배차판 데이터 관리

### 8-1. 안전운임 고시 업데이트 (연 1~2회)
정부 공식 안전운임 고시가 새로 발표되었을 때 적용하는 절차입니다.
1. **엑셀 준비**: 국토부 엑셀 파일을 NAS의 `work-docs/` 폴더에 업로드합니다.
2. **자동화 스크립트 실행 (NAS SSH)**:
   ```bash
   cd /volume1/docker/els_home_v1
   sh scripts/update-safe-freight.sh
   ```
   - 이 스크립트는 `JSON 빌드 -> Git Commit -> Push`를 한 번에 수행합니다.
3. **확인**: 약 5~10분 후 `elssolution.com` 웹사이트 및 AI 어시스턴트에 새 단가가 반영됩니다.

### 8-2. 아산 배차판 동기화 관리
1. **파일 위치**: `/volume2/아산지점/A_운송실무/` 폴더 내에 엑셀 파일이 있어야 합니다.
2. **동기화 확인**:
   ```bash
   sudo docker logs -f els-core | grep "[자동동기화]"
   ```
   - `파일 변경 확인됨. 데이터 추출 시작...` 메시지가 나오면 정상입니다.

---

## 9. 백도어(NAS) 환경변수 및 DNS 관리

### 9-1. Supabase 프로젝트 이관 시 수정 사항
수파베이스 주소(`URL`)나 `SERVICE_ROLE_KEY`가 변경되면 아래 파일들을 동시에 수정해야 합니다.
- **Web**: `web/.env.local`
- **NAS Backend**: `docker/els-backend/.env.local` (또는 `app_core.py` 내 하드코딩된 주소)
- **NAS Git**: `git remote set-url origin https://[TOKEN]@github.com/...` (토큰 만료 시)

### 9-2. DNS 장애 패치 (`dns_fix.py`)
나스 도커에서 특정 주소를 못 찾을 때 조치법입니다.
- **수정 파일**: `docker/els-backend/dns_fix.py`
- **방법**: `HOST_MAPPING` 딕셔너리에 `{ "도메인": "IP주소" }`를 추가합니다.
- **적용**: `sh scripts/deploy-core.sh` 실행하여 백엔드 재시작.

---

## 10. 긴급 장애 조치 (Troubleshooting Plus)

### 🚨 동기화 로그에 "파일을 찾을 수 없음" 발생 시
- **원인**: 도커 볼륨 마운트 설정과 나스 실제 경로가 꼬임.
- **해결**:
  1. `sudo docker inspect els-core | grep -A 10 "Mounts"` 로 실제 `Source` 경로 확인.
  2. `docker/docker-compose.yml`에서 `/volume2/아산지점` 등 실제 경로로 핀셋 마운트 수정.
  3. `sudo docker-compose up -d --force-recreate els-core` 로 재실행.

### 🚨 AI 어시스턴트가 외부 데이터를 못 가져올 때
- **원인**: K-SKILL 또는 K-Law 서버 장애 혹은 나스 DNS 패치 중단.
- **해결**:
  1. `els-core` 로그에서 `[DNS-FIX]` 메시지 확인.
  2. 나스 터미널에서 `ping k-skill-proxy.nomadamas.org` 가 되는지 확인.

---
*최종 갱신일: 2026-04-21 (by Antigravity | v5.0.51 Infrastructure Stabilized)*
