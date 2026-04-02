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
    """디버그용 스크린샷 저장 (elsbot/debug_screenshot.png)"""
    try:
        path = os.path.join(os.path.dirname(__file__), f"{name}_screenshot.png")
        page.get_screenshot(path=path)
    except Exception as e:
        print(f"[DEBUG] 스크린샷 저장 실패: {e}")

def check_alert(page):
    """DrissionPage는 알람을 자동으로 처리하거나 확인할 수 있음"""
    try:
        if page.handle_alert(accept=True):
            return "Alert accepted"
    except: pass
    return None

def close_modals(page):
    """이트랜스 공지사항 등 모달 창 닫기 (DrissionPage 버전)"""
    try:
        # 세션 종료 텍스트 확인
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return "SESSION_EXPIRED"

        # 로그인 팝업이 떠 있는지 확인 (이미 세션 만료됨)
        modal_titles = page.eles('css:.w2modal_title', timeout=0.1)
        for title in modal_titles:
            if "로그인" in title.text:
                return "SESSION_EXPIRED"

        # 일반적인 공지사항 등 닫기 시도
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
    """현재 브라우저가 로그온 상태이며 로그인 팝업이 없는지 검사"""
    try:
        if not page or not page.url:
            return False

        # 1. 세션 만료 알림 텍스트 확인
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return False

        # 2. 로그인 팝업 체크
        modal_titles = page.eles('css:.w2modal_title', timeout=0.1)
        for title in modal_titles:
            if "로그인" in title.text:
                return False
        
        # 3. 로그아웃 버튼이나 사용자 정보 확인
        if page.ele('text:로그아웃', timeout=1) or page.ele('text:님 안녕하세요', timeout=0.1):
            return True
            
        return False
    except:
        return False

def find_ele_globally(page, selector, timeout=0.5):
    """모든 아이프레임을 재귀적으로 뒤져서 요소를 찾아내는 전천후 수색대 (v4.4.29)"""
    # 1. 현재 레벨에서 검색
    res = page.ele(selector, timeout=timeout)
    if res: return res
    
    # 2. 모든 아이프레임 리스트 확보하여 내부 수색
    iframes = page.eles('t:iframe')
    for iframe in iframes:
        try:
            # 재귀적으로 내부 아이프레임도 수색
            res = find_ele_globally(iframe, selector, timeout=0.1)
            if res: return res
        except: continue
    return None

def open_els_menu(page, log_callback=None):
    if log_callback: log_callback("🚀 WebSquare 안정화 메뉴 진입 (v4.4.38)")
    
    # 1. 팝업 정리
    close_modals(page)

    # 0. 이미 해당 화면이 열려있는지 체크
    def is_target_found():
        try:
            # 존재만 해도 성공으로 간주 (WebSquare 탭이 활성화되면 나타남)
            target = page.ele('css:input[id*="containerNo"]', timeout=0.1)
            if target: return True
        except: pass
        return False

    if is_target_found():
        if log_callback: log_callback("✅ 이미 대상 화면(탭)이 로드되어 있습니다.")
        return True

    # 2. 메뉴 네비게이션 루프
    for attempt in range(10):
        try:
            if is_target_found(): return True
            
            if log_callback: log_callback(f"  [{attempt+1}/10] 메뉴 탐색 중...")
            
            # (A) 상단 메뉴 클릭
            top_menu = page.ele('text=화물추적', timeout=1) 
            if top_menu:
                top_menu.click(by_js=True)
                time.sleep(1)
                
                # (B) 서브메뉴 클릭
                sub_menu = page.ele('text=컨테이너이동현황(국내)', timeout=1) or \
                           page.ele('text=컨테이너이동현황', timeout=0.5)
                if sub_menu:
                    sub_menu.click(by_js=True)
                    time.sleep(3) # 탭 생성 대기
                    if is_target_found():
                        if log_callback: log_callback("✅ 메뉴 진입 성공!")
                        return True
            
            # (C) 최후 수단: JS 강제 호출
            if log_callback: log_callback("  [워프] WebSquare 내부 함수(gcm.win._openMenu) 호출...")
            page.run_js('try { gcm.win._openMenu("602"); } catch(e) {}')
            time.sleep(3)
            if is_target_found(): return True

        except Exception as e:
            if log_callback: log_callback(f"  ⚠️ 시도 중 오류: {e}")
            
        close_modals(page)
        time.sleep(1)

    if log_callback: log_callback("❌ 메뉴 진입 최종 실패 (타임아웃)")
    return False

