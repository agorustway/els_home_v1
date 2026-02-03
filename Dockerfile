# Debian buster 기반의 Python 3.9 슬림 이미지를 사용합니다.
FROM python:3.9-slim-buster

# 작업 디렉토리를 /app으로 설정합니다.
WORKDIR /app

# 시스템 패키지 설치: Chrome 설치에 필요한 wget, gnupg 등
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Google Chrome 최신 안정 버전 설치
# Docker/Debian에서 sandbox 없이 실행하려면 --no-sandbox 옵션이 필요합니다.
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# webdriver-manager가 Chrome 버전에 맞는 드라이버를 자동으로 다운로드 및 캐시하지만,
# Docker 환경에서는 미리 지정된 경로에 드라이버를 두는 것이 안정적일 수 있습니다.
# 이 Dockerfile은 webdriver-manager가 런타임에 드라이버를 관리하도록 둡니다.
# 만약 특정 버전의 chromedriver를 수동으로 설치하려면 아래 주석을 해제하고 버전을 맞추세요.
# ENV CHROME_DRIVER_VERSION "123.0.6312.86"
# RUN wget -O /tmp/chromedriver.zip https://storage.googleapis.com/chrome-for-testing-public/${CHROME_DRIVER_VERSION}/linux64/chromedriver-linux64.zip && \
#     unzip /tmp/chromedriver.zip -d /usr/bin && \
#     rm /tmp/chromedriver.zip && \
#     chmod +x /usr/bin/chromedriver-linux64/chromedriver

# Python 패키지를 설치합니다.
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드를 컨테이너에 복사합니다.
# elsbot 디렉토리 전체를 복사합니다.
COPY elsbot/ /app/elsbot/

# 환경 변수 설정 (필요 시)
# 예: ENV TZ=Asia/Seoul

# 컨테이너 실행 시 실행될 기본 명령
CMD ["python", "elsbot/els_bot.py"]