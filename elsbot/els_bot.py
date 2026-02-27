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
        # 로그인 팝업이 떠 있는지 확인 (이미 세션 만료됨)
        # WebSquare 특유의 모달 타이틀 확인
        modal_titles = page.eles('css:.w2modal_title')
        for title in modal_titles:
            if "로그인" in title.text:
                return "SESSION_EXPIRED"

        # 일반적인 공지사항 등 닫기 시도
        page.run_js("""
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => {
                // '로그인' 팝업은 자바스크립트로 닫지 말고 그냥 숨겨버리면 안 됨 (세션이 이미 없음)
                if (e.innerText.indexOf('로그인') === -1) {
                    e.style.display = 'none';
                }
            });
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => e.click());
        """)
    except: pass
    return "OK"

def is_session_valid(page):
    """현재 브라우저가 로그온 상태이며 로그인 팝업이 없는지 철저히 검사"""
    try:
        # 1. URL 체크 (로그인 페이지로 튕겼는지)
        if "login" in page.url.lower() and "main" not in page.url.lower():
            return False
            
        # 2. 로그인 팝업 체크
        modal_titles = page.eles('css:.w2modal_title')
        for title in modal_titles:
            if "로그인" in title.text:
                return False
        
        # 3. 로그아웃 버튼 존재 여부 (가장 확실함)
        if page.ele('text:로그아웃') or page.ele('text:LOGOUT'):
            return True
            
        return False
    except:
        return False

def open_els_menu(page, log_callback=None):
    if log_callback: log_callback("메뉴 진입 시도 중 (DrissionPage)...")
    
    for attempt in range(5):
        close_modals(page)
        
        # 조회 페이지 도착 확인 (입력창 탐지)
        if page.ele('css:input[id*="containerNo"]', timeout=3):
            if log_callback: log_callback("✅ 조회 페이지 도착 확인!")
            return True

        # 메인 페이지(main.do)가 아니면 이동
        if "main" not in page.url.lower():
            if log_callback: log_callback("메인 화면으로 이동 시도...")
            page.get("https://etrans.klnet.co.kr/main.do")
            time.sleep(5)
            close_modals(page)

        # 1단계: 상위 메뉴 '화물추적' 클릭
        parent = page.ele('text:화물추적', timeout=2)
        if parent:
            if log_callback: log_callback(f"상위 메뉴 클릭: {parent.text}")
            parent.click(by_js=True)
            time.sleep(2)
            
            # 2단계: 하위 메뉴 '컨테이너이동현황(국내)' 클릭
            target = page.ele('text:컨테이너이동현황(국내)', timeout=3) or \
                     page.ele('text:컨테이너 이동현황', timeout=2)
            if target:
                if log_callback: log_callback(f"하위 메뉴 클릭: {target.text}")
                target.click(by_js=True)
                time.sleep(5) # 탭 열리고 렌더링될 때까지 대기
                save_screenshot(page, "debug")
            else:
                if log_callback: log_callback("하위 메뉴를 찾을 수 없습니다.")
        else:
            if log_callback: log_callback("상위 메뉴(화물추적)를 찾을 수 없습니다.")
            save_screenshot(page, "debug")
            time.sleep(3)
        
    return False