def solve_input_and_search(page, container_no, log_callback=None):
    """[전천후] 아이프레임 상관없이 입력창 찾아서 조회"""
    try:
        # 입력창 탐색 (아이프레임 관통 수색)
        input_ele = find_ele_globally(page, 'css:input[id*="containerNo"]', timeout=5)
        if not input_ele:
            if log_callback: log_callback("❌ 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"
        
        # 입력 전 팝업 정리
        close_modals(page)
        
        # 값 입력 (JS와 물리 입력 병행)
        input_ele.click()
        input_ele.run_js(f"this.value = '{container_no}';")
        input_ele.input(container_no, clear=True)
        if log_callback: log_callback(f"[{container_no}] 입력 완료")
        
        # 조회 버튼 찾기 (입력창과 동일 프레임 내 우선 수색)
        search_btn = find_ele_globally(page, 'text:조회') or find_ele_globally(page, 'css:[id*="btn_search"]') or find_ele_globally(page, 'css:[id*="btnSearch"]')
        
        if search_btn:
            search_btn.click()
            if log_callback: log_callback("🚀 조회 버튼 클릭 완료!")
            return True
        
        if log_callback: log_callback("❌ 조회 버튼을 찾을 수 없습니다.")
        return False
    except Exception as e:
        if log_callback: log_callback(f"❌ 조회 중 에러: {e}")
        return False

def scrape_hyper_verify(page, search_no):
    """모든 프레임을 뒤져서 WebSquare 데이터를 추출 (DrissionPage 이식, win.frames 오류 방지)"""
    
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
                
                var hasDirection = (rowText.indexOf('수입') !== -1 || rowText.indexOf('수출') !== -1 || rowText.indexOf('반입') !== -1 || rowText.indexOf('반출') !== -1);
                var isNumberedRow = /^\d+\|/.test(rowText);
                
                if (isNumberedRow && hasDirection) {
                    results.push(rowText);
                }
            }
            // win.frames는 JS 브라우저 객체이므로 안전하게 접근 가능
            for (var i = 0; i < win.frames.length; i++) { 
                try { dive(win.frames[i]); } catch(e) {}
            }
        } catch (e) {}
    }
    dive(window);
    
    var finalData = Array.from(new Set(results));
    return finalData.length > 0 ? finalData.join('\n') : "";
    """
    
    # 최대 10초 대기하며 결과 수집
    for attempt in range(20):
        try:
            res = page.run_js(script)
            if res and '|' in res and len(res.strip()) > 10:
                return res
        except: pass
        time.sleep(0.5)
        
    # 데이터 없음 확인
    try:
        full_text = page.html
        for msg in ["데이터가 없습니다", "내역이 없습니다", "존재하지 않습니다"]:
            if msg in full_text:
                return "내역없음확인"
    except: pass
        
    return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    _log(f"DrissionPage 시작... (포트: {port}, 헤드리스: {not show_browser})")
    
    co = ChromiumOptions()
    co.set_local_port(port)
    
    # [v4.4.39] 매번 새로운 세션(게스트 모드)으로 시작하기 위해 타임스탬프 기반 고유 프로필 폴더 생성
    unique_id = int(time.time())
    import tempfile 
    # Windows/Linux 호환을 위해 tempfile 사용하거나 .tmp_profile 폴더 활용
    profile_path = os.path.join(os.path.dirname(__file__), ".tmp_profile", f"port_{port}_{unique_id}")
    if not os.path.exists(os.path.dirname(profile_path)):
        os.makedirs(os.path.dirname(profile_path), exist_ok=True)
    
    co.set_user_data_path(profile_path)
    
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--window-size=1920,1080')
    co.set_argument('--incognito') # 시크릿 모드 (게스트 모드와 유사)
    co.set_argument('--disable-blink-features=AutomationControlled')
    
    # Docker/NAS 환경 고려
    chrome_path = os.environ.get("CHROME_BIN", "/usr/bin/google-chrome")
    if os.path.exists(chrome_path):
        co.set_browser_path(chrome_path)

    if not show_browser:
        co.headless(True)
    else:
        co.headless(False)
    
    try:
        page = ChromiumPage(co)
    except Exception as e:
        _log(f"브라우저 실행 실패: {e}")
        return (None, f"브라우저 실행 실패: {e}")

    try:
        _log("이트랜스 접속 중...")
        page.get("https://etrans.klnet.co.kr/index.do")
        time.sleep(2)
        
        # 1. 이미 로그인 된 상태인지 확인
        if is_session_valid(page):
            _log("이미 로그인된 유효한 세션입니다.")
        else:
            # 2. 로그인 시도
            _log("로그인 입력창 탐색 및 입력 중...")
            close_modals(page)
            
            uid_input = page.ele('#mf_wfm_subContainer_ibx_userId', timeout=10) or \
                        page.ele('css:input[id*="ibx_userId"]')
            pw_input = page.ele('#mf_wfm_subContainer_sct_password', timeout=10) or \
                       page.ele('css:input[id*="password"]')
            
            if not uid_input or not pw_input:
                save_screenshot(page, "login_error")
                page.quit()
                return (None, "로그인 입력창을 찾을 수 없습니다.")

            uid_input.clear()
            uid_input.input(u_id.strip())
            pw_input.clear()
            pw_input.input(u_pw)
            time.sleep(0.5)
            
            login_btn = page.ele('#mf_wfm_subContainer_btn_login') or \
                        page.ele('text:로그인')
            
            if login_btn:
                login_btn.click()
            else:
                pw_input.input('\n')
            
            _log("로그인 대기 중 (최대 15초)...")
            # 로그인 성공 여부 15초간 폴링
            success = False
            for _ in range(15):
                time.sleep(1)
                close_modals(page)
                if is_session_valid(page):
                    success = True
                    break
            
            if not success:
                save_screenshot(page, "login_fail")
                page.quit()
                return (None, "로그인 성공 확인 불가 (ID/PW 확인 필요)")

        # 3. 메뉴 진입
        if open_els_menu(page, _log):
            _log("✅ 모든 준비 완료 (로그인 + 메뉴 진입)")
            return (page, None)
        
        page.quit()
        return (None, "메뉴 진입 최종 실패")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"봇 실행 중 에러: {e}")

def run_els_process(u_id, u_pw, c_list, log_callback=None, show_browser=False):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    res = login_and_prepare(u_id, u_pw, _log, show_browser=show_browser)
    page = res[0]
    if not page: return {"ok": False, "error": res[1]}

    final_rows = []
    headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD", "POL", "차량번호", "RFID"]
    
    for cn_raw in c_list:
        cn = str(cn_raw).strip().upper()
        item_log = lambda x: _log(f"{cn}: {x}")
        
        item_log("조회 분석 시작")
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
                final_rows.append([cn, "NODATA", "데이터 추출 실패"] + [""]*12)
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
    return {"ok": False, "error": "결과 없음", "total_elapsed": total_elapsed}


def extend_session(page, log_callback=None):
    """세션 연장 버튼(상단 연장) 클릭 (v4.4.39)"""
    try:
        # WebSquare 연장 버튼 ID: mf_wfm_top_btn_sessinExtension
        ext_btn = page.ele('#mf_wfm_top_btn_sessinExtension', timeout=3) or \
                  page.ele('text:연장', timeout=1)
        if ext_btn:
            ext_btn.click()
            if log_callback: log_callback("⏳ 세션 연장 버튼 클릭 완료 (60분 초기화)")
            return True
        else:
            if log_callback: log_callback("⚠️ 세션 연장 버튼을 찾을 수 없습니다.")
            return False
    except Exception as e:
        if log_callback: log_callback(f"⚠️ 세션 연장 중 오류: {e}")
        return False

def cli_main():
    config = load_config()
    u_id = config.get('user_id', '')
    u_pw = config.get('user_pw', '')
    try:
        df_in = pd.read_excel(os.path.join(os.path.dirname(__file__), "container_list.xlsx"))
        c_list = df_in.iloc[2:, 0].dropna().tolist()
        results = run_els_process(u_id, u_pw, c_list, log_callback=print)
        print(f"조회 완료: {len(results.get('sheet2', []))}건 수집")
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