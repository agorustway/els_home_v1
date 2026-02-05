FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 1. 시스템 패키지 설치 (Chromium 등 - 오타 완벽 수정)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-liberation \
    libnss3 libx11-6 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libxcomposite1 libxcursor1 libxdamage1 libxrandr2 libgbm1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

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