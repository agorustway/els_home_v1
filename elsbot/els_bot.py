import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoAlertPresentException
import time
import datetime
import json
import os
import sys
import argparse
import re
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

def save_config(user_id, user_pw):
    with open(CONFIG_FILE, "w") as f: json.dump({"user_id": user_id, "user_pw": user_pw}, f)

def check_alert(driver):
    try:
        alert = driver.switch_to.alert
        txt = alert.text
        alert.accept()
        return txt
    except: return None

def _is_valid_input_simple(element):
    """날짜 필드 등 잘못된 입력창인지 검사"""
    try:
        eid = (element.get_attribute('id') or "").lower()
        ename = (element.get_attribute('name') or "").lower()
        etype = (element.get_attribute('type') or "").lower()
        eclass = (element.get_attribute('class') or "").lower()
        val = element.get_attribute('value')
        
        if 'containerno' in eid or 'container_no' in eid: return True
        if any(x in eid or x in ename or x in eclass for x in ['date', 'ymd', 'from', 'to', 'cal']): return False
        if val and len(val) >= 8 and ('-' in val or '/' in val or val.isdigit()):
            if val.count('-') == 2 or val.count('/') == 2: return False
        if etype in ['hidden', 'button', 'image', 'submit']: return False
        return True
    except: return False

def open_els_menu(driver, log_callback=None):
    if log_callback: log_callback("메뉴 진입 시도 중...")
    
    for attempt in range(15):  # 이전 코드: 15번 시도
        check_alert(driver)  # alert 체크 추가
        
        # iframe 순회 (이전 성공 코드 방식)
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in [None] + frames:  # None부터 시작 (메인 프레임 먼저)
            try:
                if frame:
                    driver.switch_to.frame(frame)
                
                # 메뉴 찾기
                targets = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                if targets:
                    driver.execute_script("arguments[0].click();", targets[0])
                    time.sleep(4)  # 이전 코드: 4초 대기
                    return True
            except:
                pass
            finally:
                driver.switch_to.default_content()
        
        time.sleep(1)
    
    return False

def solve_input_and_search(driver, container_no, log_callback=None):
    """[수정 완료] driver를 직접 사용하여 NameError 방지"""
    check_alert(driver)
    found_target = None
    driver.switch_to.default_content()
    
    # 모든 프레임 뒤져서 입력창 찾기
    all_frames = [None] + driver.find_elements(By.TAG_NAME, "iframe")
    for frame in all_frames:
        try:
            if frame: driver.switch_to.frame(frame)
            labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]")
            for lbl in labels:
                if "조회" in lbl.text: continue
                inputs = lbl.find_elements(By.XPATH, "./following-sibling::input") or \
                         lbl.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
                for inp in inputs:
                    if _is_valid_input_simple(inp):
                        found_target = inp
                        break
                if found_target: break
            if found_target: break
        except:
            driver.switch_to.default_content()
            continue

    if found_target:
        try:
            found_target.click()
            found_target.send_keys(Keys.CONTROL + "a"); found_target.send_keys(Keys.DELETE)
            found_target.send_keys(container_no)
            time.sleep(0.2)
            found_target.send_keys(Keys.ENTER)
            
            # 조회 버튼 강제 클릭 (버튼 못찾을 경우 대비)
            time.sleep(1)
            search_btns = driver.find_elements(By.XPATH, "//*[contains(text(),'조회') or contains(@id, 'btn_search')]")
            for btn in search_btns:
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    break
            
            time.sleep(3) # 로딩 대기
            return "조회시도완료"
        except Exception as e:
            return f"입력오류: {e}"
    return "입력창을 찾을 수 없습니다."

