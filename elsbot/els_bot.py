import pandas as pd
from DrissionPage import ChromiumPage, ChromiumOptions
import time
import json
import os
import sys
import re
import argparse
from openpyxl.styles import PatternFill

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "els_config.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"[ERROR] 설정 파일 '{CONFIG_FILE}' 형식이 잘못되었습니다. 기본값 사용.")
            return {"user_id": "", "user_pw": ""}
        except Exception as e:
            print(f"[ERROR] 설정 파일 '{CONFIG_FILE}'을 읽는 중 오류 발생: {e}")
            return {"user_id": "", "user_pw": ""}
    else:
        return {"user_id": "", "user_pw": ""}

def save_screenshot(page, name="debug"):
    """디버그용 스크린샷 저장 (elsbot/debug_screenshot.png)"""
    try:
        path = os.path.join(os.path.dirname(__file__), f"{name}_screenshot.png")
        page.get_screenshot(path=path)
    except Exception as e:
        print(f"[DEBUG] 스크린샷 저장 실패: {e}")

def check_alert(page):
    """DrissionPage는 알람을 자동으로 처리하거나 확인할 수 있음"""
    try:
        if page.handle_alert(accept=True):
            return "Alert accepted"
    except: pass
    return None

def close_modals(page):
    """이트랜스 공지사항 등 모달 창 닫기 (DrissionPage 버전)"""
    try:
        # WebSquare 전용 모달 강제 파괴/숨김
        page.run_js("""
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => e.style.display = 'none');
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
        """)
    except: pass

def open_els_menu(page, log_callback=None):
    if log_callback: log_callback("메뉴 진입 시도 중 (DrissionPage)...")
    
    for attempt in range(10):
        close_modals(page)
        
        # 현재 상태 확인 (URL/Title)
        curr_url = page.url
        curr_title = page.title
        if log_callback: log_callback(f"진입 시도 ({attempt+1}/10) - URL: {curr_url}, Title: {curr_title}")

        # 조회 페이지 도착 확인 (입력창 탐지)
        if page.ele('css:input[id*="containerNo"]', timeout=3):
            if log_callback: log_callback("✅ 조회 페이지 도착 확인!")
            return True

        # URL 직접 이동 (3회차부터 시도)
        if attempt >= 2:
            if log_callback: log_callback("직접 URL 이동 시도...")
            page.get("https://etrans.klnet.co.kr/main/index.do?menuId=002001007")
            time.sleep(4)
        else:
            # 메뉴 클릭 시도
            target = page.ele('text:컨테이너 이동현황', timeout=3)
            if target:
                if log_callback: log_callback("메뉴 텍스트 클릭!")
                target.click()
                time.sleep(3)
            else:
                # 상위 메뉴 '통합정보조회' 먼저 클릭 시도 (필요한 경우)
                parent = page.ele('text:통합정보조회', timeout=2)
                if parent: parent.click(); time.sleep(1)
        
    return False

