# Debian bullseye 기반의 Python 3.9 슬림 이미지를 사용합니다.
FROM python:3.9-slim-bullseye

# 작업 디렉토리를 /app으로 설정합니다.
WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Google Chrome 최신 안정 버전 설치
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지를 설치합니다.
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir Flask # Flask는 별도로 설치


# 애플리케이션 코드를 컨테이너에 복사합니다.
COPY elsbot/ /app/elsbot/
COPY docker/els-backend/app.py /app/app.py

# 웹 서버가 사용할 포트를 노출합니다.
EXPOSE 2929

# 데몬을 백그라운드에서 실행하고, Flask 웹 서버를 실행합니다.
CMD ["sh", "-c", "python /app/elsbot/els_web_runner_daemon.py & sleep 2 && exec flask run --host=0.0.0.0 --port=2929"]
