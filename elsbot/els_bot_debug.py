"""
ELS Bot Debug Version - 로컬 테스트용
Headless 비활성화, 스크린샷 저장, 상세 로깅 기능 추가
"""
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
import random
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

def save_screenshot(driver, name="debug"):
    """디버그용 스크린샷 저장"""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"debug_screenshot_{name}_{timestamp}.png"
    try:
        driver.save_screenshot(filename)
        print(f"📸 스크린샷 저장: {filename}")
        return filename
    except Exception as e:
        print(f"스크린샷 저장 실패: {e}")
        return None

def open_els_menu(driver, log_callback=None, debug=True):
    """로그인 후 컨테이너 이동현황 메뉴 클릭"""
    if log_callback: log_callback("메뉴 진입 시도 중...")
    else: print("메뉴 진입 중...")
    
    if debug:
        save_screenshot(driver, "before_menu_search")
    
    for attempt in range(20):
        if log_callback and attempt > 0: log_callback(f"메뉴 진입 시도 {attempt+1}/20...")
        elif attempt > 0: print(f"메뉴 진입 시도 {attempt+1}/20...")
        
        check_alert(driver)
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        
        if debug and attempt == 0:
            print(f"🔍 발견된 iframe 개수: {len(frames)}")
        
        for frame in [None] + frames:
            try:
                if frame:
                    driver.switch_to.frame(frame)
                target = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                if target:
                    if debug:
                        print(f"✅ 메뉴 발견! 클릭 시도...")
                        save_screenshot(driver, "menu_found")
                    driver.execute_script("arguments[0].click();", target[0])
                    time.sleep(2)
                    
                    # 조회 입력창 로드 대기: 다양한 선택자 시도 + 디버깅
                    for wait_idx in range(20):
                        if log_callback and wait_idx % 5 == 0: log_callback(f"입력창 로딩 대기 {wait_idx}...")
                        elif debug and wait_idx % 5 == 0: print(f"입력창 로딩 대기 {wait_idx}...")
                        
                        driver.switch_to.default_content()
                        # 프레임 재탐색
                        current_frames = driver.find_elements(By.TAG_NAME, "iframe")
                        
                        found_input = None
                        
                        # 1. 메인 컨텐츠에서 검색
                        try:
                            # 레이블 기반 검색 (강력함)
                            labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호')]")
                            if labels:
                                print(f"📝 '컨테이너번호' 텍스트 발견! (메인 프레임)")
                                # 근처 input 찾기
                                inputs = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호')]/following::input[1]")
                                if inputs:
                                    found_input = inputs[0]
                                    print(f"✅ 레이블 기반 입력창 발견! ID: {found_input.get_attribute('id')}")
                        except: pass

                        if not found_input:
                            for idx, f in enumerate(current_frames):
                                try:
                                    driver.switch_to.frame(f)
                                    
                                    # 프레임 내부 진단 (첫 시도에서만)
                                    if wait_idx == 0: 
                                        print(f"--- Frame {idx} 분석 ---")
                                        body_text = driver.find_element(By.TAG_NAME, "body").text[:100].replace('\n', ' ')
                                        print(f"내용 요약: {body_text}")
                                        all_inputs = driver.find_elements(By.TAG_NAME, "input")
                                        print(f"Input 개수: {len(all_inputs)}")
                                        for inp in all_inputs:
                                            try:
                                                print(f"  - Input: id='{inp.get_attribute('id')}', name='{inp.get_attribute('name')}', type='{inp.get_attribute('type')}'")
                                            except: pass
                                    
                                    # 레이블 기반 검색
                                    labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]")
                                    if labels:
                                        print(f"📝 '컨테이너번호' 텍스트 발견! (Frame {idx})")
                                        inputs = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]/following::input[1]")
                                        if inputs:
                                            found_input = inputs[0]
                                            print(f"✅ 레이블 기반 입력창 발견! ID: {found_input.get_attribute('id')}")
                                            break

                                    # 기존 선택자 시도
                                    input_selectors = [
                                        ("CSS", "input[id*='containerNo']"),
                                        ("CSS", "input[id*='ContainerNo']"),
                                        ("CSS", "input[name*='containerNo']"),
                                        ("CSS", "input[name*='ContainerNo']"),
                                        ("XPATH", "//input[contains(@id, 'container')]"), 
                                    ]
                                    
                                    for selector_type, selector in input_selectors:
                                        try:
                                            if selector_type == "CSS": elements = driver.find_elements(By.CSS_SELECTOR, selector)
                                            else: elements = driver.find_elements(By.XPATH, selector)
                                            
                                            if elements:
                                                found_input = elements[0]
                                                print(f"✅ 입력창 발견! 선택자: {selector}")
                                                break
                                        except: continue
                                    
                                    if found_input: break
                                        
                                except Exception as e:
                                    # print(f"Frame {idx} 접근 오류: {e}")
                                    pass
                                finally:
                                    driver.switch_to.default_content()
                        
                        if found_input:
                            if log_callback: log_callback("입력창 발견!")
                            return True
                            
                        time.sleep(0.5)
                    driver.switch_to.default_content()
            except Exception as e:
                if debug:
                    print(f"⚠️ 프레임 탐색 중 오류: {e}")
                continue
            finally:
                driver.switch_to.default_content()
        time.sleep(0.3)
    
    if debug:
        save_screenshot(driver, "menu_search_failed")
    if log_callback: log_callback("메뉴 진입 실패 (타임아웃)")
    return False



