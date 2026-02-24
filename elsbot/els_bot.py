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

def save_screenshot(driver, name="debug"):
    """디버그용 스크린샷 저장 (elsbot/debug_screenshot.png)"""
    try:
        path = os.path.join(os.path.dirname(__file__), f"{name}_screenshot.png")
        driver.save_screenshot(path)
    except Exception as e:
        print(f"[DEBUG] 스크린샷 저장 실패: {e}")

def save_screenshot(driver, name="debug"):
    """디버그용 스크린샷 저장 (elsbot/debug_screenshot.png)"""
    try:
        path = os.path.join(os.path.dirname(__file__), f"{name}_screenshot.png")
        driver.save_screenshot(path)
        # print(f"[DEBUG] 스크린샷 저장 완료: {path}")
    except Exception as e:
        print(f"[DEBUG] 스크린샷 저장 실패: {e}")

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

    for attempt in range(15):
        check_alert(driver)
        close_modals(driver)
        
        try:
            if driver.find_elements(By.CSS_SELECTOR, "input[id*='containerNo']"):
                if log_callback: log_callback("조회 페이지 도착 확인!")
                save_screenshot(driver) # 📸 메뉴 도착 확인샷
                return True
        except: pass

        # 🎯 [핵심 전략] URL 직행을 최우선으로! (공지사항 원천 차단)
        if log_callback: log_callback(f"메뉴 진입 시도 ({attempt+1}/15)...")
        
        # attempt 0~2: 텍스트 매칭으로 메뉴 시도 (old_els_bot 방식)
        if attempt < 3:
            frames = driver.find_elements(By.TAG_NAME, "iframe")
            for frame in [None] + frames:
                try:
                    if frame: driver.switch_to.frame(frame)
                    target = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                    if target:
                        driver.execute_script("arguments[0].click();", target[0])
                        if log_callback: log_callback("메뉴 클릭 성공!")
                        time.sleep(4)
                        return True
                except: continue
                finally: driver.switch_to.default_content()
        
        # attempt 3+: URL 직행 (공지사항 늪 탈출)
        if attempt >= 3:
            if log_callback: log_callback("URL 직행으로 강제 이동!")
            # WebSquare의 메뉴 ID 기반 직접 접근
            driver.execute_script("""
                try {
                    // WebSquare의 내부 메뉴 이동 함수 호출 시도
                    if(typeof gcm !== 'undefined' && gcm.fn_openMenu) {
                        gcm.fn_openMenu('002001007');
                    }
                } catch(e) {}
            """)
            time.sleep(2)
            driver.get("https://etrans.klnet.co.kr/main/index.do?menuId=002001007")
            time.sleep(5)
        
        time.sleep(1)
    
    if log_callback: log_callback("메뉴 진입 최종 실패!")
    return False

def solve_input_and_search(driver, container_no, log_callback=None):
    """[WebSquare 특화] JavaScript로 직접 값 설정 + 조회 버튼 클릭"""
    check_alert(driver)
    
    # 🎯 [핵심] WebSquare에서는 send_keys가 안 먹힐 수 있으므로 JS로 직접 처리
    # 스크린샷에서 확인된 입력창 ID: mf_tac_layout_contents_002_body_inp_containerNo
    result = driver.execute_script("""
        var containerNo = arguments[0];
        
        // 1. 입력창 찾기 (ID에 'containerNo' 포함)
        var input = document.querySelector('input[id*="containerNo"]');
        if (!input) {
            // iframe 안에서도 찾기
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try {
                    var doc = frames[i].contentDocument || frames[i].contentWindow.document;
                    input = doc.querySelector('input[id*="containerNo"]');
                    if (input) break;
                } catch(e) {}
            }
        }
        if (!input) return 'INPUT_NOT_FOUND';
        
        // 2. 값 설정 (WebSquare 방식: focus -> 값 변경 -> 이벤트 발생)
        input.focus();
        input.value = '';
        input.value = containerNo;
        
        // WebSquare 내부 데이터 동기화를 위해 이벤트 발생
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        input.dispatchEvent(new Event('blur', {bubbles: true}));
        
        // 3. 조회 버튼 찾기 + 클릭 (ID에 'btnSearch' 포함)
        var btn = document.querySelector('[id*="btnSearch"]');
        if (!btn) {
            // 텍스트로 찾기
            var allBtns = document.querySelectorAll('input[type="button"], button, a');
            for (var j = 0; j < allBtns.length; j++) {
                var txt = allBtns[j].innerText || allBtns[j].value || '';
                if (txt.indexOf('조회') !== -1) {
                    btn = allBtns[j];
                    break;
                }
            }
        }
        
        if (btn) {
            btn.click();
            return 'SEARCH_CLICKED';
        }
        
        // 버튼 못 찾으면 엔터 이벤트 직접 발생
        var enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        });
        input.dispatchEvent(enterEvent);
        return 'ENTER_DISPATCHED';
    """, container_no)
    
    if log_callback: log_callback(f"[{container_no}] JS 조회 결과: {result}")
    
    if result == 'INPUT_NOT_FOUND':
        # Selenium 폴백: 프레임 순회 방식
        if log_callback: log_callback("JS 실패, Selenium 폴백...")
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in [None] + frames:
            try:
                if frame: driver.switch_to.frame(frame)
                input_field = driver.find_elements(By.CSS_SELECTOR, "input[id*='containerNo']")
                if input_field:
                    target = input_field[0]
                    target.click()
                    target.send_keys(Keys.CONTROL + "a")
                    target.send_keys(Keys.DELETE)
                    target.send_keys(container_no)
                    target.send_keys(Keys.ENTER)
                    if log_callback: log_callback(f"[{container_no}] Selenium 폴백 완료!")
                    for _ in range(20):
                        msg = check_alert(driver)
                        if msg: return f"오류: {msg}"
                        time.sleep(0.03)
                    return True
            except: continue
            finally: driver.switch_to.default_content()
        return "입력창을 찾을 수 없습니다."
    
    # 팝업 체크
    for _ in range(20):
        msg = check_alert(driver)
        if msg: return f"오류: {msg}"
        time.sleep(0.03)
    
    save_screenshot(driver) # 📸 검색 결과 화면샷
    return True



