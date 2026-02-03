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

def solve_input_and_search(driver, container_no, log_callback=None, debug=True):
    """하이퍼 터보 입력 및 팝업 감시 (els_bot.py와 동일 로직 적용)"""
    check_alert(driver)
    if log_callback: log_callback(f"컨테이너 번호 입력 시도: {container_no}")
    
    def _is_valid_input(element):
        """날짜 필드 등 잘못된 입력창인지 검사"""
        try:
            eid = (element.get_attribute('id') or "").lower()
            ename = (element.get_attribute('name') or "").lower()
            etype = (element.get_attribute('type') or "").lower()
            eclass = (element.get_attribute('class') or "").lower()
            val = element.get_attribute('value')
            is_visible = element.is_displayed()
            
            if debug:
                print(f"   🔎 검사 중: id=[{eid}], name=[{ename}], type=[{etype}], visible=[{is_visible}]")
            
            # 특수 규칙: ID에 'containerno'가 포함되면 무조건 통과 (Hidden만 아니면)
            if 'containerno' in eid or 'container_no' in eid:
                if debug: print(f"      ✨ 강력한 ID 매칭 성공! (강제 승인)")
                return True

            # 1. 날짜 관련 속성 체크
            invalid_keywords = ['date', 'ymd', 'from', 'to', 'cal']
            for kw in invalid_keywords:
                if kw in eid or kw in ename or kw in eclass:
                    if debug: print(f"      ⚠️ 날짜 키워드 '{kw}' 감지됨 (제외)")
                    return False
            
            # 2. 값이 날짜 형식인지 체크
            if val and len(val) >= 8 and ('-' in val or '/' in val or val.isdigit()):
                if val.count('-') == 2 or val.count('/') == 2:
                    if debug: print(f"      ⚠️ 날짜 값 '{val}' 감지됨 (제외)")
                    return False
            
            # 3. Hidden 및 버튼 제외
            if etype in ['hidden', 'button', 'image', 'submit']: 
                if debug: print(f"      ⚠️ 타입 '{etype}' 제외")
                return False
            
            return True
        except Exception as e:
            if debug: print(f"      ⚠️ 검사 중 에러: {e}")
            return False

    found_target = None
    
    # 1. 메인 컨텐츠에서 검색
    driver.switch_to.default_content()
    try:
        labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]")
        for label in labels:
            if "조회" in label.text: continue
            
            # 레이블 근처 input 찾기
            inputs = label.find_elements(By.XPATH, "./following-sibling::input")
            if not inputs:
                inputs = label.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
            if not inputs:
                inputs = label.find_elements(By.XPATH, "./following::input")
                
            for inp in inputs[:3]:
                # ID가 확실하면 visible 체크 생략 가능하도록 _is_valid_input 내부 로직 활용
                # 하지만 기본적으로는 visible이어야 안전함. 
                # 일단 visible 체크를 하고, 실패하면 ID 매칭으로 넘어가는 구조가 아님.
                # inp.is_displayed() and _is_valid_input(inp) 조건인데
                # ID 매칭 시 visible이 False여도 시도해볼 가치가 있음.
                
                valid = _is_valid_input(inp)
                visible = inp.is_displayed()
                
                # ID 매칭 시 visible 무시하고 시도
                eid = (inp.get_attribute('id') or "").lower()
                if ('containerno' in eid or 'container_no' in eid) and valid:
                    found_target = inp
                    break
                
                if visible and valid:
                    found_target = inp
                    break
            if found_target: break
    except: pass
    
    # 2. 프레임 순회 검색
    if not found_target:
        driver.switch_to.default_content()
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in frames:
            try:
                driver.switch_to.frame(frame)
                labels = driver.find_elements(By.XPATH, "//*[contains(text(),'컨테이너번호') or contains(text(),'Container No')]")
                for label in labels:
                    if "조회" in label.text: continue
                    
                    inputs = label.find_elements(By.XPATH, "./following-sibling::input")
                    if not inputs:
                        inputs = label.find_elements(By.XPATH, "./parent::*/following-sibling::*//input")
                    if not inputs:
                        inputs = label.find_elements(By.XPATH, "./following::input")

                    for inp in inputs[:3]:
                        valid = _is_valid_input(inp)
                        visible = inp.is_displayed()
                        eid = (inp.get_attribute('id') or "").lower()
                        
                        if ('containerno' in eid or 'container_no' in eid) and valid:
                            found_target = inp # 가시성 무시 (테스트)
                            print(f"      ✨ ID 매칭으로 선택 (Visible={visible})")
                            break
                        
                        if visible and valid:
                            found_target = inp
                            break
                    if found_target: break
                
                # 백업 선택자
                if not found_target:
                    input_selectors = [
                        ("CSS", "input[id*='ontainer']"),
                        ("CSS", "input[name*='ontainer']")
                    ]
                    for s_type, s_val in input_selectors:
                        if s_type == "CSS": els = driver.find_elements(By.CSS_SELECTOR, s_val)
                        else: els = driver.find_elements(By.XPATH, s_val)
                        
                        for el in els:
                            valid = _is_valid_input(el)
                            visible = el.is_displayed()
                            eid = (el.get_attribute('id') or "").lower()

                            if ('containerno' in eid or 'container_no' in eid) and valid:
                                found_target = el
                                print(f"      ✨ ID 매칭으로 선택 (Visible={visible})")
                                break
                            
                            if visible and valid:
                                found_target = el
                                break
                        if found_target: break

                if found_target: break
            except: continue
            if not found_target: driver.switch_to.default_content()

    # 입력 및 조회 수행
    if found_target:
        try:
            if debug:
                print(f"✅ 입력창 확정! id={found_target.get_attribute('id')}")
                save_screenshot(driver, "input_target_found")
                
            # 가시성이 없으면 강제로 보이게 처리 (JS)
            if not found_target.is_displayed():
                print("⚠️ 입력창이 보이지 않아 JS로 강제 입력 시도")
                driver.execute_script("arguments[0].value = arguments[1];", found_target, container_no)
            else:
                found_target.click()
                time.sleep(0.1)
                found_target.send_keys(Keys.CONTROL + "a"); found_target.send_keys(Keys.DELETE)
                found_target.send_keys(container_no)
            
            time.sleep(0.1)
            
            # 조회 트리거
            print("🚀 조회 실행: ENTER 입력")
            found_target.send_keys(Keys.ENTER)
            time.sleep(1)
            
            print("🚀 조회 실행: F5 입력")
            found_target.send_keys(Keys.F5)
            time.sleep(1)
            
            # 조회 버튼 클릭
            try:
                search_btns = driver.find_elements(By.XPATH, "//*[contains(text(),'조회') or contains(@id, 'btn_search') or contains(@id, 'Search')]")
                clicked = False
                for btn in search_btns:
                    if btn.is_displayed() and btn.tag_name in ['a', 'button', 'input', 'div', 'span', 'img']:
                        bid = (btn.get_attribute('id') or "").lower()
                        bclass = (btn.get_attribute('class') or "").lower()
                        if 'cal' in bid or 'date' in bid or 'cal' in bclass: continue
                        
                        print(f"🚀 조회 버튼 클릭 시도: {btn.text[:10]} (tag={btn.tag_name})")
                        btn.click()
                        clicked = True
                        break
                if not clicked: print("⚠️ 조회 버튼을 찾지 못했습니다.")
            except Exception as e: print(f"⚠️ 조회 버튼 클릭 중 오류: {e}")

            for _ in range(20):
                msg = check_alert(driver)
                if msg: 
                    print(f"🚨 ALERT 발생: {msg}")
                    return f"오류: {msg}"
                time.sleep(0.03)
            return True
        except Exception as e:
            print(f"❌ 입력/조회 중 에러: {e}")
            return False
            
    if debug: 
        print("❌ 적절한 입력창을 찾지 못했습니다.")
        save_screenshot(driver, "input_search_failed")
    return False

