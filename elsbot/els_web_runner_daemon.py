import json
import time
import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS

# 우리가 방금 고친 els_bot의 심장 함수들을 가져온다!
from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify, run_els_process
import re
import pandas as pd
from flask import Response

app = Flask(__name__)
# 모든 외부 접속 허용 (로컬/나스 공용)
CORS(app)

# 전역 변수로 브라우저 드라이버를 유지 (세션 유지의 핵심)
shared_driver = None
current_user = {"id": None, "pw": None, "show_browser": False}
is_busy = False # 현재 조회 작업 수행 중인지 여부

def check_driver_alive(driver):
    """실제로 브라우저가 살아있는지 체크 (변수만 있는게 아니라 진짜 통신되는지)"""
    global is_busy
    if not driver: return False
    
    # 만약 현재 조회 중(is_busy)이라면 이미 살아있는 것이므로 title 체크를 생략 (Thread conflict 방지)
    if is_busy:
        return True
        
    try:
        # 가벼운 명령어로 응답 확인
        _ = driver.title
        return True
    except:
        return False

@app.route('/health', methods=['GET'])
def health():
    """백엔드가 데몬이 살아있는지 확인할 때 부르는 곳"""
    global is_busy
    is_alive = check_driver_alive(shared_driver)
    return jsonify({
        "status": "ok", 
        "driver_active": is_alive,
        "is_busy": is_busy,
        "user_id": current_user["id"]
    })

@app.route('/login', methods=['POST'])
def login():
    """백엔드에서 로그인 요청이 오면 브라우저를 띄우고 ETRANS 접속"""
    global shared_driver, current_user, is_busy
    data = request.json
    u_id = (data.get('userId') or "").strip()
    u_pw = data.get('userPw')
    show_browser = data.get('showBrowser', False)
    
    # [방어 로직] 이미 브라우저가 살아있고 계정이 같다면 절대 새로 띄우지 않음!
    # 단, 요청된 브라우저 표시 모드(showBrowser)가 현재 상태와 다르면 새로 띄워야 함 (Headless <-> UI 전환)
    is_alive = check_driver_alive(shared_driver)
    is_same_account = current_user["id"] and current_user["id"].lower() == u_id.lower()
    is_same_mode = current_user.get("show_browser") == show_browser

    # 조회 중(is_busy)이라면 무조건 유지, 그 외엔 조건 충족 시 유지
    if (is_alive or is_busy) and is_same_account and is_same_mode:
        print(f"[데몬] 기존 세션 ({u_id}, GUI:{show_browser}) 재사용 및 유지.")
        return jsonify({
            "ok": True, 
            "message": "이미 로그인되어 있습니다.", 
            "log": [f"[데몬] 이미 {u_id} 계정으로 로그인되어 있으며 설정이 동일합니다."]
        })
    
    # 로그 수집용 리스트
    logs = []
    
    if is_alive and not is_same_mode:
        print(f"[데몬] 브라우저 모드 변경 감지 (GUI: {current_user.get('show_browser')} -> {show_browser}). 재시작합니다.")
        logs.append(f"[데몬] 디버그 모드 변경으로 인해 브라우저를 재시작합니다.")

    print(f"[데몬] {u_id} 계정으로 새 세션 로그인 시도 중... (GUI: {show_browser})")
    logs.append(f"[데몬] {u_id} 계정으로 새 세션 로그인 시도 중... (GUI모드: {show_browser})")
    
    # 기존에 돌던 브라우저가 있으면 깔끔하게 종료하고 새로 띄움
    if shared_driver:
        try:
            print("[데몬] 기존 브라우저 세션 종료 중...")
            shared_driver.quit()
        except:
            pass
        finally:
            shared_driver = None
    
    # els_bot.py의 독립 함수 호출
    # 로그를 리스트에 모으는 콜백
    def collect_log(msg):
        print(f"LOG:{msg}")
        logs.append(msg)
    
    result = login_and_prepare(u_id, u_pw, log_callback=collect_log, show_browser=show_browser)
    
    driver = result[0]
    error = result[1]
    
    if driver:
        shared_driver = driver
        current_user["id"] = u_id
        current_user["pw"] = u_pw
        current_user["show_browser"] = show_browser # 현재 모드 저장
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
    """로그인된 세션을 사용해서 실제로 컨테이너 번호를 조회 (스트리밍 지원)"""
    global shared_driver, is_busy
    if not shared_driver:
        return jsonify({"ok": False, "error": "활성화된 브라우저 세션이 없습니다. 먼저 로그인하세요."})
    
    data = request.json
    containers = data.get('containers', [])
    # 단일 조회(containerNo) 하위 호환성 유지
    if not containers and data.get('containerNo'):
        containers = [data.get('containerNo')]
    
    if not containers:
        return jsonify({"ok": False, "error": "조회할 컨테이너 번호가 누락되었습니다."})

    is_busy = True # 조회 시작!
    
    def generate():
        start_time = time.time()
        final_rows = []
        headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
        
        try:
            for cn_raw in containers:
                item_start = time.time()
                cn = str(cn_raw).strip().upper()
                
                # 프론트엔드로 즉시 보낼 로그 콜백
                def _stream_log(msg):
                    item_elapsed = time.time() - item_start
                    line = f"LOG:[{item_elapsed:5.1f}s] {msg}\n"
                    return line

                yield f"LOG:[{cn}] 조회를 시작합니다.\n"
                
                # solve_input_and_search 내부에서 발생하는 로그도 스트리밍
                def _inner_log(msg):
                    it_el = time.time() - item_start
                    print(f"[{cn}] {msg}")
                    return f"LOG:[{it_el:5.1f}s] {msg}\n"

                # 실제 조회 수행
                status = solve_input_and_search(shared_driver, cn, log_callback=None) # 콜백 처리가 복잡하므로 여기선 생략하거나 yield로 직접 처리
                yield _inner_log(f"[{cn}] {status}")
                
                if "완료" in status:
                    grid_text = scrape_hyper_verify(shared_driver, cn)
                    if grid_text:
                        found_any = False
                        blacklist = ["SKR", "YML", "ZIM", "최병훈", "안녕하세요", "로그아웃", "조회"]
                        lines = grid_text.split('\n')
                        for line in lines:
                            stripped = line.strip()
                            if not stripped or any(kw in stripped for kw in blacklist): continue
                            row_data = re.split(r'\t|\s{2,}', stripped)
                            if row_data and row_data[0].isdigit() and 1 <= int(row_data[0]) <= 20:
                                final_rows.append([cn] + row_data[:14])
                                found_any = True
                        if not found_any:
                            final_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
                    else:
                        final_rows.append([cn, "NODATA", "데이터 추출 실패"] + [""]*12)
                    yield _inner_log(f"[{cn}] 조회 완료")
                else:
                    final_rows.append([cn, "ERROR", status] + [""]*12)
                    yield _inner_log(f"[{cn}] 조회 실패")

            # 모든 작업 완료 후 결과 전송
            total_elapsed = time.time() - start_time
            result_data = {
                "ok": True,
                "result": final_rows,
                "total_elapsed": total_elapsed
            }
            yield f"RESULT:{json.dumps(result_data, ensure_ascii=False)}\n"
            
        except Exception as e:
            yield f"LOG:[에러] {str(e)}\n"
            yield f"RESULT:{json.dumps({'ok': False, 'error': str(e)})}\n"
        finally:
            global is_busy
            is_busy = False

    return Response(generate(), mimetype='text/plain')

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
    app.run(host='0.0.0.0', port=31999, debug=False, threaded=True)