import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
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

def save_config(user_id, user_pw):
    with open(CONFIG_FILE, "w") as f: json.dump({"user_id": user_id, "user_pw": user_pw}, f)

def check_alert(driver):
    try:
        alert = driver.switch_to.alert
        txt = alert.text
        alert.accept()
        return txt
    except: return None

def close_modals(driver):
    """이트랜스 공지사항 등 모달 창 닫기"""
    try:
        driver.switch_to.default_content()
        # ID가 _modal이거나 클래스에 modal_popup이 포함된 요소 찾기
        modals = driver.find_elements(By.XPATH, "//*[contains(@id, '_modal') or contains(@class, 'w2modal_popup')]")
        for m in modals:
            if m.is_displayed():
                # 닫기 버튼(X)이나 확인 버튼 찾아서 클릭 시도
                close_btns = m.find_elements(By.XPATH, ".//*[contains(text(),'닫기') or contains(text(),'확인') or contains(@class, 'close')]")
                if close_btns:
                    driver.execute_script("arguments[0].click();", close_btns[0])
                else:
                    # 버튼을 못 찾으면 display: none으로 강제 제거
                    driver.execute_script("arguments[0].style.display = 'none';", m)
        
        # 가림막(overlay) 제거
        overlays = driver.find_elements(By.CLASS_NAME, "w2modal_lay")
        for ov in overlays:
            driver.execute_script("arguments[0].style.display = 'none';", ov)
    except:
        pass

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
    
    # [추가] 로그인 후 나타날 수 있는 차단 페이지(비번변경 등) 처리
    def _check_and_clear_interrupts():
        page_text = driver.page_source or ""
        curr_url = driver.current_url or ""
        
        # 🎯 진짜 방해되는 페이지 키워드 (공지사항은 제외)
        interrupt_keywords = ["비밀번호변경", "개인정보", "IP사용통제", "비밀번호를 변경", "사용자 정보 수정", "로그인 제한"]
        
        if any(kw in page_text.replace(" ", "") for kw in interrupt_keywords):
            if log_callback: log_callback(f"진짜 방해 요소 탐지! 제거 시도... ({curr_url})")
            
            # 모든 프레임 순회하며 닫기/다음에 관련 버튼 찌르기
            for f in [None] + driver.find_elements(By.TAG_NAME, "iframe"):
                try:
                    if f: driver.switch_to.frame(f)
                    close_keywords = ["다음에 하기", "나중에 변경", "닫기", "종료", "Close", "X", "취소"]
                    for kw in close_keywords:
                        btns = driver.find_elements(By.XPATH, f"//*[contains(text(), '{kw}') or contains(@aria-label, '{kw}')]")
                        for btn in btns:
                            if btn.is_displayed():
                                driver.execute_script("arguments[0].click();", btn)
                                if log_callback: log_callback(f"'{kw}' 버튼 클릭 성공!")
                                time.sleep(1)
                except: pass
                finally: driver.switch_to.default_content()

            # WebSquare 전용 모달 강제 파괴/숨김
            try:
                driver.execute_script("""
                    document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => e.style.display = 'none');
                    document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
                """)
            except: pass

    for attempt in range(20):
        check_alert(driver)
        close_modals(driver)
        _check_and_clear_interrupts()
        
        # 🎯 [성공 판정 보강] 현재 페이지에 이미 컨테이너 입력창이 있다면 즉시 성공!
        try:
            page_text = driver.page_source or ""
            if any(kw in page_text for kw in ["컨테이너번호", "Container No", "컨테이너 번호"]):
                if log_callback: log_callback("조회 페이지 요소 감지! 진입 성공 판정.")
                return True
        except: pass

        # 🎯 5번 이상 실패하면 직접 URL로 이동 시도
        if attempt == 5:
            if log_callback: log_callback("메뉴 클릭대신 직접 URL(컨테이너이동현황)로 이동 시도...")
            driver.get("https://etrans.klnet.co.kr/main/index.do?menuId=002001007")
            time.sleep(5)

        # iframe 순회
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in [None] + frames:
            try:
                if frame:
                    driver.switch_to.frame(frame)
                
                # 메뉴 찾기 (더 넓은 범위 탐색)
                menu_selectors = [
                    "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]",
                    "//a[contains(., '컨테이너') and contains(., '이동현황')]",
                    "//span[contains(., '컨테이너') and contains(., '이동현황')]",
                    "//*[contains(@title, '이동현황')]"
                ]
                
                for xpath in menu_selectors:
                    targets = driver.find_elements(By.XPATH, xpath)
                    if targets:
                        driver.execute_script("arguments[0].click();", targets[0])
                        if log_callback: log_callback("메뉴 클릭 성공!")
                        time.sleep(4)
                        return True
            except:
                pass
            finally:
                driver.switch_to.default_content()
        
        # 10번 이후부턴 50% 확률로 인덱스 재갱신
        if attempt > 10 and attempt % 5 == 0:
            driver.get("https://etrans.klnet.co.kr/index.do")
            time.sleep(5)

        time.sleep(1.5)
    
    # 최종 실패 시 상세 정보 수집
    if log_callback:
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text[:300].replace("\n", " ")
            log_callback(f"최종 실패! URL: {driver.current_url}")
            log_callback(f"페이지 텍스트: {body_text}")
        except: pass
    
    return False

