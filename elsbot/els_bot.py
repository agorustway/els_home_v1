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
from openpyxl.styles import PatternFill

CONFIG_FILE = "els_config.json"

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f: return json.load(f)
        except: return {"user_id": "", "user_pw": ""}
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

def open_els_menu(driver):
    """로그인 후 컨테이너 이동현황 메뉴 클릭. NAS 등 느린 환경을 위해 대기 여유 확보."""
    print("메뉴 진입 중...")
    for _ in range(20):
        check_alert(driver)
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in [None] + frames:
            try:
                if frame:
                    driver.switch_to.frame(frame)
                target = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                if target:
                    driver.execute_script("arguments[0].click();", target[0])
                    # 페이지 전환 대기: NAS에서 느릴 수 있으므로 2초 (이전 0.5초에서 복원)
                    time.sleep(2)
                    # 조회 입력창 로드 대기: 최대 20회 x 0.5초 = 10초 (NAS 여유)
                    for _ in range(20):
                        driver.switch_to.default_content()
                        for f in driver.find_elements(By.TAG_NAME, "iframe"):
                            try:
                                driver.switch_to.frame(f)
                                if driver.find_elements(By.CSS_SELECTOR, "input[id*='containerNo']"):
                                    driver.switch_to.default_content()
                                    return True
                            except Exception:
                                pass
                            finally:
                                driver.switch_to.default_content()
                        time.sleep(0.5)
                    driver.switch_to.default_content()
                    # 입력창을 못 찾았으면 성공 처리하지 않고 다음 프레임/루프 시도
            except Exception:
                continue
            finally:
                driver.switch_to.default_content()
        time.sleep(0.3)
    return False

def solve_input_and_search(driver, container_no):
    """하이퍼 터보 입력 및 팝업 감시"""
    check_alert(driver)
    frames = driver.find_elements(By.TAG_NAME, "iframe")
    for frame in [None] + frames:
        try:
            if frame: driver.switch_to.frame(frame)
            input_field = driver.find_elements(By.CSS_SELECTOR, "input[id*='containerNo']")
            if input_field:
                target = input_field[0]
                target.click()
                target.send_keys(Keys.CONTROL + "a"); target.send_keys(Keys.DELETE)
                target.send_keys(container_no); target.send_keys(Keys.ENTER)
                for _ in range(20):
                    msg = check_alert(driver)
                    if msg: return f"오류: {msg}"
                    time.sleep(0.03)
                return True
        except: continue
        finally: driver.switch_to.default_content()
    return False

def scrape_hyper_verify(driver, search_no):
    """매의 눈 검증: 텍스트와 입력창 값을 모두 대조해 가짜 데이터 차단"""
    script = """
    var searchNo = arguments[0].replace(/[^A-Z0-9]/g, '').toUpperCase();
    function getGrid(win) {
        try {
            var bodyText = win.document.body.innerText.toUpperCase();
            var inputs = win.document.querySelectorAll('input');
            var allContent = bodyText;
            for(var i=0; i<inputs.length; i++) { allContent += " " + inputs[i].value.toUpperCase(); }
            var cleanedContent = allContent.replace(/[^A-Z0-9]/g, '');

            if (cleanedContent.indexOf(searchNo) !== -1) {
                var rows = win.document.querySelectorAll('tr');
                var data = [];
                var foundMatch = false;
                rows.forEach(r => {
                    var txt = r.innerText.toUpperCase();
                    if ((txt.includes('수출') || txt.includes('수입')) && !txt.includes('RFID') && !txt.includes('DEM') && !txt.includes('DET')) {
                        foundMatch = true;
                        var cells = r.querySelectorAll('td');
                        if (cells.length >= 10) {
                            var rowArr = [];
                            cells.forEach(c => rowArr.push(c.innerText.trim()));
                            data.push(rowArr.join('|'));
                        }
                    }
                });
                if (foundMatch && data.length > 0) return data.join('\\n');
            }
            var fs = win.frames;
            for (var i = 0; i < fs.length; i++) {
                var res = getGrid(fs[i]);
                if (res) return res;
            }
        } catch(e) { return null; }
        return null;
    }
    return getGrid(window);
    """
    try: return driver.execute_script(script, search_no)
    except: return None

