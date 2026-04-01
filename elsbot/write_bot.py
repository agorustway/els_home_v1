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
        # 공지사항/팝업 닫기
        # 이트랜스 팝업/모달 종료
        page.run_js("""
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => {
                if (e.innerText.indexOf('로그인') === -1) {
                    e.style.display = 'none';
                }
            });
        """)
        # 세션 종료 확인용
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다"]):
            return "SESSION_EXPIRED"
        
        modal_titles = page.eles('css:.w2modal_title', timeout=0.1)
        for title in modal_titles:
            if "로그인" in title.text:
                return "LOGIN_REQUIRED"
    except: pass
    return "OK"

def is_session_valid(page):
    try:
        if not page or not page.url: return False
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return False
            
        logout_btn = page.ele('text:로그아웃', timeout=1) or \
                     page.ele('#mf_wfm_subContainer_btn_logout', timeout=0.1) or \
                     page.ele('css:[id*="btnLogout"]', timeout=0.1)
        
        if logout_btn and logout_btn.is_displayed():
            if "손님(GUEST)" not in page.html:
                return True
        return False
    except:
        return False

def open_els_menu(page, log_callback=None):
    if log_callback: log_callback("메뉴 진입 시도 중 (DrissionPage)...")
    
    for attempt in range(3):
        close_modals(page)
        
        # 조회 페이지 도착 확인 (인풋 박스 유무)
        if page.ele('css:input[id*="containerNo"]', timeout=3):
            if log_callback: log_callback("이미 조회 페이지에 있습니다.")
            return True

        # 메인 페이지 이동
        if "main.do" not in page.url.lower():
            if log_callback: log_callback("메인 화면으로 이동...")
            page.get("https://etrans.klnet.co.kr/main.do")
            time.sleep(3)
            close_modals(page)

        # 1단계: 상위 메뉴 '화물추적' 클릭
        # ID: #mf_wfm_gnb_gen_depth1Generator_6_btn_depth1_Label
        parent = page.ele('text:화물추적', timeout=5) or \
                 page.ele('#mf_wfm_gnb_gen_depth1Generator_6_btn_depth1_Label', timeout=1)
        
        if parent:
            if log_callback: log_callback(f"상위 메뉴 클릭: {parent.text}")
            parent.hover()
            time.sleep(1)
            parent.click()
            time.sleep(2)
            
            # 2단계: 하위 메뉴 '컨테이너이동현황(국내)' 클릭
            target = page.ele('text:컨테이너이동현황(국내)', timeout=3) or \
                     page.ele('text:컨테이너 이동현황', timeout=0.1) or \
                     page.ele('css:[id*="btn_2ndMenu"]', timeout=0.1)
            
            if target:
                if log_callback: log_callback(f"하위 메뉴 클릭: {target.text}")
                target.click()
                time.sleep(5)
                # 최종 확인
                if page.ele('css:input[id*="containerNo"]', timeout=5):
                    return True
            else:
                if log_callback: log_callback("하위 메뉴를 찾지 못했습니다.")
                save_screenshot(page, "debug_nav_sub_error")
        else:
            if log_callback: log_callback("상위 메뉴(화물추적)를 찾지 못했습니다.")
            save_screenshot(page, "debug_nav_top_error")
            
    return False

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

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        if log_callback: log_callback(f"[{time.time()-start_time:6.2f}s] {msg}")

    _log("DrissionPage 브라우저 시작 중...")
    co = ChromiumOptions()
    co.set_local_port(port)
    
    page = ChromiumPage(co)
    try:
        _log("페이지 접속 중: https://etrans.klnet.co.kr/")
        page.get("https://etrans.klnet.co.kr/")
        time.sleep(2)
        
        # 이미 로그인 된 경우 패스
        if is_session_valid(page):
            _log("이미 로그인된 유효한 세션입니다.")
        else:
            # 로그인 시도 (팝업/전체화면 통합 대응)
            for attempt in range(5):
                close_modals(page)
                
                # 로그인 입력창 찾기 (ID/PW)
                uid_input = page.ele('#mf_wfm_subContainer_ibx_userId', timeout=5) or \
                            page.ele('css:input[id*="UserId"]', timeout=1) or \
                            page.ele('css:input[placeholder*="아이디"]', timeout=1)
                
                pw_input = page.ele('#mf_wfm_subContainer_sct_password', timeout=5) or \
                           page.ele('css:input[id*="password"]', timeout=1) or \
                           page.ele('css:input[placeholder*="비밀번호"]', timeout=1)
                
                if uid_input and pw_input:
                    _log(f"로그인 입력창 발견 ({uid_input.attr('id')})")
                    try:
                        # 물리적 입력 시도
                        uid_input.input(u_id.strip())
                        pw_input.input(u_pw.strip())
                    except Exception as e:
                        _log(f"물리 입력 실패 ({e}), JS 강제 입력 시도...")
                        # JS로 직접 주입
                        uid_id = uid_input.attr('id')
                        pw_id = pw_input.attr('id')
                        page.run_js(f"document.getElementById('{uid_id}').value = '{u_id.strip()}';")
                        page.run_js(f"document.getElementById('{pw_id}').value = '{u_pw.strip()}';")
                        page.run_js(f"document.getElementById('{uid_id}').dispatchEvent(new Event('input', {{bubbles: true}}));")
                        page.run_js(f"document.getElementById('{pw_id}').dispatchEvent(new Event('input', {{bubbles: true}}));")
                    
                    login_btn = page.ele('#mf_wfm_subContainer_btn_login', timeout=2) or \
                                page.ele('text:로그인', timeout=1) or \
                                page.ele('css:[id*="btn_login"]', timeout=1)
                    
                    if login_btn:
                        _log(f"로그인 버튼 클릭 시도 (ID: {login_btn.attr('id')})")
                        try:
                            login_btn.click()
                        except:
                            page.run_js(f"document.getElementById('{login_btn.attr('id')}').click();")
                        time.sleep(3)
                    else:
                        _log("로그인 버튼을 찾지 못해 엔터키 입력")
                        pw_input.input('\n')
                        time.sleep(3)
                else:
                    _log("ID/PW 입력창이 보이지 않습니다. (모달 확인 중...)")
                    time.sleep(2)

                # 로그인 성공 확인
                if is_session_valid(page):
                    _log("로그인 성공 확인 완료!")
                    break
                
                # 오류 메시지 확인
                html = page.html
                if "비밀번호" in html and ("오류" in html or "틀렸습니다" in html):
                    _log("!!! 로그인 오류 메시지 감지 (비번 틀림 등) !!!")
                
                _log(f"로그인 대기 중... ({attempt+1}/5)")
                time.sleep(2)
                
                if attempt == 4:
                    save_screenshot(page, "login_fail_final")
                    _log(f"최종 로그인 실패. URL: {page.url}")
                    return (None, "로그인 실패 혹은 확인 불가")

        # 메뉴 이동 시도
        if open_els_menu(page, _log):
            _log("모든 준비 완료")
            return (page, None)
            
        page.quit()
        return (None, "메뉴 진입 실패")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"봇 실행 중 에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False):
    start_time = time.time()
    def _log(msg):
        if log_callback: log_callback(f"[{time.time()-start_time:6.2f}s] {msg}")

    res = login_and_prepare(u_id, u_pw, _log, show_browser=show_browser)
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
'''
with open('els_bot.py', 'w', encoding='utf-8') as f:
    f.write(content)
