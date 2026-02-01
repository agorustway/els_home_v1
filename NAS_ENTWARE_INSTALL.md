# Synology NAS에 Entware 설치 (Intel J3455 / x86_64)

**대상:** Synology NAS, Intel Celeron J3455 (x86_64), DSM 6/7  
**목적:** `git`, `opkg` 등 패키지 사용 (예: `git pull`로 코드 반영)

> ⚠️ **Entware-ng가 아니라 Entware** 를 설치합니다.  
> 예전 문서의 `pkg.entware.net`(http) 대신 **`bin.entware.net`(https)** 를 사용합니다.

---

## 준비

1. **SSH 활성화**  
   DSM → 제어판 → 터미널 및 SNMP → SSH 서비스 **활성화** → 포트 22(기본값) 확인.

2. **root 로그인**  
   PC에서 터미널 열고:
   ```bash
   ssh elsadmin@elssolution.synology.me
   ```
   비밀번호 입력 후, **root로 전환** (admin 계정이면):
   ```bash
   sudo -i
   ```
   (또는 DSM 제어판에서 admin에 "administrators" 권한이 있으면 `sudo -i` 가능.)

3. **CPU 확인** (선택)
   ```bash
   uname -m
   ```
   `x86_64` 가 나오면 아래 **x64** 절차를 따르면 됩니다.

---

## 1단계: Entware 폴더 만들기

SSH에서 **root** 로 실행:

```bash
mkdir -p /volume1/@Entware/opt
```

- 폴더 이름은 **`@Entware`** (대문자 E). `@entware-ng` 가 아닙니다.
- `/volume1` 은 1번 볼륨(저장소)입니다. 다른 볼륨을 쓰면 해당 경로로 바꾸세요 (예: `/volume2/@Entware/opt`).

---

## 2단계: 기존 /opt 제거 후 마운트

**root** 로:

```bash
rm -rf /opt
mkdir /opt
mount -o bind "/volume1/@Entware/opt" /opt
```

- `mount -o bind` 실패하면(일부 DSM에서) 대안:
  ```bash
  rm -rf /opt
  ln -sf /volume1/@Entware/opt /opt
  ```
- `mount: ... unknown filesystem type` 등이 나오면 **심볼릭 링크** 방식만 사용하면 됩니다.

---

## 3단계: 설치 스크립트 실행 (x86_64)

**root** 로, 아래 **한 줄** 통째로 복사해서 붙여넣기:

```bash
wget -O - https://bin.entware.net/x64-k3.2/installer/generic.sh | /bin/sh
```

### 자주 나오는 실패와 해결

**1) `wget: not found`**  
- wget이 없으면:
  ```bash
  which wget
  /usr/bin/wget --version
  ```
  `/usr/bin/wget` 이 있으면:
  ```bash
  /usr/bin/wget -O - https://bin.entware.net/x64-k3.2/installer/generic.sh | /bin/sh
  ```

**2) `Unable to establish SSL connection` / `HTTPS support not compiled in`**  
- Synology 기본 wget이 HTTPS를 지원하지 않을 수 있음.  
- **curl** 사용 (DSM에 curl이 있는 경우):
  ```bash
  curl -sSL https://bin.entware.net/x64-k3.2/installer/generic.sh -o /tmp/entware_install.sh
  chmod +x /tmp/entware_install.sh
  /bin/sh /tmp/entware_install.sh
  ```
- curl도 없으면: PC에서 브라우저로  
  https://bin.entware.net/x64-k3.2/installer/generic.sh  
  열어서 **전체 내용을 복사**한 뒤, NAS에서:
  ```bash
  cat > /tmp/entware_install.sh << 'ENDOFFILE'
  (여기에 스크립트 내용 붙여넣기)
  ENDOFFILE
  chmod +x /tmp/entware_install.sh
  /bin/sh /tmp/entware_install.sh
  ```

**3) `Connection timed out` / `Temporary failure in name resolution`**  
- NAS 인터넷 연결·DNS 확인 (제어판 → 네트워크, 또는 `ping 8.8.8.8`, `ping bin.entware.net`).

