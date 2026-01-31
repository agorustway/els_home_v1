# ELS 컨테이너 이력조회 백엔드 — Python + Chromium + elsbot
# Synology NAS 등 Docker 호스트에서 실행해 웹에서 조회 가능
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Chromium + ChromeDriver (Linux)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-liberation \
    libnss3 libx11-6 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libxcomposite1 libxcursor1 libxdamage1 libxrandr2 libgbm1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_DRIVER_BIN=/usr/bin/chromedriver

WORKDIR /app

# 빌드: 저장소 루트에서 docker build -f docker/els-backend/Dockerfile -t els-backend .
COPY elsbot /app/elsbot
COPY docker/els-backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY docker/els-backend/app.py /app/
ENV FLASK_APP=app.py

EXPOSE 2929
# 데몬(세션 유지) + Flask 동시 실행 — 조회 시 재로그인 제거·속도 개선 (데몬 cwd=/app/elsbot)
CMD ["sh", "-c", "cd /app/elsbot && python els_web_runner_daemon.py & sleep 2 && exec python -m flask run --host=0.0.0.0 --port=2929"]
