import json
import time
import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS

# 우리가 방금 고친 els_bot의 심장 함수들을 가져온다!
from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify

app = Flask(__name__)
# 모든 외부 접속 허용 (로컬/나스 공용)
CORS(app)

# 전역 변수로 브라우저 드라이버를 유지 (세션 유지의 핵심)
shared_driver = None
current_user = {"id": None, "pw": None}

@app.route('/health', methods=['GET'])
def health():
    """백엔드가 데몬이 살아있는지 확인할 때 부르는 곳"""
    return jsonify({
        "status": "ok", 
        "driver_active": shared_driver is not None,
        "user_id": current_user["id"]
    })

@app.route('/login', methods=['POST'])
def login():
    """백엔드에서 로그인 요청이 오면 브라우저를 띄우고 ETRANS 접속"""
    global shared_driver, current_user
    data = request.json
    u_id = data.get('userId')
    u_pw = data.get('userPw')
    
    # 로그 수집용 리스트
    logs = []
    
    print(f"[데몬] {u_id} 계정으로 새 세션 로그인 시도 중...")
    logs.append(f"[데몬] {u_id} 계정으로 새 세션 로그인 시도 중...")
    
    # 기존에 돌던 브라우저가 있으면 깔끔하게 종료
    if shared_driver:
        try:
            shared_driver.quit()
        except:
            pass
    
    # els_bot.py의 독립 함수 호출
    # 로그를 리스트에 모으는 콜백
    def collect_log(msg):
        print(f"LOG:{msg}")
        logs.append(msg)
    
    result = login_and_prepare(u_id, u_pw, log_callback=collect_log)
    
    driver = result[0]
    error = result[1]
    
    if driver:
        shared_driver = driver
        current_user["id"] = u_id
        current_user["pw"] = u_pw
        success_msg = f"[데몬] {u_id} 로그인 및 메뉴 진입 성공!"
        print(success_msg)
        logs.append(success_msg)
        result_json = {"ok": True, "message": "로그인 성공", "log": logs}
        print(f"RESULT:{json.dumps(result_json, ensure_ascii=False)}")
        return jsonify(result_json)
    else:
        shared_driver = None
        error_msg = f"[데몬] 로그인 실패: {error}"
        print(error_msg)
        logs.append(error_msg)
        import traceback
        traceback.print_exc()
        result_json = {"ok": False, "error": error or "로그인 프로세스 실패", "log": logs}
        print(f"RESULT:{json.dumps(result_json, ensure_ascii=False)}")
        return jsonify(result_json)

@app.route('/run', methods=['POST'])
def run():
    """로그인된 세션을 사용해서 실제로 컨테이너 번호를 조회"""
    global shared_driver
    if not shared_driver:
        return jsonify({"ok": False, "error": "활성화된 브라우저 세션이 없습니다. 먼저 로그인하세요."})
    
    data = request.json
    container_no = data.get('containerNo')
    
    if not container_no:
        return jsonify({"ok": False, "error": "컨테이너 번호가 누락되었습니다."})
    
    print(f"LOG:[데몬] 컨테이너 {container_no} 조회 명령 수신")
    
    try:
        # 1. 입력창 찾아서 번호 넣고 조회 버튼 클릭
        status = solve_input_and_search(shared_driver, container_no, log_callback=lambda x: print(f"LOG:{x}", flush=True))
        
        # 2. 조회 결과 텍스트 갈취 (scrape)
        grid_text = scrape_hyper_verify(shared_driver, container_no)
        
        if grid_text:
            print(f"LOG:[데몬] {container_no} 데이터 추출 완료")
            return jsonify({
                "ok": True, 
                "status": status, 
                "data": grid_text
            })
        else:
            print(f"LOG:[데몬] {container_no} 조회는 했으나 데이터를 읽지 못함")
            return jsonify({
                "ok": True, 
                "status": status, 
                "data": None,
                "message": "내역 없음 또는 파싱 실패"
            })
            
    except Exception as e:
        print(f"LOG:[데몬] 조회 중 치명적 에러: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)})

@app.route('/quit', methods=['POST'])
def quit_driver():
    """브라우저 강제 종료 (로그아웃 시 사용)"""
    global shared_driver
    if shared_driver:
        try:
            shared_driver.quit()
            shared_driver = None
            return jsonify({"ok": True, "message": "브라우저 종료 완료"})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)})
    return jsonify({"ok": True, "message": "종료할 브라우저가 없습니다."})

if __name__ == '__main__':
    # 명령을 대기한다!
    print("========================================")
    print("   ELS HYPER TURBO DAEMON STARTED")
    print("   PORT: 31999 | READY FOR HYUNG")
    print("========================================")
    app.run(host='0.0.0.0', port=31999, debug=False)