def solve_input_and_search(page, container_no, log_callback=None):
    """[WebSquare 특화] DrissionPage로 값 설정 + 조회 버튼 클릭"""
    try:
        # 입력창 찾기
        input_ele = page.ele('css:input[id*="containerNo"]', timeout=5)
        if not input_ele:
            if log_callback: log_callback(f"[{container_no}] 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"

        # 값 입력 (기존 텍스트 삭제 후 입력)
        input_ele.clear()
        input_ele.input(container_no)
        
        # 조회 버튼 클릭
        btn = page.ele('css:[id*="btnSearch"]', timeout=2)
        if not btn:
            # 텍스트로 찾기
            btn = page.ele('text:조회', timeout=2)
        
        if btn:
            btn.click()
        else:
            input_ele.input('\n') # 엔터키

        if log_callback: log_callback(f"[{container_no}] 조회 버튼 클릭 완료")
        
        # 🎯 [NAS 최적화] WebSquare 로딩 지연 및 알럿 메시지 감지
        time.sleep(1.5) 
        
        # 1. 알럿 메시지 확인 (내역 없음 등)
        try:
            alert_text = page.handle_alert(timeout=1)
            if alert_text:
                if any(msg in alert_text for msg in ["데이터가 없습니다", "내역이 없습니다", "존재하지 않습니다", "입력하세요"]):
                    if log_callback: log_callback(f"[{container_no}] 결과 메시지: {alert_text}")
                    return "내역없음확인"
        except: pass

        # 2. 로딩바 사라질 때까지 대기 (최대 10초)
        for _ in range(20):
            # WebSquare 로딩바 (mf_progress 등) 존재 여부 및 가시성 체크
            spinner = page.ele('css:[id*="_progress_"]', timeout=0.1) or \
                      page.ele('css:.w2group_mf_progress', timeout=0.1)
            # 요소가 없거나, 스타일이 none이거나, 투명도가 0이면 완료된 것으로 간주
            if not spinner: break
            try:
                style = spinner.attrs.get('style', '')
                if 'display: none' in style or 'visibility: hidden' in style: break
            except: break
            time.sleep(0.5)

        return True
    except Exception as e:
        return str(e)

def scrape_hyper_verify(page, search_no):
    """모든 프레임을 뒤져서WebSquare 데이터를 추출 (DrissionPage 이식)"""
    
    script = r"""
    var searchNo = arguments[0].replace(/[^A-Z0-9]/g, '').toUpperCase();
    var results = [];
    
    function dive(win) {
        try {
            var rows = win.document.querySelectorAll('tr');
            for (var j = 0; j < rows.length; j++) {
                var cells = rows[j].cells;
                if (!cells || cells.length < 5) continue;
                
                var rowVals = [];
                for (var k = 0; k < cells.length; k++) {
                    // 🎯 innerText 추출 시 불필요한 공백 제거
                    rowVals.push(cells[k].innerText.trim().replace(/\s+/g, ' '));
                }
                var rowText = rowVals.join('|');
                
                // 🎯 [복구] 행별 체크가 아니라 일단 모든 데이터 후보를 수집
                if (/^\d+\|/.test(rowText) && (rowText.indexOf('수입') !== -1 || rowText.indexOf('수출') !== -1 || rowText.indexOf('반입') !== -1 || rowText.indexOf('반출') !== -1)) {
                    results.push(rowText);
                }
            }
            for (var i = 0; i < win.frames.length; i++) { dive(win.frames[i]); }
        } catch (e) {}
    }
    dive(window);
    
    // 🎯 [정합성 강화] 수집된 결과물 중 '진짜' 데이터(컨테이너 번호 포함)가 있는지 최종 확인
    var finalData = Array.from(new Set(results));
    var hasTarget = finalData.some(function(line) {
        return line.replace(/[^A-Z0-9]/g, '').indexOf(searchNo) !== -1;
    });

    return hasTarget ? finalData.join('\n') : "";
    """
    
    for _ in range(10):
        try:
            res = page.run_js(script, search_no)
            if res and '|' in res and len(res.strip()) > 10:
                return res
        except: pass
        time.sleep(1)
        
    # 데이터 없음 2차 확인 (텍스트 기반)
    try:
        full_text = page.html
        for msg in ["데이터가 없습니다", "내역이 없습니다", "데이터가 존재하지 않습니다", "결과가 없습니다"]:
            if msg in full_text:
                return "내역없음확인"
    except: pass
        
    return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    _log(f"DrissionPage 시작 (포트: {port}, 화면: {show_browser})")
    
    co = ChromiumOptions()
    co.set_local_port(port) # 병렬 처리를 위해 포트 지정
    
    # 병렬 처리 시 프로필 충돌 방지를 위해 포트별 별도 데이터 디렉토리 사용
    user_data_dir = f"/tmp/drission_port_{port}"
    co.set_user_data_path(user_data_dir)
    
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--window-size=1920,1080')
    co.set_argument('--disable-blink-features=AutomationControlled')
    
    # Docker/NAS 환경 고려: CHROME_BIN 환경 변수 우선 사용
    chrome_path = os.environ.get("CHROME_BIN", "/usr/bin/google-chrome")
    if not os.path.exists(chrome_path):
        # 만약 설정된 경로에 없으면 chromium도 시도
        if os.path.exists("/usr/bin/chromium"):
            chrome_path = "/usr/bin/chromium"
        elif os.path.exists("/usr/bin/chromium-browser"):
            chrome_path = "/usr/bin/chromium-browser"
    
    if os.path.exists(chrome_path):
        _log(f"브라우저 경로 설정: {chrome_path}")
        co.set_browser_path(chrome_path)
    else:
        _log("경고: 명시된 브라우저 경로를 찾을 수 없습니다. 시스템 기본값을 시도합니다.")

    if not show_browser:
        co.set_argument('--headless=new')
        co.headless(True)
    
    try:
        from DrissionPage.errors import BrowserConnectError
        _log("ChromiumPage 인스턴스 생성 중...")
        page = ChromiumPage(co)
        _log("ChromiumPage 생성 완료.")
    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()
        _log(f"브라우저 실행 실패: {str(e)}\n{err_detail}")
        if 'page' in locals() and page: page.quit()
        return (None, f"브라우저 실행 실패: {e}")

    try:
        _log("이트랜스 접속 중 (etrans.klnet.co.kr)...")
        page.get("https://etrans.klnet.co.kr/index.do")
        _log("페이지 로드 완료. ID 입력창 탐색 중...")
        save_screenshot(page, "debug") # [추가] 초기 화면 캡처
        
        # [NAS 최적화] WebSquare 초기 렌더링 지연 고려하여 타임아웃 60초로 연장
        uid_input = page.ele('#mf_wfm_subContainer_ibx_userId', timeout=60)
        if not uid_input:
            save_screenshot(page, "debug_error")
            page.quit()
            return (None, "로그인 페이지 로드 실패")

        uid_input.clear()
        uid_input.input(u_id.strip())
        if uid_input.value != u_id.strip():
            page.run_js(f"document.querySelector('#mf_wfm_subContainer_ibx_userId').value = '{u_id.strip()}';")
        
        pw_input = page.ele('#mf_wfm_subContainer_sct_password')
        pw_input.clear()
        pw_input.input(u_pw)
        if pw_input.value != u_pw:
            page.run_js(f"document.querySelector('#mf_wfm_subContainer_sct_password').value = '{u_pw}';")
        
        time.sleep(1) # 입력 후 잠시 대기
        
        # 로그인 버튼 클릭 시도
        login_btn = page.ele('#mf_wfm_subContainer_btn_login', timeout=5)
        if login_btn:
            _log(f"로그인 버튼 탐지 성공: (ID: {login_btn.attr('id')})")
            # 1. 엔터 입력 (대부분의 웹환경에서 가장 확실함)
            pw_input.input('\n')
            time.sleep(1)
            # 2. 버튼 클릭 (혹시 엔터가 안 먹힐 경우 대비)
            try: login_btn.click()
            except: pass
        
        _log("로그인 처리 대기 중...")
        
        # [NAS 최적화] 로그인 후 페이지 전환 및 WebSquare 렌더링을 위해 최대 60초 대기
        login_verified = False
        for i in range(12): # 5초씩 12회 = 60초
            time.sleep(5)
            save_screenshot(page, "debug") # [추가] 로그인 대기 중 실시간 캡처
            close_modals(page)
            # 성공 지표: '로그아웃' 버튼 또는 '님 안녕하세요' 텍스트
            if page.ele('text:로그아웃', timeout=1) or page.ele('text:님 안녕하세요', timeout=1):
                _log("✅ 로그인 성공 확인!")
                save_screenshot(page, "debug") # [추가] 로그인 성공 직후 캡처
                login_verified = True
                break
            
            # 페이지 내 '손님(GUEST)' 텍스트가 사라졌는지 확인
            if "손님(GUEST)" not in page.html and not page.ele('text:로그인', timeout=1):
                # GUEST도 아니고 로그인 버튼도 없으면 로딩 중일 가능성이 큼
                _log(f"로그인 처리 중 (로딩)... { (i+1)*5 }s")
                continue
            
            _log(f"로그인 대기 중... { (i+1)*5 }s")
            # 알림창(비번 만료 등)이 뜨면 확인 후 닫기
            check_alert(page)
        
        if not login_verified:
             _log("로그인 성공 확인 불가 (GUEST 상태 지속 또는 타임아웃)")
             # 실패해도 일단 메뉴 진입 시도는 해봄 (간혹 탐지가 안될 수 있음)
             # 여기서 종료하지 않고 일단 메뉴 진입 시도 (URL 접근으로 해결될 수도 있음)

        if open_els_menu(page, _log):
            _log("✅ 메뉴 진입 성공")
            return (page, None)
        
        # 실패 시 스크린샷 저장 (데몬에서 확인 가능)
        save_screenshot(page, "debug")
        final_url = page.url
        _log(f"메뉴 진입 최종 실패 (URL: {final_url}) - 스크린샷 저장됨")
        page.quit()
        return (None, f"메뉴 진입 실패 (마지막 URL: {final_url})")
    except Exception as e:
        if 'page' in locals() and page: page.quit()
        return (None, f"에러: {e}")

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
        item_start = time.time()
        cn = str(cn_raw).strip().upper()
        
        def _item_log(msg):
            item_elapsed = time.time() - item_start
            if log_callback: log_callback(f"{cn}: {msg} ({item_elapsed:.1f}s)")

        _item_log(f"분석 시작...")
        status = solve_input_and_search(page, cn, _item_log)
        
        if status is True:
            grid_text = scrape_hyper_verify(page, cn)
            if grid_text:
                found_any = False
                lines = grid_text.split('\n')
                for line in lines:
                    stripped = line.strip()
                    if not stripped: continue
                    row_data = stripped.split('|')
                    if row_data and str(row_data[0]).isdigit():
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

def cli_main():
    config = load_config()
    u_id = config.get('user_id', '')
    u_pw = config.get('user_pw', '')
    try:
        df_in = pd.read_excel(os.path.join(os.path.dirname(__file__), "container_list.xlsx"))
        c_list = df_in.iloc[2:, 0].dropna().tolist()
        results = run_els_process(u_id, u_pw, c_list, log_callback=print)
        print(f"조회 완료: {len(results.get('sheet2', []))}건 기록됨")
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
            try: c_list = json.loads(args.containers)
            except: c_list = [x.strip() for x in args.containers.split(',') if x.strip()]
        else: c_list = []
        u_id = args.user_id if args.user_id else load_config().get('user_id')
        u_pw = args.user_pw if args.user_pw else load_config().get('user_pw')
        
        final_res = run_els_process(u_id, u_pw, c_list, log_callback=lambda x: print(f"LOG:{x}", flush=True))
        print(f"RESULT:{json.dumps(final_res, ensure_ascii=False)}", flush=True)
    else:
        cli_main()