def solve_input_and_search(page, container_no, log_callback=None):
    """[WebSquare 특화] DrissionPage로 값 설정 + 조회 버튼 클릭"""
    try:
        # 입력창 찾기
        input_ele = page.ele('css:input[id*="containerNo"]', timeout=5)
        if not input_ele:
            if log_callback: log_callback(f"[{container_no}] 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"

        # 값 입력 (기존 텍스트 삭제 후 입력)
        input_ele.clear()
        input_ele.input(container_no)
        
        # 조회 버튼 클릭
        btn = page.ele('css:[id*="btnSearch"]', timeout=2)
        if not btn:
            # 텍스트로 찾기
            btn = page.ele('text:조회', timeout=2)
        
        if btn:
            btn.click()
        else:
            input_ele.input('\n') # 엔터키

        if log_callback: log_callback(f"[{container_no}] 조회 버튼 클릭 완료")
        
        # 팝업 대기 및 처리
        time.sleep(1)
        return True
    except Exception as e:
        return str(e)

def scrape_hyper_verify(page, search_no):
    """모든 프레임을 뒤져서WebSquare 데이터를 추출 (DrissionPage 이식)"""
    
    script = r"""
    var searchNo = arguments[0].replace(/[^A-Z0-9]/g, '').toUpperCase();
    var results = [];
    
    function dive(win) {
        try {
            var bodyText = (win.document.body ? win.document.body.innerText : "").toUpperCase();
            var inputs = win.document.querySelectorAll('input');
            var allContent = bodyText;
            for(var i=0; i<inputs.length; i++) { allContent += " " + (inputs[i].value || "").toUpperCase(); }
            var cleanedContent = allContent.replace(/[^A-Z0-9]/g, '');

            if (cleanedContent.indexOf(searchNo) !== -1) {
                var rows = win.document.querySelectorAll('tr');
                for (var j = 0; j < rows.length; j++) {
                    var cells = rows[j].cells;
                    if (!cells || cells.length < 5) continue;
                    
                    var rowVals = [];
                    for (var k = 0; k < cells.length; k++) {
                        rowVals.push(cells[k].innerText.trim().replace(/\n/g, ' '));
                    }
                    var rowText = rowVals.join('|');
                    if (/^\d+\|/.test(rowText) && (rowText.indexOf('수입') !== -1 || rowText.indexOf('수출') !== -1 || rowText.indexOf('반입') !== -1 || rowText.indexOf('반출') !== -1)) {
                        results.push(rowText);
                    }
                }
            }
            for (var i = 0; i < win.frames.length; i++) { dive(win.frames[i]); }
        } catch (e) {}
    }
    dive(window);
    return Array.from(new Set(results)).join('\n');
    """
    
    for _ in range(10):
        try:
            res = page.run_js(script, search_no)
            if res and '|' in res and len(res.strip()) > 10:
                return res
        except: pass
        time.sleep(1)
        
    # 데이터 없음 확인
    try:
        full_text = page.html
        for msg in ["데이터가 없습니다", "내역이 없습니다", "데이터가 존재하지 않습니다"]:
            if msg in full_text:
                return "NODATA_CONFIRMED"
    except: pass
        
    return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    _log(f"DrissionPage 시작 (포트: {port}, 화면: {show_browser})")
    
    co = ChromiumOptions()
    co.set_local_port(port) # 병렬 처리를 위해 포트 지정
    
    # 병렬 처리 시 프로필 충돌 방지를 위해 포트별 별도 데이터 디렉토리 사용
    user_data_dir = f"/tmp/drission_port_{port}"
    co.set_user_data_path(user_data_dir)
    
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--window-size=1920,1080')
    co.set_argument('--disable-blink-features=AutomationControlled')
    
    # Docker 환경에서 Chrome 경로 강제 지정 (Dockerfile 설정에 맞춤)
    chrome_path = "/usr/bin/google-chrome"
    if os.path.exists(chrome_path):
        co.set_browser_path(chrome_path)

    if not show_browser:
        co.set_argument('--headless=new')
        co.headless(True)
    
    try:
        from DrissionPage.errors import BrowserConnectError
        page = ChromiumPage(co)
    except Exception as e:
        _log(f"브라우저 실행 실패: {str(e)}")
        if 'page' in locals() and page: page.quit()
        return (None, f"브라우저 실행 실패: {e}")

    try:
        page.get("https://etrans.klnet.co.kr/index.do")
        
        # 로그인 정보 입력
        uid_input = page.ele('#mf_wfm_subContainer_ibx_userId', timeout=30)
        if not uid_input:
            page.quit()
            return (None, "로그인 페이지 로드 실패")
            
        uid_input.input(u_id)
        pw_input = page.ele('#mf_wfm_subContainer_sct_password')
        pw_input.input(u_pw)
        
        # 로그인 버튼 클릭 (엔터 대신 명시적 클릭 시도)
        login_btn = page.ele('css:[id*="btnLogin"], css:[id*="btn_login"], text:로그인', timeout=5)
        if login_btn:
            _log("로그인 버튼 클릭...")
            login_btn.click()
        else:
            _log("로그인 버튼을 못 찾아 엔터키로 시도...")
            pw_input.input('\n')
        
        _log("로그인 시도 중 (엔터 전송)...")
        time.sleep(7) # 충분한 로그인 처리 시간 확보
        
        close_modals(page)
        
        # 로그인 실패 확인 (alert 확인 등은 DrissionPage가 어느 정도 자동으로 처리하지만 직접 호출)
        if "아이디를 입력" in page.html or "비밀번호를 입력" in page.html:
             page.quit()
             return (None, "로그인 정보 재요청됨 (실패 가능성)")

        if open_els_menu(page, _log):
            _log("메뉴 진입 성공")
            return (page, None)
        
        # 실패 시 스크린샷 저장 (데몬에서 확인 가능)
        save_screenshot(page, "debug")
        final_url = page.url
        _log(f"메뉴 진입 최종 실패 (URL: {final_url}) - 스크린샷 저장됨")
        page.quit()
        return (None, f"메뉴 진입 실패 (마지막 URL: {final_url})")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    res = login_and_prepare(u_id, u_pw, _log, show_browser=show_browser)
    page = res[0]
    if not page: return {"ok": False, "error": res[1]}

    final_rows = []
    headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    for cn_raw in c_list:
        item_start = time.time()
        cn = str(cn_raw).strip().upper()
        
        def _item_log(msg):
            item_elapsed = time.time() - item_start
            if log_callback: log_callback(f"{cn}: {msg} ({item_elapsed:.1f}s)")

        _item_log(f"분석 시작...")
        status = solve_input_and_search(page, cn, _item_log)
        
        if status is True:
            grid_text = scrape_hyper_verify(page, cn)
            if grid_text:
                found_any = False
                lines = grid_text.split('\n')
                for line in lines:
                    stripped = line.strip()
                    if not stripped: continue
                    row_data = stripped.split('|')
                    if row_data and str(row_data[0]).isdigit():
                        while len(row_data) < 15: row_data.append("")
                        final_rows.append([cn] + row_data[:14])
                        found_any = True
                if not found_any:
                    final_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
            else:
                final_rows.append([cn, "NODATA", "데이터 추출 실패"] + [""]*12)
        else:
            final_rows.append([cn, "ERROR", str(status)] + [""]*12)

    page.quit()
    total_elapsed = time.time() - start_time
    if final_rows:
        df = pd.DataFrame(final_rows, columns=headers)
        return {
            "ok": True, 
            "sheet1": df[df['No'].astype(str) == '1'].to_dict('records'), 
            "sheet2": df.to_dict('records'),
            "total_elapsed": total_elapsed
        }
    return {"ok": False, "error": "결과 없음", "total_elapsed": total_elapsed}

def cli_main():
    config = load_config()
    u_id = config.get('user_id', '')
    u_pw = config.get('user_pw', '')
    try:
        df_in = pd.read_excel(os.path.join(os.path.dirname(__file__), "container_list.xlsx"))
        c_list = df_in.iloc[2:, 0].dropna().tolist()
        results = run_els_process(u_id, u_pw, c_list, log_callback=print)
        print(f"조회 완료: {len(results.get('sheet2', []))}건 기록됨")
    except Exception as e:
        print(f"CLI 에러: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        parser = argparse.ArgumentParser()
        parser.add_argument("--containers", type=str)
        parser.add_argument("--user-id", type=str)
        parser.add_argument("--user-pw", type=str)
        args = parser.parse_args(sys.argv[2:])
        
        if args.containers:
            try: c_list = json.loads(args.containers)
            except: c_list = [x.strip() for x in args.containers.split(',') if x.strip()]
        else: c_list = []
        u_id = args.user_id if args.user_id else load_config().get('user_id')
        u_pw = args.user_pw if args.user_pw else load_config().get('user_pw')
        
        final_res = run_els_process(u_id, u_pw, c_list, log_callback=lambda x: print(f"LOG:{x}", flush=True))
        print(f"RESULT:{json.dumps(final_res, ensure_ascii=False)}", flush=True)
    else:
        cli_main()