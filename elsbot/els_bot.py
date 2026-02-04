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

def open_els_menu(driver, log_callback=None):
    """로그인 후 컨테이너 이동현황 메뉴 클릭. NAS 등 느린 환경을 위해 대기 여유 확보."""
    if log_callback: log_callback("메뉴 진입 시도 중...")
    else: print("메뉴 진입 중...")

    for attempt in range(20):
        if log_callback and attempt > 0: log_callback(f"메뉴 진입 시도 {attempt+1}/20...")
        check_alert(driver)
        driver.switch_to.default_content() # 항상 최상위에서 시작
        frames = driver.find_elements(By.TAG_NAME, "iframe")

        # 메인 프레임과 모든 하위 프레임 순회
        for frame in [None] + frames:
            try:
                if frame:
                    driver.switch_to.frame(frame)
                
                # '컨테이너 이동현황' 메뉴 아이템 검색
                targets = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                if targets:
                    driver.execute_script("arguments[0].click();", targets[0])
                    if log_callback: log_callback("메뉴 클릭함. 입력창 로드 대기 중... (최대 30초)")
                    
                    # 입력창이 나타날 때까지 대기
                    wait_start = time.time()
                    while time.time() - wait_start < 30:
                        driver.switch_to.default_content()
                        all_frames_for_input = [None] + driver.find_elements(By.TAG_NAME, "iframe")
                        found_input = None

                        for input_frame in all_frames_for_input:
                            try:
                                if input_frame:
                                    driver.switch_to.frame(input_frame)
                                # '컨테이너번호' 입력창 라벨을 기준으로 검색
                                labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]")
                                for lbl in labels:
                                    if "조회" in lbl.text: continue
                                    # 라벨 주변의 input 태그 검색
                                    inputs = lbl.find_elements(By.XPATH, "./following-sibling::input") or \
                                             lbl.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
                                    if inputs:
                                        found_input = inputs[0]
                                        break
                                if found_input: break
                            except:
                                driver.switch_to.default_content()
                                continue # 프레임 전환 실패시 다음 프레임으로
                        
                        if found_input:
                            if log_callback: log_callback("입력창 발견! 메뉴 진입 성공.")
                            return True
                        
                        time.sleep(0.5) # 0.5초 간격으로 재시도

                    # 30초 타임아웃
                    if log_callback: log_callback("30초 내 입력창을 못 찾았습니다.")
                    return False

            except Exception:
                # 메뉴 클릭 과정에서 에러 발생 시 다음 프레임/시도에서 계속
                pass
            finally:
                # 다음 프레임 시도를 위해 항상 기본 컨텐츠로 복귀
                driver.switch_to.default_content()

        time.sleep(1) # 전체 프레임 순회 후 1초 대기

    if log_callback: log_callback("메뉴 진입 실패 (타임아웃)")
    return False

