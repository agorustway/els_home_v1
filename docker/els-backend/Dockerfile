FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 1. 시스템 패키지 설치 (Chrome 의존성)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    unzip \
    fonts-liberation \
    libnss3 libx11-6 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libxcomposite1 libxcursor1 libxdamage1 libxrandr2 libgbm1 \
    libasound2 libxss1 libnspr4 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. Chrome for Testing 설치 (안정 버전)
RUN CHROME_VERSION="131.0.6778.108" && \
    wget -q "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" -O /tmp/chrome.zip && \
    unzip -q /tmp/chrome.zip -d /tmp && \
    mv /tmp/chrome-linux64 /opt/chrome && \
    ln -s /opt/chrome/chrome /usr/bin/google-chrome && \
    rm /tmp/chrome.zip && \
    wget -q "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chromedriver-linux64.zip" -O /tmp/chromedriver.zip && \
    unzip -q /tmp/chromedriver.zip -d /tmp && \
    mv /tmp/chromedriver-linux64/chromedriver /usr/local/bin/chromedriver && \
    chmod +x /usr/local/bin/chromedriver && \
    rm -rf /tmp/chromedriver.zip /tmp/chromedriver-linux64 && \
    google-chrome --version && \
    chromedriver --version

WORKDIR /app

# 2. 패키지 자재 먼저 설치
COPY docker/els-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. 소스 코드 배달 (경로 딱 고정)
COPY elsbot/ /app/elsbot/
COPY docker/els-backend/app.py /app/app.py

# 4. 환경 설정
ENV FLASK_APP=/app/app.py
EXPOSE 2929

# 5. [절대 삭제 금지] 데몬과 플라스크 동시 실행 명령어
CMD ["sh", "-c", "cd /app/elsbot && python -u els_web_runner_daemon.py & sleep 3 && python -u -m flask run --host=0.0.0.0 --port=2929"]