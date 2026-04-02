content = r'''import pandas as pd
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
    try:
        path = os.path.join(os.path.dirname(__file__), f"{name}_screenshot.png")
        page.get_screenshot(path=path)
    except Exception as e:
        print(f"[DEBUG] 스크린샷 저장 실패: {e}")

def check_alert(page):
    try:
        if page.handle_alert(accept=True):
            return "Alert accepted"
    except: pass
    return None

def close_modals(page):
    try:
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return "SESSION_EXPIRED"

        modal_titles = page.eles('css:.w2modal_title', timeout=0.1)
        for title in modal_titles:
            if "로그인" in title.text:
                return "SESSION_EXPIRED"

        page.run_js("""
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => {
                if (e.innerText.indexOf('로그인') === -1) {
                    e.style.display = 'none';
                }
            });
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
        """)
    except: pass
    return "OK"

def is_session_valid(page):
    try:
        if not page or not page.url: return False
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return False
            
        if page.ele('text:로그아웃', timeout=1) or page.ele('text:님 안녕하세요', timeout=0.1):
            return True
        return False
    except:
        return False

def find_ele_globally(page, selector, timeout=0.5):
    res = page.ele(selector, timeout=timeout)
    if res: return res
    iframes = page.eles('t:iframe')
    for iframe in iframes:
        try:
            res = iframe.ele(selector, timeout=0.1)
            if res: return res
        except: continue
    return None

def open_els_menu(page, log_callback=None):
    if log_callback: log_callback("🚀 JS 메뉴 강제 진입 시도 (MNU0024)...")
    close_modals(page)
    page.run_js("if(window.MNU0024) MNU0024('컨테이너이동현황(국내)', 'https://etrans.klnet.co.kr/main.do?MNU_CD=MNU0024', 'M', '');")
    time.sleep(3)
    for i in range(30):
        target = find_ele_globally(page, 'css:input[id*="containerNo"]')
        if target and target.states.is_displayed:
            if log_callback: log_callback(f"✅ 메뉴 진입 성공! (탐색 소요: {i*0.5}s)")
            return True
        time.sleep(0.5)
        if i % 10 == 0:
            close_modals(page)
            page.run_js("if(window.MNU0024) MNU0024('컨테이너이동현황(국내)', 'https://etrans.klnet.co.kr/main.do?MNU_CD=MNU0024', 'M', '');")
    return False

def solve_input_and_search(page, container_no, log_callback=None):
    try:
        input_ele = find_ele_globally(page, 'css:input[id*="containerNo"]', timeout=5)
        if not input_ele:
            if log_callback: log_callback("❌ 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"
        close_modals(page)
        input_ele.click()
        input_ele.run_js(f"this.value = '{container_no}';")
        input_ele.input(container_no, clear=True)
        search_btn = find_ele_globally(page, 'text:조회') or find_ele_globally(page, 'css:[id*="btn_search"]') or find_ele_globally(page, 'css:[id*="btnSearch"]')
        if search_btn:
            search_btn.click()
            return True
        return False
    except Exception as e:
        return str(e)

def scrape_hyper_verify(page, search_no):
    script = r"""
    var results = [];
    function dive(win) {
        try {
            var rows = win.document.querySelectorAll('tr');
            for (var j = 0; j < rows.length; j++) {
                var cells = rows[j].cells;
                if (!cells || cells.length < 5) continue;
                var rowVals = [];
                for (var k = 0; k < cells.length; k++) {
                    rowVals.push(cells[k].innerText.trim().replace(/\s+/g, ' '));
                }
                var rowText = rowVals.join('|');
                var hasDirection = /수입|수출|반입|반출/.test(rowText);
                var isNumberedRow = /^\d+\|/.test(rowText);
                if (isNumberedRow && hasDirection) {
                    results.push(rowText);
                }
            }
            for (var i = 0; i < win.frames.length; i++) { 
                try { dive(win.frames[i]); } catch(e) {}
            }
        } catch (e) {}
    }
    dive(window);
    var finalData = Array.from(new Set(results));
    return finalData.join('\n');
    """
    for attempt in range(20):
        try:
            res = page.run_js(script)
            if res and '|' in res: return res
        except: pass
        time.sleep(0.5)
    return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        if log_callback: log_callback(f"[{time.time()-start_time:6.2f}s] {msg}")

    _log(f"DrissionPage 시작... (포트: {port})")
    co = ChromiumOptions()
    co.set_local_port(port)
    user_data_dir = f"/tmp/drission_port_{port}"
    co.set_user_data_path(user_data_dir)
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--window-size=1920,1080')
    co.set_argument('--disable-blink-features=AutomationControlled')
    
    chrome_path = os.environ.get("CHROME_BIN", "/usr/bin/google-chrome")
    if os.path.exists(chrome_path): co.set_browser_path(chrome_path)

    if not show_browser:
        co.set_argument('--headless=new')
        co.headless(True)
    
    try:
        page = ChromiumPage(co)
    except Exception as e:
        return (None, f"브라우저 실행 실패: {e}")

    try:
        page.get("https://etrans.klnet.co.kr/index.do")
        if is_session_valid(page): return (page, None)
        
        close_modals(page)
        uid_input = page.ele('#mf_wfm_subContainer_ibx_userId', timeout=10)
        pw_input = page.ele('#mf_wfm_subContainer_sct_password', timeout=10)
        
        if not uid_input: return (None, "입력창 없음")
        uid_input.input(u_id.strip())
        pw_input.input(u_pw)
        btn = page.ele('#mf_wfm_subContainer_btn_login')
        if btn: btn.click()
        else: pw_input.input('\n')
        
        for _ in range(15):
            time.sleep(1)
            close_modals(page)
            if is_session_valid(page): break
        
        if not is_session_valid(page): return (None, "로그인 실패")
        if open_els_menu(page, _log): return (page, None)
        return (None, "메뉴 실패")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False):
    res = login_and_prepare(u_id, u_pw, log_callback, show_browser=show_browser)
    page = res[0]
    if not page: return {"ok": False, "error": res[1]}
    final_rows = []
    for cn_raw in c_list:
        cn = str(cn_raw).strip().upper()
        solve_input_and_search(page, cn)
        grid_text = scrape_hyper_verify(page, cn)
        if grid_text:
            for line in grid_text.split('\n'):
                row_data = line.strip().split('|')
                if row_data and row_data[0].isdigit():
                    final_rows.append([cn] + row_data[:14])
        else: final_rows.append([cn, "NODATA", "없음"] + [""]*12)
    page.quit()
    return {"ok": True, "sheet2": final_rows}

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        parser = argparse.ArgumentParser()
        parser.add_argument("--containers", type=str)
        parser.add_argument("--user-id", type=str)
        parser.add_argument("--user-pw", type=str)
        args = parser.parse_args(sys.argv[2:])
        final_res = run_els_process(args.user_id, args.user_pw, json.loads(args.containers))
        print(f"RESULT:{json.dumps(final_res, ensure_ascii=False)}")
'''
with open('els_bot.py', 'w', encoding='utf-8') as f:
    f.write(content)
