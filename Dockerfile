FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

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

COPY elsbot /app/elsbot
COPY docker/els-backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY docker/els-backend/app.py /app/
ENV FLASK_APP=app.py

EXPOSE 2929
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=2929"]
