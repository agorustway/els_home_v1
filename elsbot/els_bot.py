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
        # 공지사항/팝업 닫기
        # '아이디를 입력하세요' 같은 알림창 닫기 우선
        alerts = page.eles('css:.w2modal_popup')
        for alert in alerts:
            if any(msg in alert.text for msg in ["아이디를 입력", "비밀번호를 입력", "확인"]):
                btn_ok = alert.ele('text:확인') or alert.ele('css:.btn_cm')
                if btn_ok:
                    btn_ok.click()
                    time.sleep(0.5)

        page.run_js("""
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => {
                if (e.innerText.indexOf('로그인') === -1 && e.innerText.indexOf('아이디를') === -1) {
                    e.style.display = 'none';
                }
            });
        """)
        # 세션 종료 확인
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다"]):
            return "SESSION_EXPIRED"
    except: pass
    return "OK"



def solve_input_and_search(page, container_no, log_callback=None):
    try:
        # 입력창 찾기
        input_ele = page.ele('css:input[id*="containerNo"]', timeout=5)
        if not input_ele:
            if log_callback: log_callback(f"[{container_no}] 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"

        # 입력 전 초기화 (WebSquare 대응)
        input_id = input_ele.attr('id')
        page.run_js(f"""
            var el = document.getElementById('{input_id}');
            if (el) {{
                el.value = '';
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}
        """)
        time.sleep(0.2)
        
        # 값 입력
        input_ele.input(container_no)
        
        # 실제 입력 확인
        actual_val = input_ele.value or ""
        if actual_val.strip().upper() != container_no.strip().upper():
             page.run_js(f"document.getElementById('{input_id}').value = '{container_no}';")
             page.run_js(f"document.getElementById('{input_id}').dispatchEvent(new Event('change', {{bubbles: true}}));")

        # 조회 버튼 클릭
        btn = page.ele('css:[id*="btnSearch"]', timeout=2) or page.ele('text:조회', timeout=1)
        if btn:
            btn.click()
        else:
            input_ele.input('\n')

        if log_callback: log_callback(f"[{container_no}] 조회 버튼 클릭 완료")
        time.sleep(0.5) 
        
        # 알림 메시지 확인
        try:
            alert_text = page.handle_alert(timeout=1)
            if alert_text:
                if any(msg in alert_text for msg in ["데이터가 없습니다", "내역이 없습니다", "존재하지 않습니다"]):
                    return "내역없음확인"
        except: pass

        # 로딩바 대기
        for _ in range(20):
            spinner = page.ele('css:[id*="_progress_"]', timeout=0.1)
            if not spinner: break
            style = spinner.attrs.get('style', '')
            if 'display: none' in style or 'visibility: hidden' in style: break
            time.sleep(0.5)

        return True
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
            for (var i = 0; i < win.frames.length; i++) { dive(win.frames[i]); }
        } catch (e) {}
    }
    dive(window);
    var finalData = Array.from(new Set(results));
    return finalData.join('\n');
    """
    for attempt in range(15):
        try:
            res = page.run_js(script)
            if res and '|' in res: return res
        except: pass
        time.sleep(0.5)
    return None

def solve_login_modal(page, u_id, u_pw, log_callback=None):
    """로그인 모달/메인 로그인 폼을 찾아 해결. 안전을 위해 3회 실패 시 중단"""
    # [추가] 정적 변수로 실패 횟수 관리 (세션 계정 잠금 방지)
    if not hasattr(solve_login_modal, 'fail_count'):
        solve_login_modal.fail_count = 0
        
    if solve_login_modal.fail_count >= 3:
        if log_callback: log_callback("🛑 [보안 중단] 로그인 3회 실패 누적으로 인해 자동 시도를 중지합니다.")
        return False

    try:
        def find_ele_globally(selector):
            """모든 페이지와 아이프레임에서 요소를 수색"""
            res = page.ele(selector, timeout=0.5)
            if res: return res
            for iframe in page.eles('t:iframe'):
                try:
                    res = iframe.ele(selector, timeout=0.1)
                    if res: return res
                except: pass
            return None
        # [긴급/추가] 상단 비상 로그인 팝업 (Top Login Popup)
        top_popup_uid = find_ele_globally('#mf_wfm_top_loginPopup_wframe_ibx_userId')
        top_popup_pw = find_ele_globally('#mf_wfm_top_loginPopup_wframe_sct_password')
        
        if top_popup_uid and top_popup_uid.states.is_displayed:
            if log_callback: log_callback("📢 [비상] 상단 로그인 팝업 발견! 처리 개시.")
            uid_input = top_popup_uid
            pw_input = top_popup_pw
            login_btn_selector = '#mf_wfm_top_loginPopup_wframe_btn_login'
        else:
            # 1. 일반 팝업(모달) 내 로그인 창 확인 (모든 프레임 수색)
            modal = find_ele_globally('css:.w2modal_popup')
            if modal and "로그인" in modal.text:
                if log_callback: log_callback("📢 모달 로그인 팝업 발견! 처리 개시.")
                uid_input = modal.ele('css:input[id*="UserId"]') or modal.ele('css:input[placeholder*="아이디"]')
                pw_input = modal.ele('css:input[id*="password"]') or modal.ele('css:input[placeholder*="비밀번호"]')
                login_btn_selector = 'text:로그인'
            else:
                # 2. 일반 페이지 내 로그인 창 확인
                if log_callback: log_callback("📢 일반 로그인 양식 검색 중...")
                uid_input = find_ele_globally('#mf_wfm_subContainer_ibx_userId')
                pw_input = find_ele_globally('#mf_wfm_subContainer_sct_password')
                login_btn_selector = '#mf_wfm_subContainer_btn_login'
        
        for _ in range(20):
            if uid_input and uid_input.states.is_displayed: break
            time.sleep(0.5)
            
        if uid_input and pw_input:
            if log_callback: log_callback(f"로그인 정보 입력 중... ({uid_input.attr('id')})")
            
            # 물리적 위치 기반 클릭 및 입력 (가장 확실한 방법)
            try:
                if not uid_input.states.is_displayed:
                    raise Exception("Element not visible")
                # 1. 아이디 입력 (사람처럼 클릭 후 약간 대기)
                if log_callback: log_callback("아이디 칸 타격...")
                uid_input.click()
                time.sleep(0.5) # 포커스 안정화 대기
                uid_input.input(u_id.strip(), clear=True)
                time.sleep(0.3)
                
                # 2. 비밀번호 입력 (사람처럼 클릭 후 약간 대기)
                if log_callback: log_callback("비밀번호 칸 타격...")
                pw_input.click()
                time.sleep(0.5) # 포커스 안정화 대기
                pw_input.input(u_pw.strip(), clear=True)
                time.sleep(0.5)
            except:
                if log_callback: log_callback("물리 입력 실패, JS 강력 주입 시도...")
                uid_id = uid_input.attr('id')
                pw_id = pw_input.attr('id')
                page.run_js(f"""
                    var u = document.getElementById('{uid_id}');
                    var p = document.getElementById('{pw_id}');
                    if(u && p) {{
                        u.value = '{u_id.strip()}';
                        p.value = '{u_pw.strip()}';
                        u.dispatchEvent(new Event('input', {{bubbles: true}}));
                        u.dispatchEvent(new Event('change', {{bubbles: true}}));
                        p.dispatchEvent(new Event('input', {{bubbles: true}}));
                        p.dispatchEvent(new Event('change', {{bubbles: true}}));
                        // WebSquare 전용 이벤트 트리거 시도
                        if (u._instance) u._instance.setValue('{u_id.strip()}');
                        if (p._instance) p._instance.setValue('{u_pw.strip()}');
                    }}
                """)
            
            login_btn = find_ele_globally(login_btn_selector) or \
                        find_ele_globally('text:로그인') or \
                        find_ele_globally('css:[id*="btn_login"]')
            
            if login_btn:
                btn_id = login_btn.attr('id')
                if log_callback: log_callback(f"로그인 버튼 클릭 시도 ({btn_id})")
                try:
                    login_btn.click()
                except:
                    # 버튼이 속한 페이지/프레임에서 클릭
                    login_btn.owner.run_js(f"var el = document.getElementById('{btn_id}'); if(el) el.click();")
                
                time.sleep(5)
                # 로그인 성공 여부 확인 루프
                for _ in range(5):
                    if is_session_valid(page):
                        solve_login_modal.fail_count = 0 # 성공 시 초기화
                        return True
                    time.sleep(1)
                
                # 실패 핸들링
                solve_login_modal.fail_count += 1
                if log_callback: log_callback(f"⚠️ 로그인 실패 누적: {solve_login_modal.fail_count}/3")
                close_modals(page)
                return False
        return False
    except Exception as e:
        if log_callback: log_callback(f"로그인 모달 처리 중 에러: {e}")
        return False

def is_session_valid(page):
    try:
        # [긴급/추가] 로그인 팝업 감지 시 세션 무효 처리
        target = page.ele('#mf_wfm_top_loginPopup_wframe_ibx_userId', timeout=0.1)
        if target:
            return False
            
        html = page.html
        # [수색] GUEST 확인
        if "손님(GUEST)" in html:
            return False
            
        # 1. 텍스트 지표 확인
        if "btn_logout" in html or "로그아웃" in html:
            if "ELS1106" in html or "님 안녕하세요" in html:
                if "손님(GUEST)" not in html:
                    return True
        
        # 2. 특정 요소 존재 여부로 판단 (로그아웃 버튼 ID)
        if page.ele('#mf_wfm_gnb_btn_logout', timeout=0.1):
            return True

        # 3. 로그인 창이 대놓고 떠있으면 미인증
        if page.ele('#mf_wfm_subContainer_ibx_userId', timeout=0.1):
            return False
            
        url = page.url.lower()
        if any(u in url for u in ["login.do", "login.klnet"]):
            return False
            
        # 4. 세션 종료 메시지 확인
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return False
            
        # 5. 그 외의 경우 (메인 페이지 등에서 로그아웃 버튼은 없지만 ELS1106 텍스트는 있는 경우)
        if "ELS1106" in html and "손님" not in html:
            return True

        return False
    except:
        return False

def extend_els_session(page, log_callback=None):
    try:
        ext_btn = page.ele('#mf_wfm_gnb_btn_sessionExtension', timeout=1) or \
                  page.ele('text:연장', timeout=1)
        if ext_btn:
            if log_callback: log_callback("세션 연장 버튼 클릭")
            ext_btn.click(by_js=True)
            time.sleep(0.5)
            close_modals(page)
            return True
        return False
    except:
        return False

def open_els_menu(page, u_id=None, u_pw=None, log_callback=None):
    if log_callback: log_callback("메뉴 진입 시도 중...")
    
    # [추가] 초기 사이즈 고정
    try: page.set.window_size(1920, 1080)
    except: pass

    for attempt in range(5):
        close_modals(page)
        
        # 1. 로그인 필요 여부 실시간 체크
        if not is_session_valid(page):
            if log_callback: log_callback("세션 유효하지 않음, 로그인 시도...")
            if u_id and u_pw:
                solve_login_modal(page, u_id, u_pw, log_callback)
                time.sleep(2)
                if not is_session_valid(page): continue
            else:
                return False

        # 2. 조회 페이지 도착 확인 (인풋 박스 유무)
        if page.ele('css:input[id*="containerNo"]', timeout=3):
            if log_callback: log_callback("조회 페이지 도착 확인!")
            return True

        # 3. 메인 화면으로 이동 (필요한 경우)
        if "main" not in page.url.lower():
            if log_callback: log_callback("메인 화면으로 이동 시도...")
            page.get("https://etrans.klnet.co.kr/main.do")
            time.sleep(5)
            close_modals(page)

        # 4. 정석 클릭 방식 (구버전 로직 복구)
        if log_callback: log_callback("상위 메뉴 클릭: 화물추적")
        
        # [ID 기반 클릭 우선] 형이 준 스캔 데이터 기준
        parent = page.ele('#mf_wfm_gnb_gen_depth1Generator_6_btn_depth1_Label', timeout=2) or \
                 page.ele('text:화물추적', timeout=5)
        
        if parent:
            try: parent.click(by_js=True)
            except: pass
            time.sleep(1)
            
            # [최우선] JS를 이용한 직접 메뉴 오픈 시도 (MNU0024: 컨테이너이동현황(국내))
            if log_callback: log_callback("JS 메뉴 강제 진입 시도 (MNU0024)...")
            # iframe 안에도 JS가 있을 수 있으므로 모든 프레임에 주입 시도
            js_code = "if(window.scwin && scwin.openMenu) scwin.openMenu('MNU0024');"
            page.run_js(js_code)
            
            # iframe 수색 (DrissionPage의 강력한 기능 활용)
            # [수정] page.frames 대신 page.eles('t:iframe') 로프 사용
            for frame in page.eles('t:iframe'):
                try: frame.run_js(js_code)
                except: pass
            
            time.sleep(3)
            # 조회 페이지 특징인 인풋박스가 보이면 성공
            if page.ele('css:input[id*="containerNo"]', timeout=3) or \
               page.ele('@@text():조회년월', timeout=1):
                 if log_callback: log_callback("메뉴 진입 성공!")
                 return True

            if log_callback: log_callback("하위 메뉴 클릭 시도: 컨테이너이동현황(국내)")
            # ID 기반 및 유연한 텍스트 매칭
            target = page.ele('#mf_wfm_gnb_gen_depth1Generator_6_gen_2ndMenu_1_btn_2ndMenu', timeout=2) or \
                     page.ele('@@text():컨테이너이동현황(국내)', timeout=3) or \
                     page.ele('@@text():컨테이너 이동현황', timeout=2)
                     
            if target:
                target.click(by_js=True)
                time.sleep(5)
                # 최종 확인
                if page.ele('css:input[id*="containerNo"]', timeout=5):
                    return True
            else:
                if log_callback: log_callback("모든 수단으로 하위 메뉴를 찾을 수 없습니다.")
        else:
            if log_callback: log_callback("상위 메뉴(화물추적)를 찾을 수 없습니다.")
            save_screenshot(page, "debug_menu_fail")
            time.sleep(3)
            
    return False

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        if log_callback: log_callback(f"[{time.time()-start_time:6.2f}s] {msg}")

    _log("DrissionPage 브라우저 시작...")
    co = ChromiumOptions()
    co.set_local_port(port)
    
    # [수정] Docker/Linux/NAS 환경을 위한 최적화 및 안정화 설정
    # [수정] 환경 변수나 표준 경로에서 크롬/크로미움 검색
    chrome_bin = os.environ.get('CHROME_BIN')
    if chrome_bin and os.path.exists(chrome_bin):
        co.set_browser_path(chrome_bin)
    elif os.path.exists('/usr/bin/google-chrome'):
        co.set_browser_path('/usr/bin/google-chrome')
    elif os.path.exists('/usr/bin/chromium'):
        co.set_browser_path('/usr/bin/chromium')
        
    if not show_browser:
        co.headless(True)
        co.set_argument('--no-sandbox')
        co.set_argument('--disable-setuid-sandbox') 
        co.set_argument('--disable-gpu')
        co.set_argument('--disable-dev-shm-usage') 
        co.set_argument('--no-first-run')
        co.set_argument('--no-zygote') 
        co.set_argument('--no-default-browser-check')
        co.set_argument('--disable-extensions')
        co.set_argument('--disable-background-networking')
        co.set_argument('--disable-background-timer-throttling')
        co.set_argument('--disable-client-side-phishing-detection')
        co.set_argument('--disable-default-apps')
        co.set_argument('--disable-hang-monitor')
        co.set_argument('--disable-popup-blocking')
        co.set_argument('--disable-prompt-on-repost')
        co.set_argument('--disable-sync')
        co.set_argument('--metrics-recording-only')
        co.set_argument('--safebrowsing-disable-auto-update')
        co.set_argument('--password-store=basic')
        co.set_argument('--use-mock-keychain')
        co.set_argument('--remote-debugging-address=0.0.0.0') 
        # [제거] 데스크톱 모드 강제 해제 (기본값 사용)
        
        # [중요] 사용자 데이터 데렉토리를 포트별로 분리
        user_data_path = os.path.join(os.path.dirname(__file__), "dist", f"drission_data_{port}")
        os.makedirs(user_data_path, exist_ok=True)
        co.set_user_data_path(user_data_path)
    
    _log(f"ChromiumPage 인스턴스 생성 시도... (포트: {port}, 경로: {co.browser_path})")
    try:
        # 인스턴스 생성 전 포트 점유 여부 한 번 더 체크하는 것이 안전할 수 있음
        page = ChromiumPage(co)
        _log(f"ChromiumPage 인스턴리 생성 완료 (연결 성공)")
    except Exception as e:
        _log(f"!!! 브라우저 인스턴스 초기화 실패 !!! : {e}")
        return (None, f"인스턴스 생성 오류: {e}")
    try:
        page.get("https://etrans.klnet.co.kr/")
        time.sleep(2)
        
        # 메뉴 오픈 로직 자체에 로그인 시퀀스를 포함시켜서 호출
        if open_els_menu(page, u_id, u_pw, _log):
            _log("모든 준비 완료")
            return (page, None)
            
        page.quit()
        return (None, "메뉴 진입 혹은 로그인 실패")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"봇 실행 중 에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        if log_callback: log_callback(f"[{time.time()-start_time:6.2f}s] {msg}")

    res = login_and_prepare(u_id, u_pw, _log, show_browser=show_browser, port=port)
    page = res[0]
    if not page: return {"ok": False, "error": res[1]}

    final_rows = []
    headers = ["조회번호", "No", "수출입", "구분", "상태", "MOVE TIME", "모선", "항차", "선사", "선공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    for cn_raw in c_list:
        cn = str(cn_raw).strip().upper()
        item_log = lambda x: _log(f"{cn}: {x}")
        
        item_log("조회 시작")
        status = solve_input_and_search(page, cn, item_log)
        
        if status is True:
            grid_text = scrape_hyper_verify(page, cn)
            if grid_text:
                found_any = False
                for line in grid_text.split('\n'):
                    row_data = line.strip().split('|')
                    if row_data and row_data[0].isdigit():
                        while len(row_data) < 15: row_data.append("")
                        final_rows.append([cn] + row_data[:14])
                        found_any = True
                if not found_any:
                    final_rows.append([cn, "NODATA", "내역 없음"] + [""]*12)
            else:
                final_rows.append([cn, "NODATA", "추출 실패"] + [""]*12)
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
    return {"ok": False, "error": "데이터가 수집되지 않았습니다."}

def cli_main():
    config = load_config()
    u_id = config.get('user_id', '')
    u_pw = config.get('user_pw', '')
    try:
        xlsx_path = os.path.join(os.path.dirname(__file__), "container_list.xlsx")
        df_in = pd.read_excel(xlsx_path)
        c_list = df_in.iloc[2:, 0].dropna().tolist()
        results = run_els_process(u_id, u_pw, c_list, log_callback=print)
        print(f"[RESULT] 완료: {len(results.get('sheet2', []))}건 수집")
    except Exception as e:
        print(f"[ERROR] CLI 에러: {e}")

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
