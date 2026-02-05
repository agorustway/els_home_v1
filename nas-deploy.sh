# 1. 깃허브에서 최신 코드(elsbot, app.py 등) 땡겨오기
/opt/bin/git fetch origin main
/opt/bin/git reset --hard origin/main

# 2. 이미지 빌드 (경로를 하위 폴더로 정확히 지정!)
sudo docker build --no-cache -t els-backend:latest -f docker/els-backend/Dockerfile .

# 3. 컨테이너 가동 (이미지가 바뀌었으니 알아서 새로 만들 거야)
sudo docker-compose -f docker/docker-compose.yml up -d