import requests
import time
import json

backend_url = "https://elssolution.synology.me:8443/api/vectorize/nas"
unlock_url = "https://elssolution.synology.me:8443/api/vectorize/nas/unlock"

# 사용자가 명시적으로 요청한 5개 지점만 타겟팅
targets = [
    {"dir": "/app/volume1/서울본사", "branch": "본사"},
    {"dir": "/app/volume2/아산지점", "branch": "아산"},
    {"dir": "/app/volume2/당진지점", "branch": "당진"},
    {"dir": "/app/volume2/중부지점", "branch": "중부"},
    {"dir": "/app/volume2/예산지점", "branch": "예산"}
]

print("🔓 기존 락 해제 시도...")
try:
    requests.post(unlock_url, json={}, timeout=10)
    print("✅ 락 해제 성공")
except Exception as e:
    print(f"⚠️ 락 해제 실패(무시): {e}")

for t in targets:
    raw_dir = t["dir"]
    branch = t["branch"]
    print(f"▶️ [{branch}] 작업 요청 중... ({raw_dir})")
    
    while True:
        try:
            res = requests.post(backend_url, json={"directory": raw_dir, "branch": branch}, timeout=30)
            if res.status_code == 202:
                print(f"✅ [{branch}] 백그라운드 작업 시작됨. 다음 지점은 락이 풀리면 진행합니다.")
                break
            elif res.status_code == 429:
                print(f"⏳ [{branch}] 다른 지점이 작업 중입니다. 60초 후 재시도...")
                time.sleep(60)
            else:
                print(f"❌ [{branch}] 기타 오류 발생 (HTTP {res.status_code}): {res.text}")
                break
        except Exception as e:
            print(f"❌ [{branch}] 통신 에러: {e}")
            time.sleep(10)
    
    # 지점이 실제로 파싱을 시작할 수 있도록 약간의 여유를 둠
    time.sleep(10)

print("🎉 요청한 모든 지점의 벡터화 트리거 완료!")