def scrape_hyper_verify(driver, search_no):
    """매의 눈 검증: 텍스트와 입력창 값을 모두 대조해 가짜 데이터 차단"""
    script = """
    var searchNo = arguments[0].replace(/[^A-Z0-9]/g, '').toUpperCase();
    try {
        var bodyText = document.body.innerText.toUpperCase();
        var inputs = document.querySelectorAll('input');
        var allContent = bodyText;
        for(var i=0; i<inputs.length; i++) { allContent += " " + inputs[i].value.toUpperCase(); }
        var cleanedContent = allContent.replace(/[^A-Z0-9]/g, '');

        if (cleanedContent.indexOf(searchNo) !== -1) {
            var rows = document.querySelectorAll('tr');
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
            if (!foundMatch) return null; // 검색어는 있지만 데이터 행이 아직 로드 안됨
            return data.length > 0 ? data.join('\\n') : null;
        }
        return null;
    } catch(e) { return "JS_ERROR: " + e.message; }
    """
    try:
        # 모든 프레임 + 메인에서 시도
        driver.switch_to.default_content()
        res = driver.execute_script(script, search_no)
        if res and "JS_ERROR" not in res: return res
        
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in frames:
            driver.switch_to.frame(frame)
            res = driver.execute_script(script, search_no)
            if res and "JS_ERROR" not in res: 
                driver.switch_to.default_content()
                return res
            driver.switch_to.default_content()
            
        return None
    except: return None


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
        print("✅ 로그인 성공! 메뉴 진입 완료.")
        print("=" * 60)
        
        # 테스트 조회
        test_container = "MRSU3077002"
        print(f"\n🚀 컨테이너 조회 테스트 시작: {test_container}")
        
        start_search = time.time()
        success = solve_input_and_search(driver, test_container, log_callback=print, debug=True)
        
        if success:
            print(f"✅ 입력 성공! 결과 대기 중...")
            
            grid_text = None
            for i in range(20): # 2초 대기
                print(f"데이터 스크래핑 시도 {i+1}...")
                grid_text = scrape_hyper_verify(driver, test_container)
                if grid_text: break
                time.sleep(0.1)
                
            if grid_text:
                print(f"\n🎉 데이터 조회 성공! ({time.time() - start_search:.2f}s)")
                print("-" * 40)
                print(grid_text)
                print("-" * 40)
                save_screenshot(driver, "search_success")
            else:
                print("\n⚠️ 데이터가 없거나 로드되지 않았습니다.")
                save_screenshot(driver, "search_no_data")
        else:
            print("\n❌ 입력창 찾기 또는 입력 실패")
            save_screenshot(driver, "input_failed")
        
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
