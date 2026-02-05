FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 시스템 패키지 설치 (Chromium 관련)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-liberation \
    libnss3 libx11-6 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libxcomposite1 libxcursor1 libxdamage1 libxrandr2 libgbm1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. 자재 목록(requirements.txt)부터 먼저 가져와서 깔아
# 그래야 나중에 코드만 고쳤을 때 패키지 설치 단계를 건너뛰어서 빨라져
COPY docker/els-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. 나머지 소스 코드 배달
COPY elsbot/ /app/elsbot/
COPY docker/els-backend/app.py /app/app.py

ENV FLASK_APP=app.py
EXPOSE 2929

# 3. 데몬과 플라스크 동시 실행 (-u 옵션으로 실시간 로그 보장)
CMD ["sh", "-c", "cd /app/elsbot && python -u els_web_runner_daemon.py & sleep 3 && python -u -m flask run --host=0.0.0.0 --port=2929"]