def scrape_hyper_verify(driver, search_no):
    script = """
    var all_text = "";
    function collect(win) {
        try {
            all_text += win.document.body.innerText + "\\n";
            for (var i = 0; i < win.frames.length; i++) { collect(win.frames[i]); }
        } catch (e) {}
    }
    collect(window);
    return all_text;
    """
    try: return driver.execute_script(script)
    except: return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    print(f"[BOT] 자동화 시작 (브라우저 표시: {show_browser})")
    options = webdriver.ChromeOptions()
    
    # 공통 옵션
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)

    if not show_browser:
        # 백그라운드 모드 (Headless)
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
    else:
        # 화면 표시 모드 (Debug)
        options.add_argument("--start-maximized")
        # 팝업 차단 해제 등 추가 기능이 필요하면 여기에 추가 가능

    try:
        # ChromeDriver 경로 우선순위: 시스템 설치 > webdriver-manager
        chromedriver_path = "/usr/local/bin/chromedriver"  # Docker에서 설치한 경로
        if not os.path.exists(chromedriver_path):
            # 로컬 환경에서는 webdriver-manager 사용
            chromedriver_path = ChromeDriverManager().install()
        
        service_obj = Service(chromedriver_path)
        driver = webdriver.Chrome(service=service_obj, options=options)
        driver.get("https://etrans.klnet.co.kr/index.do")
        
        wait = WebDriverWait(driver, 60)
        uid_input = wait.until(EC.presence_of_element_located((By.ID, "mf_wfm_subContainer_ibx_userId")))
        
        # 입력 필드가 완전히 활성화될 때까지 대기
        time.sleep(1)
        
        # 아이디 입력 (clear 제거 - 이전 성공 코드 방식)
        uid_input.send_keys(u_id)
        time.sleep(0.5)
        
        # 비밀번호 입력 (clear 제거)
        pw_input = driver.find_element(By.ID, "mf_wfm_subContainer_sct_password")
        pw_input.send_keys(u_pw)
        time.sleep(0.5)
        
        # Enter 키로 로그인 (이전 성공 코드 방식)
        pw_input.send_keys(Keys.ENTER)
        
        _log("로그인 시도 중...")
        
        # 로그인 처리 대기 (이전 코드: 8초)
        time.sleep(8)
        
        # alert 체크 (로그인 실패 팝업)
        alert_msg = check_alert(driver)
        if alert_msg:
            _log(f"로그인 실패 팝업: {alert_msg}")
            driver.quit()
            return (None, f"로그인 실패: {alert_msg}")
        
        _log("메뉴 진입 시도 중...")
        if open_els_menu(driver, _log):
            _log("메뉴 진입 성공")
            return (driver, None)
        
        driver.quit()
        return (None, "메뉴 진입 실패")
    except Exception as e:
        if 'driver' in locals() and driver: driver.quit()
        return (None, f"에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    res = login_and_prepare(u_id, u_pw, _log, show_browser=show_browser)
    driver = res[0]
    if not driver: return {"ok": False, "error": res[1]}

    final_rows = []
    headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    for cn_raw in c_list:
        item_start = time.time()
        cn = str(cn_raw).strip().upper()
        
        # 콜백에 보낼 때는 누적 시간이 아니라 현재 항목 소요 시간만 표시하고 싶어함
        def _item_log(msg):
            item_elapsed = time.time() - item_start
            if log_callback: log_callback(f"{cn}: {msg} ({item_elapsed:.1f}s)")

        _item_log(f"[{cn}] 분석 시작...")
        status = solve_input_and_search(driver, cn, _item_log)
        
        if "완료" in status:
            grid_text = scrape_hyper_verify(driver, cn)
            if grid_text:
                found_any = False
                blacklist = ["SKR", "YML", "ZIM", "최병훈", "안녕하세요", "로그아웃", "조회"]
                lines = grid_text.split('\n')
                for line in lines:
                    stripped = line.strip()
                    if not stripped or any(kw in stripped for kw in blacklist): continue
                    
                    # 정규표현식으로 정밀 파싱
                    row_data = re.split(r'\t|\s{2,}', stripped)
                    if row_data and row_data[0].isdigit() and 1 <= int(row_data[0]) <= 20:
                        final_rows.append([cn] + row_data[:14])
                        found_any = True
                if not found_any:
                    final_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
            else:
                final_rows.append([cn, "NODATA", "데이터 추출 실패"] + [""]*12)
            
            _item_log(f"[{cn}] 조회 완료")
        else:
            final_rows.append([cn, "ERROR", status] + [""]*12)
            _item_log(f"[{cn}] 조회 실패: {status}")

    driver.quit()
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

# CLI 실행용 메인 함수 (기존 로직 유지)
def cli_main():
    config = load_config()
    u_id = config.get('user_id', '')
    u_pw = config.get('user_pw', '')
    try:
        df_in = pd.read_excel(os.path.join(os.path.dirname(__file__), "container_list.xlsx"))
        c_list = df_in.iloc[2:, 0].dropna().tolist()
        results = run_els_process(u_id, u_pw, c_list, log_callback=print)
        # 여기서 엑셀 저장 로직 추가 (CLI 사용 시)
    except Exception as e:
        print(f"CLI 에러: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "run":
        parser = argparse.ArgumentParser()
        parser.add_argument("--containers", type=str)
        parser.add_argument("--user-id", type=str)
        parser.add_argument("--user-pw", type=str)
        args = parser.parse_args(sys.argv[2:])
        
        c_list = json.loads(args.containers) if args.containers else []
        u_id = args.user_id if args.user_id else load_config().get('user_id')
        u_pw = args.user_pw if args.user_pw else load_config().get('user_pw')
        
        final_res = run_els_process(u_id, u_pw, c_list, log_callback=lambda x: print(f"LOG:{x}", flush=True))
        print(f"RESULT:{json.dumps(final_res, ensure_ascii=False)}", flush=True)
    else:
        cli_main()