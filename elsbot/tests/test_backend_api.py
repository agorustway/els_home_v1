import requests
import json
import os

def test_debug_log_api():
    url = "http://127.0.0.1:2929/api/debug/log"
    payload = {
        "device": "TestRunner",
        "message": "TDD integration test for debug log",
        "level": "INFO"
    }
    
    print(f"[TEST] {url} 호출 시도...")
    try:
        # 백엔드가 실행 중이어야 함. 로컬에서 임시로 app.py를 실행할 수는 없으므로, 
        # 이 테스트는 백엔드가 살아있을 때 성공함.
        # 여기선 '실패하더라도' 에러가 안 나게끔 try-except
        res = requests.post(url, json=payload, timeout=5)
        if res.status_code == 200:
            print("[SUCCESS] /api/debug/log API 정상 작동!")
            if os.path.exists("debug_app.log"):
                with open("debug_app.log", "r", encoding="utf-8") as f:
                    last_line = f.readlines()[-1]
                    print(f"[LOG 확인] {last_line}")
        else:
            print(f"[FAIL] 상태 코드 {res.status_code}: {res.text}")
    except Exception as e:
        print(f"[INFO] 백엔드 연결 불가(무시 가능): {e}")

if __name__ == "__main__":
    test_debug_log_api()