**4) `Permission denied` / `Read-only file system`**  
- `sudo -i` 로 **root** 인지 확인.  
- `/opt` 이 다른 곳에 마운트돼 있지 않은지 `mount | grep opt` 로 확인.

---

## 4단계: 설치 확인

```bash
/opt/bin/opkg update
/opt/bin/opkg list | head -20
```

- `opkg update` 가 에러 없이 끝나면 Entware 설치가 된 것입니다.
- Git 설치:
  ```bash
  /opt/bin/opkg install git
  /opt/bin/git --version
  ```

---

## 5단계: 부팅 시 자동 마운트 (DSM 6/7)

DSM 6.0부터는 `/etc/rc.local` 이 부팅에 안 쓰이므로 **작업 스케줄러**로 처리합니다.

1. DSM 웹 → **제어판** → **작업 스케줄러**.
2. **생성** → **트리거된 작업** → **사용자 정의 스크립트**.
3. **일반** 탭:
   - 작업 이름: `Entware`
   - 사용자: **root**
   - 이벤트: **부팅**
4. **작업 설정** 탭 → **실행 명령**에 아래 전체 붙여넣기 (첫 줄 `#!/bin/bash` 는 이 스크립트를 bash로 실행하라는 뜻):

```bash
#!/bin/bash
# Entware 마운트 및 시작
mkdir -p /opt
mount -o bind "/volume1/@Entware/opt" /opt
/opt/etc/init.d/rc.unslung start
# PATH용 profile (한 번만 추가)
if ! grep -qF '/opt/etc/profile' /etc/profile; then
  echo '[ -r "/opt/etc/profile" ] && . /opt/etc/profile' >> /etc/profile
fi
/opt/bin/opkg update
```

- 2단계에서 **심볼릭 링크**(`ln -sf`)를 썼다면, 위 스크립트에서 `mount -o bind` 두 줄을 아래로 바꿉니다:
  ```bash
  /bin/ln -sf /volume1/@Entware/opt /opt
  ```
  (즉, `mkdir -p /opt` 와 `mount -o bind` 대신 `ln -sf` 한 줄.)

5. **확인** 눌러 저장.

재부팅 후 SSH로 접속해서 다음으로 확인:

```bash
/opt/bin/opkg update
```

---

## 6단계: 매 로그인 시 PATH (선택)

SSH 로그인할 때마다 `opkg`, `git` 등을 경로 없이 쓰려면:

```bash
echo '[ -r "/opt/etc/profile" ] && . /opt/etc/profile' >> /etc/profile
```

- 이미 5단계 스크립트에 넣었다면 생략 가능.
- 적용 전 세션에는 `source /etc/profile` 또는 새 SSH 접속이 필요합니다.

---

## 요약 (한 번에 복사용)

**root** 로, **2단계까지** 한 뒤:

```bash
# 1. 폴더 생성
mkdir -p /volume1/@Entware/opt

# 2. /opt 마운트 (실패하면 아래 ln -sf 사용)
rm -rf /opt
mkdir /opt
mount -o bind "/volume1/@Entware/opt" /opt

# 3. 설치 (x86_64)
wget -O - https://bin.entware.net/x64-k3.2/installer/generic.sh | /bin/sh

# 4. 확인 및 Git 설치
/opt/bin/opkg update
/opt/bin/opkg install git
/opt/bin/git --version
```

- wget이 HTTPS를 못 쓰면 **curl** 또는 **PC에서 스크립트 다운로드 후 복사** 방법을 3단계에서 사용하면 됩니다.
- 부팅 후에도 쓰려면 **5단계 작업 스케줄러**까지 반드시 설정하세요.

---

## 참고

- 공식 안내: [Entware - Install on Synology NAS](https://github.com/Entware/Entware/wiki/Install-on-Synology-NAS)
- x64용 URL: `https://bin.entware.net/x64-k3.2/installer/generic.sh` (Entware-ng의 `pkg.entware.net` 아님)