def login_and_prepare(u_id, u_pw, log_callback=None, headless=False, debug=True):
    """ETRANS 로그인 후 컨테이너 이동현황 메뉴 진입"""
    def _log(msg, elapsed=None):
        if log_callback is not None:
            log_callback(f"{msg} ({elapsed}초)" if elapsed is not None else msg)
        else:
            print(f"{msg} ({elapsed}초)" if elapsed is not None else msg)
    
    start = time.time()
    _log("로그인 시도 중...")
    
    options = webdriver.ChromeOptions()
    
    # 디버그 모드: headless 옵션 제어 가능
    if headless:
        options.add_argument("--headless")
        _log("🔧 Headless 모드로 실행")
    else:
        _log("🔧 일반 모드로 실행 (브라우저 창 표시)")
    
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    
    # BOT 감지 회피 강화
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    # User-Agent 최신 버전으로 업데이트
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
    
    if os.environ.get("CHROME_BIN"):
        options.binary_location = os.environ["CHROME_BIN"]
    service = Service(os.environ["CHROME_DRIVER_BIN"]) if os.environ.get("CHROME_DRIVER_BIN") else Service(ChromeDriverManager().install())
    
    driver = None
    try:
        driver = webdriver.Chrome(service=service, options=options)
        
        # webdriver 속성 제거 (BOT 감지 회피)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        _log("🌐 ETRANS 사이트 접속 중...")
        driver.get("https://etrans.klnet.co.kr/index.do")
        
        if debug:
            save_screenshot(driver, "01_initial_load")
        
        # 요소가 나올 때까지 최대 30초 대기
        _log("⏳ 로그인 폼 로딩 대기 중...")
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "mf_wfm_subContainer_ibx_userId"))
        )
        
        if debug:
            save_screenshot(driver, "02_login_form_loaded")
        
        # 랜덤 딜레이 (BOT 감지 회피)
        random_delay = random.uniform(0.5, 1.0)
        _log(f"🎲 랜덤 딜레이: {random_delay:.2f}초")
        time.sleep(random_delay)
        
        # 아이디 입력
        _log(f"📝 아이디 입력: {u_id}")
        uid_input = driver.find_element(By.ID, "mf_wfm_subContainer_ibx_userId")
        uid_input.click()
        time.sleep(0.3)
        uid_input.clear()
        time.sleep(0.2)
        uid_input.send_keys(u_id)
        
        if debug:
            save_screenshot(driver, "03_id_entered")
        
        # 비밀번호 입력
        _log("🔑 비밀번호 입력 중...")
        pw_input = driver.find_element(By.ID, "mf_wfm_subContainer_sct_password")
        pw_input.click()
        time.sleep(0.3)
        pw_input.clear()
        time.sleep(0.2)
        pw_input.send_keys(u_pw)
        
        if debug:
            save_screenshot(driver, "04_pw_entered")
        
        # 엔터 입력 전 대기
        random_delay = random.uniform(0.5, 0.8)
        time.sleep(random_delay)
        
        _log("⏎ 로그인 버튼 클릭 (엔터)")
        pw_input.send_keys(Keys.ENTER)
        
        if debug:
            save_screenshot(driver, "05_login_submitted")
        
        # 로그인 처리 대기 (15초로 증가)
        _log("⏳ 로그인 처리 대기 중 (15초)...")
        time.sleep(15)
        
        if debug:
            save_screenshot(driver, "06_after_login")
        
        _log("로그인 완료", elapsed=int(round(time.time() - start)))
        _log("컨테이너 이동현황 페이지로 이동중")
        
        menu_start = time.time()
        if open_els_menu(driver, log_callback=_log, debug=debug):
            _log("이동완료", elapsed=int(round(time.time() - menu_start)))
            _log("조회시작")
            if debug:
                save_screenshot(driver, "07_ready_for_search")
            return (driver, None)
            
        if driver: driver.quit()
        _log("이동 실패")
        return (None, "로그인은 된 것 같으나 메뉴(컨테이너 이동현황) 진입에 실패했습니다.")
        
    except Exception as e:
        if driver:
            if debug:
                save_screenshot(driver, "error")
            try: driver.quit()
            except: pass
        err_msg = str(e)
        if "TimeOut" in err_msg or "Timed out" in err_msg:
            return (None, "사이트 접속 시간 초과 (네트워크/성능 문제). 30초 내에 입력창이 뜨지 않았습니다.")
        return (None, f"[시스템 에러] {err_msg[:200]}")