def solve_input_and_search(driver, container_no, log_callback=None):
    """[수정 완료] driver를 직접 사용하여 NameError 방지"""
    check_alert(driver)
    close_modals(driver)
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
            # [추가] 실제로 값이 들어갔는지 한 번 더 확인
            val_after = found_target.get_attribute('value')
            if val_after != container_no:
                found_target.click()
                found_target.send_keys(Keys.CONTROL + "a"); found_target.send_keys(Keys.DELETE)
                found_target.send_keys(container_no)
                time.sleep(0.5)

            # 조회 버튼 강제 클릭 (더 다양하게 시도)
            time.sleep(1)
            # '조회' 글자가 포함된 모든 요소 중 클릭 가능한 것 찾기
            search_btns = driver.find_elements(By.XPATH, "//*[contains(text(),'조회') or contains(@id, 'btn_search') or contains(@class, 'search')]")
            clicked = False
            for btn in search_btns:
                try:
                    if btn.is_displayed() and btn.is_enabled():
                        # 가끔 일반 click()이 안 먹힐 때가 있어서 script로도 시도
                        driver.execute_script("arguments[0].click();", btn)
                        clicked = True
                        break
                except: continue
            
            # 버튼이 안 눌렸으면 엔터 한 번 더
            if not clicked:
                found_target.send_keys(Keys.ENTER)
                time.sleep(0.5)
            
            # [수정] 15건 조회로 확정
            # 데이터 로딩 대기 (충분히)
            time.sleep(4.5)
            
            # 결과가 정말 나왔는지 간이 체크
            page_text = driver.page_source
            if "데이터가 없습니다" in page_text or "내역이 없습니다" in page_text:
                return "내역없음확인"
            
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
        
        # Enter 키로 로그인 (안정 커밋 방식)
        pw_input.send_keys(Keys.ENTER)
        
        _log("로그인 시도 중...")
        
        # 로그인 처리 대기 (이전 코드: 8초)
        time.sleep(8)
        
        # 모달 닫기 시도
        close_modals(driver)
        
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
                    if row_data and row_data[0].isdigit():
                        no_val = int(row_data[0])
                        # 0은 메타데이터(0건 등)일 확률이 높으므로 1 이상만 데이터로 취합
                        if 1 <= no_val <= 200:
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
        
        if args.containers:
            try:
                c_list = json.loads(args.containers)
            except:
                # 콤마 분리 방식 지원 (CLI 편의성)
                c_list = [x.strip() for x in args.containers.split(',') if x.strip()]
        else:
            c_list = []
        u_id = args.user_id if args.user_id else load_config().get('user_id')
        u_pw = args.user_pw if args.user_pw else load_config().get('user_pw')
        
        final_res = run_els_process(u_id, u_pw, c_list, log_callback=lambda x: print(f"LOG:{x}", flush=True))
        print(f"RESULT:{json.dumps(final_res, ensure_ascii=False)}", flush=True)
    else:
        cli_main()