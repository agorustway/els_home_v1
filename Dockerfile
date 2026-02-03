# Stage 1: Builder (의존성 패키지 미리 설치)
FROM python:3.11-slim as builder
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY docker/els-backend/requirements.txt .
# --prefix 옵션으로 /install 경로에 패키지 설치
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Runner (실제 실행 환경)
FROM python:3.11-slim
WORKDIR /app

# 기본 환경 변수 설정
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CHROME_BIN=/usr/bin/chromium \
    CHROME_DRIVER_BIN=/usr/bin/chromedriver \
    PYTHONPATH=/usr/local/lib/python3.11/site-packages

# Chromium 및 필수 라이브러리 설치 (apt가 아키텍처에 맞는 버전을 자동 선택)
# 불필요한 캐시 및 리스트 파일 삭제로 이미지 크기 최소화
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    fonts-liberation \
    libnss3 libx11-6 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libxcomposite1 libxcursor1 libxdamage1 libxrandr2 libgbm1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Builder 스테이지에서 설치한 패키지 복사
COPY --from=builder /install /usr/local

# 소스 코드 복사
COPY elsbot /app/elsbot
COPY docker/els-backend/app.py /app/
ENV FLASK_APP=app.py

EXPOSE 2929

# 데몬 및 Flask 앱 실행 (백그라운드 데몬 + 포그라운드 Flask)
CMD ["sh", "-c", "cd /app/elsbot && python els_web_runner_daemon.py & sleep 2 && exec python -m flask run --host=0.0.0.0 --port=2929"]