def solve_input_and_search(driver, container_no):
    """하이퍼 터보 입력 및 팝업 감시"""
    check_alert(driver)
    
    def _is_valid_input_simple(element):
        """날짜 필드 등 잘못된 입력창인지 검사"""
        try:
            eid = (element.get_attribute('id') or "").lower()
            ename = (element.get_attribute('name') or "").lower()
            etype = (element.get_attribute('type') or "").lower()
            eclass = (element.get_attribute('class') or "").lower()
            val = element.get_attribute('value')
            
            # 특수 규칙: ID에 'containerno'가 포함되면 무조건 통과
            if 'containerno' in eid or 'container_no' in eid: return True

            # 1. 날짜 관련 속성 체크
            if any(x in eid or x in ename or x in eclass for x in ['date', 'ymd', 'from', 'to', 'cal']): return False
            
            # 2. 값이 날짜 형식인지 체크
            if val and len(val) >= 8 and ('-' in val or '/' in val or val.isdigit()):
                if val.count('-') == 2 or val.count('/') == 2: return False
            
            # 3. Hidden 제외
            if etype in ['hidden', 'button', 'image', 'submit']: return False
            
            return True
        except: return False

    found_target = None
    
    # 1. 메인 컨텐츠에서 검색
    driver.switch_to.default_content()
    try:
        labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]" )
        for label in labels:
            if "조회" in label.text: continue
            
            inputs = label.find_elements(By.XPATH, "./following-sibling::input")
            if not inputs: inputs = label.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
            if not inputs: inputs = label.find_elements(By.XPATH, "./following::input")
                
            for inp in inputs[:3]:
                if inp.is_displayed() and _is_valid_input_simple(inp):
                    found_target = inp
                    break
                # ID 매칭 시도 (가시성 무시)
                try:
                    eid = (inp.get_attribute('id') or "").lower()
                    if ('containerno' in eid or 'container_no' in eid) and _is_valid_input_simple(inp):
                        found_target = inp
                        break
                except: pass
            if found_target: break
    except: pass
    
    # 2. 프레임 순회 검색
    if not found_target:
        driver.switch_to.default_content()
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in frames:
            try:
                driver.switch_to.frame(frame)
                labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]" )
                for label in labels:
                    if "조회" in label.text: continue
                    
                    inputs = label.find_elements(By.XPATH, "./following-sibling::input")
                    if not inputs: inputs = label.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
                    if not inputs: inputs = label.find_elements(By.XPATH, "./following::input")

                    for inp in inputs[:3]:
                        if inp.is_displayed() and _is_valid_input_simple(inp):
                            found_target = inp
                            break
                        try:
                            eid = (inp.get_attribute('id') or "").lower()
                            if ('containerno' in eid or 'container_no' in eid) and _is_valid_input_simple(inp):
                                found_target = inp
                                break
                        except: pass
                    if found_target: break
                
                # 백업 선택자
                if not found_target:
                    input_selectors = [("CSS", "input[id*='ontainer']"), ("CSS", "input[name*='ontainer']")]
                    for s_type, s_val in input_selectors:
                        if s_type == "CSS": els = driver.find_elements(By.CSS_SELECTOR, s_val)
                        else: els = driver.find_elements(By.XPATH, s_val)
                        for el in els:
                            if _is_valid_input_simple(el):
                                if el.is_displayed():
                                    found_target = el
                                    break
                                # ID 매칭
                                try:
                                    eid = (el.get_attribute('id') or "").lower()
                                    if 'containerno' in eid or 'container_no' in eid:
                                        found_target = el
                                        break
                                except: pass
                        if found_target: break

                if found_target: break
            except: continue
            if not found_target: driver.switch_to.default_content()

    # 입력 및 조회 수행
    if found_target:
        try:
            # 가시성이 없으면 강제로 보이게 처리 (JS)
            if not found_target.is_displayed():
                if log_callback: log_callback("입력창 Hidden 상태 -> JS 입력 시도")
                driver.execute_script("arguments[0].value = arguments[1];", found_target, container_no)
            else:
                found_target.click()
                time.sleep(0.1)
                found_target.send_keys(Keys.CONTROL + "a"); found_target.send_keys(Keys.DELETE)
                found_target.send_keys(container_no)
            
            time.sleep(0.1)
            found_target.send_keys(Keys.ENTER)
            time.sleep(1)
            found_target.send_keys(Keys.F5)
            time.sleep(1)
            
            # 조회 버튼 클릭 시도
            try:
                search_btns = driver.find_elements(By.XPATH, "//*[contains(text(),'조회') or contains(@id, 'btn_search') or contains(@id, 'Search')]" )
                for btn in search_btns:
                    if btn.is_displayed() and btn.tag_name in ['a', 'button', 'input', 'div', 'span', 'img']:
                        bid = (btn.get_attribute('id') or "").lower()
                        bclass = (btn.get_attribute('class') or "").lower()
                        if 'cal' in bid or 'date' in bid or 'cal' in bclass: continue
                        btn.click()
                        break
            except: pass

            # [수정] 조회 후 3초 강제 대기
            time.sleep(3)

            for _ in range(20):
                msg = check_alert(driver)
                if msg: return f"오류: {msg}"
                time.sleep(0.03)
            return "조회시도완료" # 성공 시 True 대신 상태 문자열 반환 (호출부 호환성)
        except Exception as e:
            return f"입력/조회 중 에러: {e}"
            
    return "입력창을 찾을 수 없습니다."