def scrape_hyper_verify(driver, search_no):
    """[영혼의 복구] 모든 프레임을 뒤져서 컨테이너 번호 존재 여부를 확인하고 WebSquare 데이터를 추출"""
    
    script = r"""
    var searchNo = arguments[0].replace(/[^A-Z0-9]/g, '').toUpperCase();
    var results = [];
    
    function dive(win) {
        try {
            // 1. 현재 프레임에 컨테이너 번호가 있는지 '매의 눈' 검증
            var bodyText = (win.document.body ? win.document.body.innerText : "").toUpperCase();
            var inputs = win.document.querySelectorAll('input');
            var allContent = bodyText;
            for(var i=0; i<inputs.length; i++) { allContent += " " + (inputs[i].value || "").toUpperCase(); }
            var cleanedContent = allContent.replace(/[^A-Z0-9]/g, '');

            // 컨테이너 번호가 확인된 프레임에서만 데이터 추출
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
                    // 첫 컬럼이 숫자이면서 핵심 키워드가 포함된 행만 필터링
                    if (/^\d+\|/.test(rowText) && (rowText.indexOf('수입') !== -1 || rowText.indexOf('수출') !== -1 || rowText.indexOf('반입') !== -1 || rowText.indexOf('반출') !== -1)) {
                        results.push(rowText);
                    }
                }
            }
            
            // 모든 하위 프레임 재귀 탐색
            for (var i = 0; i < win.frames.length; i++) {
                dive(win.frames[i]);
            }
        } catch (e) {}
    }
    
    dive(window);
    var unique = Array.from(new Set(results));
    return unique.join('\n');
    """
    
    # 데이터가 렌더링될 때까지 끈질기게 대기 (최대 15초)
    # [캐시 방역] 성급한 '내역 없음' 판단을 막기 위해 오직 진짜 데이터(|)가 잡힐 때만 성공으로 간주
    for retry in range(15):
        try:
            res = driver.execute_script(script, search_no)
            # 파이프(|)로 구분된 진짜 데이터가 10자 이상(한 줄 이상) 잡히면 즉시 반환
            if res and '|' in res and len(res.strip()) > 10:
                return res
        except: pass
        time.sleep(1)
        
    # 15초를 다 기다렸는데도 grid 데이터가 없으면, 그제서야 "데이터 없음" 문구가 있는지 확인
    # 이때도 혹시 모르니 화면 전체를 다시 훑음
    try:
        full_text = driver.execute_script("return document.body.innerText;")
        for msg in ["데이터가 없습니다", "내역이 없습니다", "데이터가 존재하지 않습니다", "조회된 내역이 없습니다"]:
            if msg in full_text:
                return "NODATA_CONFIRMED"
    except: pass
        
    return None

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
            # 🎯 형의 요청: 로그인 실패 시 명확한 사유 전달
            page_src = driver.page_source or ""
            if "아이디" in page_src and "비밀번호" in page_src and ("맞지 않" in page_src or "정보가" in page_src):
                driver.quit()
                return (None, "LOGIN_ERROR_CREDENTIALS")
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
                lines = grid_text.split('\n')
                for line in lines:
                    stripped = line.strip()
                    if not stripped: continue
                    
                    # [버그 수정] scrape_hyper_verify가 '|'로 구분해서 주므로 '|'로 잘라야 함
                    row_data = stripped.split('|')
                    if row_data and str(row_data[0]).isdigit():
                        no_val = int(row_data[0])
                        # 0은 메타데이터(0건 등)일 확률이 높으므로 1 이상만 데이터로 취합
                        if 1 <= no_val <= 200:
                            # 부족한 컬럼 채우기
                            while len(row_data) < 15: row_data.append("")
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