def main():
    config = load_config()
    print("=" * 60)
    print("🔧 ELS BOT - DEBUG VERSION 🔧")
    print("=" * 60)
    print("\n✅ 디버그 기능:")
    print("  - Headless OFF (브라우저 창 표시)")
    print("  - 스크린샷 자동 저장")
    print("  - 상세 로깅")
    print("\n" + "=" * 60 + "\n")
    
    u_id = input(f"아이디 [{config.get('user_id', '')}]: ") or config.get('user_id', '')
    u_pw = input(f"비밀번호 [{config.get('user_pw', '')}]: ") or config.get('user_pw', '')
    
    if not u_id or not u_pw:
        print("❌ 아이디와 비밀번호를 입력해주세요.")
        return
    
    save_config(u_id, u_pw)
    
    # Headless 모드 선택
    headless_choice = input("\nHeadless 모드 사용? (y/n) [기본: n]: ").lower()
    headless = headless_choice == 'y'
    
    print("\n" + "=" * 60)
    print("🚀 로그인 테스트 시작")
    print("=" * 60 + "\n")
    
    result = login_and_prepare(u_id, u_pw, headless=headless, debug=True)
    driver = result[0] if isinstance(result, tuple) and result else None
    error_msg = result[1] if isinstance(result, tuple) and len(result) > 1 else None
    
    if driver:
        print("\n" + "=" * 60)
        print("✅ 로그인 성공!")
        print("=" * 60)
        print("\n브라우저를 열어둡니다. 종료하려면 엔터를 누르세요...")
        input()
        driver.quit()
    else:
        print("\n" + "=" * 60)
        print("❌ 로그인 실패")
        print("=" * 60)
        if error_msg:
            print(f"\n오류 메시지: {error_msg}")
        print("\n💡 디버그 정보:")
        print("  - 저장된 스크린샷을 확인하세요")
        print("  - 파일명: debug_screenshot_*.png")

if __name__ == "__main__":
    main()