def scrape_hyper_verify(driver, search_no):
    # 역슬래시 두 개(\\) 써야 자바스크립트가 알아먹는다!
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
    except Exception as e:
        print(f"JS 실행 중 오류: {e}")
        return None

def login_and_prepare(u_id, u_pw, log_callback=None):
    """ETRANS 로그인 후 컨테이너 이동현황 메뉴 진입. 성공 시 (driver, None), 실패 시 (None, 오류메시지)."""
    start_time = time.time()
    
    def _log(msg):
        elapsed = time.time() - start_time
        debug_msg = f"[{elapsed:6.2f}s] {msg}"
        if log_callback is not None:
            log_callback(debug_msg)
        else:
            print(debug_msg, flush=True)

    _log(f"로그인 프로세스 시작 (ID: {u_id})")
    
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    # [추가] BOT 탐지 회피
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    if os.environ.get("CHROME_BIN"):
        options.binary_location = os.environ["CHROME_BIN"]
    
    _log("크롬 드라이버 로드 중...")
    try:
        service_obj = Service(os.environ["CHROME_DRIVER_BIN"]) if os.environ.get("CHROME_DRIVER_BIN") else Service(ChromeDriverManager().install())
    except Exception as e:
        _log(f"드라이버 설치/찾기 실패: {e}")
        return (None, f"드라이버 오류: {e}")

    driver = None
    try:
        _log("브라우저 실행 시도...")
        driver = webdriver.Chrome(service=service_obj, options=options)
        _log("브라우저 실행 완료. 사이트 접속 시도...")
        
        driver.set_page_load_timeout(60) # 페이지 로드 타임아웃 설정
        driver.get("https://etrans.klnet.co.kr/index.do")
        _log("사이트 접속 명령 전송 완료. 로딩 대기 중...")
        
        # [수정] 무조건 2초 대기 -> 요소가 나올 때까지 최대 60초 대기 (NAS 성능 고려)
        try:
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.ID, "mf_wfm_subContainer_ibx_userId"))
            )
            _log("로그인 화면(아이디 입력창) 감지됨.")
        except Exception as e:
            _log(f"로그인 화면 로드 실패 (60초 초과). 현재 URL: {driver.current_url}")
            raise e
        
        # [수정] 입력 씹힘 방지: 클릭 -> 초기화 -> 대기 -> 입력
        time.sleep(0.5)
        uid_input = driver.find_element(By.ID, "mf_wfm_subContainer_ibx_userId")
        uid_input.click()
        uid_input.clear()
        uid_input.send_keys(u_id)
        
        pw_input = driver.find_element(By.ID, "mf_wfm_subContainer_sct_password")
        pw_input.click()
        pw_input.clear()
        pw_input.send_keys(u_pw)
        
        _log("아이디/비밀번호 입력 완료. 로그인 요청...")
        
        # [수정] Keys.ENTER 대신 로그인 버튼을 직접 클릭
        try:
            _log("로그인 버튼 검색 및 클릭 시도...")
            # Login 버튼의 XPath 또는 다른 선택자를 여기에 맞게 조정해야 할 수 있습니다.
            login_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//*[(@type='button' or @type='submit' or @role='button') and (contains(text(), '로그인') or contains(text(), 'Login'))] | //*[@id='mf_wfm_subContainer_btn_login']"))
            )
            # 일반 .click()이 안될 경우를 대비해 Javascript 클릭을 사용
            driver.execute_script("arguments[0].click();", login_button)
            _log("로그인 버튼 클릭 완료.")
        except Exception as e:
            _log(f"로그인 버튼 클릭 실패. 비상 수단으로 Enter 키 입력 시도. 에러: {e}")
            pw_input.send_keys(Keys.ENTER)
        
        # [수정] 로그인 처리 대기: 타임아웃 방지를 위해 1초마다 로그 출력 (수동 대기)
        # 리버스 프록시(Nginx)가 60초 이상 데이터 전송이 없으면 끊어버리므로, 계속 떠들어줘야 함.
        _log("⏳ 로그인 결과 확인 중... (최대 120초)")
        
        try:
            # 로그인 성공의 증거로 '컨테이너 이동현황' 메뉴가 나타날 때까지 최대 60초 대기
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]"))
            )
            _log("로그인 성공 (메인 메뉴 확인)")
        except Exception:
            _log("⚠️ 로그인 후 메인 메뉴 확인 실패 (60초 초과). 그래도 진행 시도.")
        
        _log("컨테이너 이동현황 페이지로 이동 시도")
        
        menu_start = time.time()
        # open_els_menu에도 log_callback 전달 (경과시간은 거기서 따로 찍힘, 여기서 래핑 필요할 수도 있지만 일단 전달)
        # -> open_els_menu는 내부적으로 메시지만 찍으므로, 여기 _log를 전달하면 포맷이 이중으로 될 수 있음.
        # open_els_menu는 그대로 두고, 여기서 결과만 받음.
        # 하지만 open_els_menu 내부 로그도 보고 싶으므로 _log를 전달하되, _log 함수가 이미 포맷팅을 하므로
        # open_els_menu가 보내는 날것의 메시지를 _log가 받아서 [시간]을 붙여줌.
        
        if open_els_menu(driver, log_callback=_log):
            _log("이동 완료 및 조회 준비 끝")
            return (driver, None)
            
        if driver: driver.quit()
        _log("메뉴 이동 실패")
        return (None, "로그인은 된 것 같으나 메뉴(컨테이너 이동현황) 진입에 실패했습니다.")
        
    except Exception as e:
        if driver:
            try: driver.quit()
            except: pass
        err_msg = str(e)
        _log(f"치명적 오류 발생: {err_msg}")
        if "TimeOut" in err_msg or "Timed out" in err_msg:
            return (None, f"시간 초과 오류 ({time.time()-start_time:.1f}초 경과). NAS 성능 문제일 수 있습니다.")
        return (None, f"[시스템 에러] {err_msg[:100]}")