def login_and_prepare(u_id, u_pw, log_callback=None):
    """ETRANS 로그인 후 컨테이너 이동현황 메뉴 진입. 성공 시 (driver, None), 실패 시 (None, 오류메시지).
    log_callback(msg) 호출 시 단계별 로그 전달(진행시간 포함)."""
    def _log(msg, elapsed=None):
        if log_callback is not None:
            log_callback(f"{msg} ({elapsed}초)" if elapsed is not None else msg)
    start = time.time()
    if log_callback is not None:
        log_callback("로그인중 (0초)")
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    if os.environ.get("CHROME_BIN"):
        options.binary_location = os.environ["CHROME_BIN"]
    service = Service(os.environ["CHROME_DRIVER_BIN"]) if os.environ.get("CHROME_DRIVER_BIN") else Service(ChromeDriverManager().install())
    driver = None
    try:
        driver = webdriver.Chrome(service=service, options=options)
        driver.get("https://etrans.klnet.co.kr/index.do")
        # 로그인 폼 로드 대기(NAS 느림 고려하여 15 -> 25초로 연장)
        WebDriverWait(driver, 25).until(
            EC.presence_of_element_located((By.ID, "mf_wfm_subContainer_ibx_userId"))
        )
        
        # [안정성 강화] 입력 씹힘 방지: 클릭 -> 초기화 -> 대기 -> 입력
        u_elem = driver.find_element(By.ID, "mf_wfm_subContainer_ibx_userId")
        u_elem.click()
        u_elem.clear()
        time.sleep(0.5)
        u_elem.send_keys(u_id)
        
        p_elem = driver.find_element(By.ID, "mf_wfm_subContainer_sct_password")
        p_elem.click()
        p_elem.clear()
        time.sleep(0.5)
        p_elem.send_keys(u_pw)
        time.sleep(0.5)
        
        p_elem.send_keys(Keys.ENTER)
        
        # 로그인 처리 대기: PC용 잘 되던 값 8초 (NAS 등에서 세션 반영 느릴 수 있음)
        time.sleep(10) # 8초 -> 10초로 약간 더 여유 둠
        _log("로그인 완료", elapsed=int(round(time.time() - start)))
        _log("컨테이너 이동현황 페이지로 이동중")
        menu_start = time.time()
        if open_els_menu(driver):
            _log("이동완료", elapsed=int(round(time.time() - menu_start)))
            _log("조회시작")
            return (driver, None)
        if driver:
            driver.quit()
        _log("이동 실패")
        return (None, "메뉴(컨테이너 이동현황)를 찾을 수 없습니다. 아이디/비밀번호 또는 ETRANS 접속 상태를 확인하세요.")
    except Exception as e:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        err_msg = str(e).strip() or "알 수 없는 오류"
        if "timeout" in err_msg.lower() or "타임아웃" in err_msg:
            return (None, "페이지 로드 타임아웃. ETRANS(etrans.klnet.co.kr) 접속이 느리거나 불가합니다.")
        if "chromedriver" in err_msg.lower() or "chrome" in err_msg.lower():
            return (None, "Chrome/Chromium 실행 오류. NAS Docker에 Chrome이 설치되어 있는지 확인하세요.")
        return (None, f"[오류] {err_msg[:200]}")

def main():
    config = load_config()
    print("--- ELS HYPER TURBO ( Eagle-Eye & Silent ) ---")
    u_id = input(f"아이디 [{config['user_id']}]: ") or config['user_id']
    u_pw = input(f"비밀번호 [{config['user_pw']}]: ") or config['user_pw']
    save_config(u_id, u_pw)

    driver, last_login = None, 0
    while True:
        cmd = input("\n[1] 조회시작 [2] 종료 : ")
        if cmd == '2': break
        if cmd != '1': continue

        if driver is None or (time.time() - last_login) > (58 * 60):
            if driver: driver.quit()
            print("엔진 예열 및 로그인 중...")
            result = login_and_prepare(u_id, u_pw)
            driver = result[0] if isinstance(result, tuple) and result else (result if result else None)
            if isinstance(result, tuple) and len(result) > 1 and result[1]:
                print(result[1])
            last_login = time.time()
            if not driver: print("로그인 실패!"); continue

        try:
            df_in = pd.read_excel("container_list.xlsx")
            c_list = df_in.iloc[2:, 0].dropna().tolist()
        except Exception as e:
            print(f"엑셀 에러: {e}"); continue

        final_rows = []
        headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]

        for cn_raw in c_list:
            cn = str(cn_raw).strip().upper()
            print(f"[{cn}] 분석 중...", end=" ", flush=True)
            unit_start = time.time()
            
            status = solve_input_and_search(driver, cn)
            if isinstance(status, str) and "오류" in status:
                dur = time.time() - unit_start
                print(f"패스 ({status}) [{dur:.2f}s]")
                final_rows.append([cn, "ERROR", status] + [""] * 12); continue
            
            grid_text = None
            for _ in range(120): # 0.05초 주기로 고속 수색
                grid_text = scrape_hyper_verify(driver, cn)
                if grid_text: break
                time.sleep(0.05) 
            
            dur = time.time() - unit_start
            if grid_text:
                for line in grid_text.split('\n'):
                    final_rows.append([cn] + line.split('|'))
                print(f"성공! [{dur:.2f}s]")
            else:
                print(f"불일치/내역없음 [{dur:.2f}s]")
                final_rows.append([cn, "NODATA", "데이터 없음"] + [""] * 12)

        if final_rows:
            now = datetime.datetime.now().strftime("%m%d_%H%M")
            fname = f"els_hyper_{now}.xlsx"
            df_out = pd.DataFrame(final_rows)
            df_out.columns = headers[:df_out.shape[1]]
            with pd.ExcelWriter(fname, engine='openpyxl') as writer:
                # 시트1: 요약(No1), 시트2: 전체
                df_out[df_out['No'].astype(str) == '1'].to_excel(writer, sheet_name='Sheet1', index=False)
                df_out.to_excel(writer, sheet_name='Sheet2', index=False)
                
                red, blue, err = PatternFill(start_color='FFC7CE', end_color='FFC7CE', fill_type='solid'), PatternFill(start_color='CCE5FF', end_color='CCE5FF', fill_type='solid'), PatternFill(start_color='FF0000', end_color='FF0000', fill_type='solid')
                for sn in ['Sheet1', 'Sheet2']:
                    ws = writer.sheets[sn]
                    for r in ws.iter_rows(min_row=2):
                        if r[2].value == "수입": r[2].fill = red
                        if r[3].value == "반입": r[3].fill = blue
                        if str(r[1].value) in ["ERROR", "NODATA"]: r[1].fill = err
            print(f"\n파일 생성 완료: {fname}")
            # [요청사항] 팝업 메시지 박스 삭제

    if driver: driver.quit()

if __name__ == "__main__": main()