def main():
    config = load_config()
    print("--- ELS HYPER TURBO ( Eagle-Eye & Silent ) ---")
    u_id = config['user_id']
    u_pw = config['user_pw']
    # save_config(u_id, u_pw) # Docker 환경에서는 설정 저장이 의미 없을 수 있으므로 주석 처리

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
            df_in = pd.read_excel("elsbot/container_list.xlsx")
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
            
            grid_text = scrape_hyper_verify(driver, cn)
            
            dur = time.time() - unit_start
            if grid_text:
                import re
                found_any = False
                blacklist = ["SKR", "YML", "ZIM", "2021-04-12", "최병훈", "안녕하세요", "로그아웃", "운송관리", "조회"]
                lines = grid_text.split('\n')
                
                for line in lines:
                    stripped_line = line.strip()
                    
                    if not stripped_line or any(keyword in stripped_line for keyword in blacklist):
                        continue

                    row_data = re.split(r'\t|\s{2,}', stripped_line)
                    
                    if not row_data or not row_data[0].isdigit() or not (1 <= int(row_data[0]) <= 15):
                        continue

                    expected_data_cols = len(headers) - 1
                    if len(row_data) < expected_data_cols:
                        row_data.extend([''] * (expected_data_cols - len(row_data)))
                    elif len(row_data) > expected_data_cols:
                        row_data = row_data[:expected_data_cols]
                    
                    final_rows.append([cn] + row_data)
                    found_any = True
                
                if found_any:
                    print(f"성공! (정제된 데이터) [{dur:.2f}s]")
                else:
                    print(f"데이터는 찾았으나 유효한 행 없음 [{dur:.2f}s]")
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
