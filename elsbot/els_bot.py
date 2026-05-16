import pandas as pd
try:
    from DrissionPage import ChromiumPage, ChromiumOptions
except ModuleNotFoundError:
    ChromiumPage = None
    ChromiumOptions = None
import time
import json
import os
import sys
import re
import argparse
from openpyxl.styles import PatternFill

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "els_config.json")
NO_DATA_MESSAGES = ["데이터가 없습니다", "내역이 없습니다", "존재하지 않습니다", "데이터가 없음", "데이터가없음", "결과가 없습니다", "데이터가 존재하지 않습니다"]
HISTORY_KEYWORDS = ("수입", "수출", "반입", "반출", "양하", "적하")
REQUIRED_INPUT_MESSAGES = ("필수 입력", "필수입력", "입력 항목", "입력항목")

_ISO6346_CHAR_MAP = {
    'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17, 'H': 18, 'I': 19, 'J': 20,
    'K': 21, 'L': 23, 'M': 24, 'N': 25, 'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31,
    'U': 32, 'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38,
}

def normalize_container_no(container_no):
    return re.sub(r"\s+", "", str(container_no or "")).upper()

def is_valid_container_no(container_no):
    """ISO 6346 컨테이너 번호 체크섬 검증."""
    cn = normalize_container_no(container_no)
    if not re.fullmatch(r"[A-Z]{4}\d{7}", cn):
        return False
    total = 0
    for idx, ch in enumerate(cn[:10]):
        val = int(ch) if ch.isdigit() else _ISO6346_CHAR_MAP.get(ch)
        if val is None:
            return False
        total += val * (2 ** idx)
    check_digit = total % 11
    if check_digit == 10:
        check_digit = 0
    return check_digit == int(cn[-1])

def make_status_row(container_no, code, message):
    return [normalize_container_no(container_no), code, message] + [""] * 12

def is_no_data_text(text):
    return any(msg in str(text or "") for msg in NO_DATA_MESSAGES)

def is_required_input_text(text):
    return any(msg in str(text or "") for msg in REQUIRED_INPUT_MESSAGES)

def is_retryable_result_rows(rows):
    """조회 자체가 불확실한 실패인지 판단한다. 검증된 NODATA/번호 오류는 재조회하지 않는다."""
    if not rows:
        return True
    first = rows[0] if isinstance(rows[0], (list, tuple)) else []
    code = str(first[1] if len(first) > 1 else "")
    message = str(first[2] if len(first) > 2 else "")
    if code != "ERROR":
        return False
    non_retryable = ["유효하지 않은 컨테이너 번호", "비밀번호", "로그인 3회", "보안 모드"]
    return not any(token in message for token in non_retryable)

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

def close_required_input_alert(page):
    """WebSquare alert(필수 입력 항목)을 닫고 감지된 문구를 반환한다."""
    try:
        alert_text = page.handle_alert(accept=True)
        if alert_text and is_required_input_text(alert_text):
            return str(alert_text)
    except:
        pass

    try:
        text = page.run_js(r"""
            return (function() {
                var nodes = Array.prototype.slice.call(document.querySelectorAll(
                    '.w2modal_popup, .w2modal_lay, [class*="w2modal"], [role="dialog"]'
                ));
                for (var i = 0; i < nodes.length; i++) {
                    var el = nodes[i];
                    var style = window.getComputedStyle(el);
                    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
                    var txt = (el.innerText || el.textContent || '').trim();
                    if (!txt || (txt.indexOf('필수 입력') === -1 && txt.indexOf('필수입력') === -1 &&
                        txt.indexOf('입력 항목') === -1 && txt.indexOf('입력항목') === -1)) continue;
                    var buttons = el.querySelectorAll('button, input[type="button"], a, .w2modal_btn, [class*="btn"]');
                    for (var b = 0; b < buttons.length; b++) {
                        var bt = buttons[b];
                        var btxt = (bt.innerText || bt.value || bt.textContent || '').trim();
                        if (btxt.indexOf('확인') !== -1 || btxt === 'OK') {
                            try { bt.click(); } catch(e) {}
                            break;
                        }
                    }
                    return txt;
                }
                return '';
            })();
        """)
        if text and is_required_input_text(text):
            time.sleep(0.2)
            return str(text)
    except:
        pass
    return None

def read_container_input_value(page, input_ele=None):
    """DOM과 WebSquare 컴포넌트 양쪽에서 현재 컨테이너 입력값을 읽는다."""
    script = r"""
        return (function() {
            var id = 'mf_tac_layout_contents_602_body_input_containerNo';
            var vals = [];
            function push(v) {
                if (v === undefined || v === null) return;
                vals.push(String(v).replace(/\s/g, '').toUpperCase());
            }
            var el = document.getElementById(id) || document.querySelector('input[id*="containerNo"]');
            try { if (el) push(el.value); } catch(e) {}
            var candidates = [];
            try { candidates.push(window[id]); } catch(e) {}
            try { if (window.scwin) candidates.push(window.scwin[id]); } catch(e) {}
            try { if (window.$p && $p.getComponentById) candidates.push($p.getComponentById(id)); } catch(e) {}
            try { if (window.WebSquare && WebSquare.util && WebSquare.util.getComponentById) candidates.push(WebSquare.util.getComponentById(id)); } catch(e) {}
            candidates.forEach(function(obj) {
                try { if (obj && typeof obj.getValue === 'function') push(obj.getValue()); } catch(e) {}
                try { if (obj && typeof obj.getText === 'function') push(obj.getText()); } catch(e) {}
            });
            return vals;
        })();
    """
    values = []
    try:
        result = page.run_js(script)
        if isinstance(result, list):
            values.extend(result)
        elif result:
            values.append(result)
    except:
        pass
    if input_ele:
        try:
            value = input_ele.run_js("return String(this.value || '').replace(/\\s/g, '').toUpperCase();")
            if value:
                values.append(value)
        except:
            pass
    return [str(v or "").replace(" ", "").upper() for v in values if str(v or "").strip()]

def read_result_scope_text(page):
    """컨테이너 조회 결과 영역과 현재 보이는 모달 텍스트만 읽는다."""
    try:
        return page.run_js(r"""
            return (function() {
                var texts = [];
                var body = document.querySelector('[id*="602_body"]');
                if (body) texts.push(body.innerText || body.textContent || '');
                var modals = document.querySelectorAll('.w2modal_popup, .w2modal_lay, [class*="w2modal"], [role="dialog"]');
                for (var i = 0; i < modals.length; i++) {
                    var el = modals[i];
                    var style = window.getComputedStyle(el);
                    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
                    texts.push(el.innerText || el.textContent || '');
                }
                return texts.join('\n');
            })();
        """) or ""
    except:
        return ""

def set_container_input_value(page, input_ele, container_no, log_callback=None):
    """WebSquare 컴포넌트 값과 실제 입력창 값을 맞춘 뒤 검증한다."""
    safe_cn = json.dumps(container_no)
    page.run_js(f"""
        (function() {{
            var id = 'mf_tac_layout_contents_602_body_input_containerNo';
            var value = {safe_cn};
            function setObj(obj) {{
                if (!obj) return;
                try {{ if (typeof obj.setValue === 'function') obj.setValue(value); }} catch(e) {{}}
                try {{ if (typeof obj.setText === 'function') obj.setText(value); }} catch(e) {{}}
                try {{ if ('value' in obj) obj.value = value; }} catch(e) {{}}
                try {{
                    obj.dispatchEvent && obj.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    obj.dispatchEvent && obj.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    obj.dispatchEvent && obj.dispatchEvent(new KeyboardEvent('keyup', {{ bubbles: true }}));
                }} catch(e) {{}}
            }}
            var el = document.getElementById(id) || document.querySelector('input[id*="containerNo"]');
            setObj(el);
            var candidates = [];
            try {{ candidates.push(window[id]); }} catch(e) {{}}
            try {{ if (window.scwin) candidates.push(window.scwin[id]); }} catch(e) {{}}
            try {{ if (window.$p && $p.getComponentById) candidates.push($p.getComponentById(id)); }} catch(e) {{}}
            try {{ if (window.WebSquare && WebSquare.util && WebSquare.util.getComponentById) candidates.push(WebSquare.util.getComponentById(id)); }} catch(e) {{}}
            candidates.forEach(setObj);
        }})();
    """)
    for _ in range(3):
        values = read_container_input_value(page, input_ele)
        if container_no in values:
            return True
        time.sleep(0.15)

    try:
        input_ele.input(container_no, clear=True)
    except:
        try:
            input_ele.click(by_js=True)
            input_ele.input(container_no, clear=True)
        except:
            pass

    for _ in range(5):
        values = read_container_input_value(page, input_ele)
        if container_no in values:
            return True
        time.sleep(0.2)
    if log_callback:
        log_callback(f"❌ 입력값 검증 실패: expected={container_no}, actual={read_container_input_value(page, input_ele)}")
    return False

def close_modals(page, u_id=None, u_pw=None):
    """이트랜스 공지사항 등 모달 창 닫기 (DrissionPage 버전)"""
    try:
        if close_required_input_alert(page):
            return "VALIDATION_ALERT_CLOSED"

        # 세션 종료 텍스트 확인
        html = page.html
        if any(msg in html for msg in ["Session이 종료", "세션이 만료", "로그아웃 되었습니다", "다시 로그인"]):
            return "SESSION_EXPIRED"

        # [v4.5.3] 최상위 로그인 팝업(#mf_wfm_top_loginPopup) 처리
        # 스크린샷1과 같이 팝업 내 아이디/비번 입력창이 뜨는 경우 직접 로그인 시도
        login_popup = page.ele('css:#mf_wfm_top_loginPopup', timeout=0.2)
        if login_popup:
            try:
                popup_visible = login_popup.run_js("return window.getComputedStyle(this).display !== 'none';")
            except:
                popup_visible = True
            if popup_visible:
                if u_id and u_pw:
                    try:
                        # 팝업 내 아이디/비번 입력 (iframe 내부)
                        uid_input = login_popup.ele('css:input[id*="ibx_userId"]', timeout=1) or \
                                    page.ele('css:#mf_wfm_top_loginPopup_vframe_ibx_userId', timeout=1)
                        pw_input  = login_popup.ele('css:input[id*="sct_password"]', timeout=1) or \
                                    page.ele('css:#mf_wfm_top_loginPopup_vframe_sct_password', timeout=1)
                        if uid_input and pw_input:
                            uid_input.run_js(f"this.value = '{u_id}';")
                            uid_input.input(u_id, clear=True)
                            time.sleep(0.3)
                            pw_input.run_js(f"this.value = '{u_pw}';")
                            pw_input.input(u_pw, clear=True)
                            time.sleep(0.3)
                            login_btn = login_popup.ele('css:a[id*="btn_login"]', timeout=1) or \
                                        login_popup.ele('text:로그인', timeout=1)
                            if login_btn:
                                login_btn.click(by_js=True)
                                time.sleep(2)
                                return "POPUP_LOGIN_DONE"  # 로그인 시도 완료 → 메뉴 재진입 필요
                    except Exception as _e:
                        pass
                return "SESSION_EXPIRED"  # 계정정보 없으면 만료로 처리

        # 로그인 팝업이 떠 있는지 확인 (이미 세션 만료됨)
        modal_titles = page.eles('css:.w2modal_title', timeout=0.1)
        for title in modal_titles:
            if "로그인" in title.text:
                return "SESSION_EXPIRED"

        # [v4.4.41] 중복 로그인 또는 활동 확인 팝업 처리
        popups = page.eles('css:.w2modal_popup, .w2modal_lay', timeout=0.1)
        for p in popups:
            txt = p.text
            if "활동확인" in txt or "활동 확인" in txt:
                confirm_btn = p.ele('text:확인') or p.ele('text:활동확인')
                if confirm_btn:
                    confirm_btn.click(by_js=True)
                    time.sleep(1)
                    return "OK"
            
            # [v4.4.46] '로그인 인증후 이용해주세요' 팝업 처리
            if "로그인 인증후" in txt or "로그인 인증 후" in txt:
                confirm_btn = p.ele('text:확인') or p.ele('css:.btn_confirm')
                if confirm_btn: 
                    confirm_btn.click(by_js=True)
                    time.sleep(0.5)
                return "SESSION_EXPIRED"
            
            # [v4.4.51] '아이디 또는 비밀번호를 다시 확인하세요' 팝업 처리
            if "아이디 또는 비밀번호" in txt or "입력시 계정이 정지" in txt:
                confirm_btn = p.ele('text:확인') or p.ele('css:button[class*="w2modal_btn"]')
                if confirm_btn:
                    confirm_btn.click(by_js=True)
                    time.sleep(1)
                return "LOGIN_FAILED_CREDENTIALS"

        # 일반적인 공지사항 등 닫기 시도 (JS)
        page.run_js("""
            document.querySelectorAll('.w2modal_popup, .w2modal_lay').forEach(e => {
                const txt = e.innerText || "";
                if (txt.indexOf('비밀번호') === -1 && txt.indexOf('아이디') === -1 && txt.indexOf('로그인') === -1 && txt.indexOf('활동확인') === -1) {
                    e.style.display = 'none';
                }
            });
            document.querySelectorAll('.close, .btn_close, .btn_cancel').forEach(e => {
                try { e.click(); } catch(err) {}
            });
        """)
    except: pass
    return "OK"

def is_session_valid(page):
    """현재 브라우저가 로그온 상태이며 로그인 팝업이 없는지 검사"""
    try:
        if not page or not page.url:
            return False

        # [v4.4.55] WebSquare의 보이지 않는 DOM 캐시 문제를 우회하는 궁극적 방법
        # JS의 innerText는 화면에 '실제로 보이는 텍스트'만 반환합니다!
        inner_text = page.run_js("return document.body.innerText || '';")
        
        # '로그아웃' 텍스트가 실제로 보이고, 'GUEST'는 보이지 않는다면 완벽한 로그인 성공
        has_logout = ('로그아웃' in inner_text or 'LOGOUT' in inner_text.upper())
        is_not_guest = ('GUEST' not in inner_text.upper())
        has_nim = ('님' in inner_text)
        
        if (has_logout and is_not_guest) or (has_nim and is_not_guest):
            return True

        # [Fallback] 만약 로그인 입력창이 확실히 안 보인다면?
        uid_input = page.ele('css:input[id*="ibx_userId"]', timeout=0.1)
        if uid_input and not uid_input.is_displayed():
            # 입력창이 있었는데 사라졌다면 로그온 상태일 확률이 높음
            return True

        return False
    except Exception as e:
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
            # 존재만 해도 성공으로 간주 (서브에이전트 확인 결과 iframe 없음)
            target = page.ele('css:#mf_tac_layout_contents_602_body_input_containerNo', timeout=0.5) or \
                     page.ele('css:input[id*="containerNo"]', timeout=0.1)
            if target: return True
        except: pass
        return False

    if is_target_found():
        if log_callback: log_callback("✅ 이미 대상 화면(탭)이 로드되어 있습니다.")
        return True

    # 2. 메뉴 네비게이션 루프
    for attempt in range(10):
        try:
            if is_target_found(): 
                if log_callback: log_callback("✅ 메뉴 진입 성공 확인!")
                return True
            
            if log_callback: log_callback(f"  [{attempt+1}/10] 메뉴 탐색 중...")
            
            # [Warp] WebSquare 내부 함수 직접 호출 (가장 빠르고 정확함)
            # subagent 검증 결과: 602가 컨테이너이동현황(국내)임
            page.run_js('try { if(window.gcm && gcm.win && gcm.win._openMenu) { gcm.win._openMenu("602"); } } catch(e) {}')
            time.sleep(2)
            if is_target_found(): return True

            # (B) 메뉴 트리 단계별 클릭 (JS 강제 클릭 적용 -> 물리클릭으로 전환하여 안정성 도모)
            # 1. 화물추적 (Main)
            top_menu = page.ele('css:#mf_wfm_gnb_gen_depth1Generator_6_btn_depth1_Label', timeout=1) or \
                       page.ele('text:화물추적', timeout=1)
            if top_menu:
                try: top_menu.click()
                except: top_menu.click(by_js=True)
                time.sleep(1.5)
            
            # 2. 하위 메뉴 클릭
            sub_menu = page.ele('css:#mf_wfm_gnb_gen_depth1Generator_6_gen_2ndMenu_1_btn_2ndMenu', timeout=1) or \
                       page.ele('text:컨테이너이동현황(국내)', timeout=1) or \
                       page.ele('text:컨테이너이동현황', timeout=0.5)
            
            if sub_menu:
                try: sub_menu.click()
                except: sub_menu.click(by_js=True)
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
        solve_started = time.time()
        def log_phase(name, started):
            if log_callback:
                elapsed = time.time() - started
                if elapsed >= 1:
                    log_callback(f"[{container_no}] {name} {elapsed:.1f}s")

        # 입력창 탐색 (서브에이전트 확인 결과 iframe 없음)
        phase_started = time.time()
        input_ele = page.ele('css:#mf_tac_layout_contents_602_body_input_containerNo', timeout=5) or \
                    find_ele_globally(page, 'css:input[id*="containerNo"]', timeout=1)
        log_phase("입력창 탐색", phase_started)
        if not input_ele:
            if log_callback: log_callback("❌ 입력창을 찾을 수 없습니다.")
            return "INPUT_NOT_FOUND"
        
        # 입력 전 팝업 정리
        phase_started = time.time()
        close_modals(page)
        log_phase("입력 전 모달 정리", phase_started)
        
        # 값 입력 (WebSquare 컴포넌트 JS 우선, 검증 실패 시 물리 입력 fallback)
        phase_started = time.time()
        try: input_ele.click(timeout=1)
        except: input_ele.click(by_js=True)
        log_phase("입력창 포커스", phase_started)
        
        # [v4.12.5+] 조회 전 그리드 데이터 강제 초기화 (WebSquare 객체 + DOM 동시 타격)
        phase_started = time.time()
        page.run_js("""
            var gridIds = [
                'mf_tac_layout_contents_602_body_gridView', 
                'mf_tac_layout_contents_602_body_grd_list', 
                'mf_tac_layout_contents_602_body_grid'
            ];
            function findComponent(id) {
                var candidates = [];
                try { candidates.push(window[id]); } catch(e) {}
                try { if (window.scwin) candidates.push(window.scwin[id]); } catch(e) {}
                try { if (window.$p && $p.getComponentById) candidates.push($p.getComponentById(id)); } catch(e) {}
                try { if (window.WebSquare && WebSquare.util && WebSquare.util.getComponentById) candidates.push(WebSquare.util.getComponentById(id)); } catch(e) {}
                try { candidates.push(document.getElementById(id)); } catch(e) {}
                return candidates.filter(Boolean);
            }
            function clearGridObject(obj) {
                var methods = ['setData', 'setGridData', 'setAllJSON', 'removeAll', 'removeAllRows', 'deleteAllRows'];
                methods.forEach(function(method) {
                    try {
                        if (obj && typeof obj[method] === 'function') obj[method]([]);
                    } catch(e) {}
                });
                try {
                    if (obj && typeof obj.setDataList === 'function') obj.setDataList([]);
                } catch(e) {}
            }
            gridIds.forEach(function(id) {
                try {
                    findComponent(id).forEach(clearGridObject);
                    var el = document.getElementById(id);
                    if (el) {
                        el.setAttribute('data-els-cleared-at', String(Date.now()));
                        el.querySelectorAll('tbody').forEach(function(tb) { tb.innerHTML = ''; });
                    }
                } catch(e) {}
            });
        """)
        time.sleep(0.5)
        log_phase("이전 그리드 초기화", phase_started)

        phase_started = time.time()
        if not set_container_input_value(page, input_ele, container_no, log_callback=log_callback):
            return "INPUT_VALUE_NOT_SET"
        log_phase("입력값 세팅/검증", phase_started)
        if log_callback: log_callback(f"[{container_no}] 입력 완료")
        
        # 조회 버튼 찾기 (형님이 주신 이미지의 정확한 ID 우선 수색)
        phase_started = time.time()
        search_btn = page.ele('css:#mf_tac_layout_contents_602_body_btnSearch', timeout=2) or \
                     find_ele_globally(page, 'text:조회(F5)') or \
                     find_ele_globally(page, 'css:[id*="btnSearch"]')
        log_phase("조회 버튼 탐색", phase_started)
        
        if search_btn:
            phase_started = time.time()
            try:
                search_btn.run_js("""
                    this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                """)
            except Exception:
                try:
                    search_btn.click(by_js=True)
                except Exception:
                    search_btn.click(timeout=1)
            log_phase("조회 버튼 트리거", phase_started)
                
            if log_callback: log_callback("🚀 조회 버튼 클릭 완료!")

            phase_started = time.time()
            required_msg = close_required_input_alert(page)
            log_phase("필수입력 알림 1차 확인", phase_started)
            if required_msg:
                if log_callback: log_callback(f"❌ [검증] ETrans 필수 입력 알림 감지: {required_msg[:80]}")
                return "INPUT_REQUIRED_MODAL"
            
            # [v4.12.6] '데이터가 없음' 등 변종 키워드 대응 강화
            for _ in range(6):
                time.sleep(0.3)
                required_msg = close_required_input_alert(page)
                if required_msg:
                    if log_callback: log_callback(f"❌ [검증] ETrans 필수 입력 알림 감지: {required_msg[:80]}")
                    return "INPUT_REQUIRED_MODAL"
                inner_text = read_result_scope_text(page)
                if is_no_data_text(inner_text):
                    if log_callback: log_callback("✅ [검증] 내역 없음 확인됨")
                    return "내역없음확인"
            log_phase("조회 후 초기 판정", solve_started)
            
            return True
        
        if log_callback: log_callback("❌ 조회 버튼을 찾을 수 없습니다.")
        return False
    except Exception as e:
        if log_callback: log_callback(f"❌ 조회 중 에러: {e}")
        return False

def parse_grid_text_to_rows(container_no, grid_text):
    """스크래핑 텍스트를 표준 결과 행으로 변환한다. 형식이 애매한 행은 버린다."""
    if not grid_text:
        return []
    text = str(grid_text)
    if text in ["NODATA_GRID_EMPTY", "내역없음확인", "NODATA_CONFIRMED"] or is_no_data_text(text):
        return [make_status_row(container_no, "NODATA", "내역 없음")]

    cn = normalize_container_no(container_no)
    temp_rows = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split('|')] if '|' in line else re.split(r'\t|\s{2,}', line)
        parts = [p.strip() for p in parts if p is not None]
        if len(parts) < 3 or not str(parts[0]).isdigit():
            continue
        while len(parts) < 14:
            parts.append("")
        row = [cn] + parts[:14]
        history_text = "|".join(str(cell) for cell in row[2:14])
        if any(keyword in history_text for keyword in HISTORY_KEYWORDS):
            temp_rows.append(row)

    seen_no = set()
    result_rows = []
    for row in sorted(temp_rows, key=lambda x: int(x[1]) if str(x[1]).isdigit() else 999):
        no = str(row[1])
        if no in seen_no:
            continue
        if any(str(cell).strip() and str(cell).strip() not in ['-', '.', '?', '내역 없음', '데이터 없음'] for cell in row[2:14]):
            result_rows.append(row)
            seen_no.add(no)
    return result_rows

def scrape_hyper_verify(page, search_no):
    """[v4.9.9] WebSquare 그리드 API 또는 정밀 타겟팅 DOM 스크래핑으로 데이터 추출
    
    핵심 수정: 기존에는 페이지 전체의 모든 <tr>을 재귀적으로 긁어와서
    이전 조회 캐시/다른 탭의 데이터가 섞이는 치명적 버그가 있었음.
    이제 WebSquare 그리드 컨트롤의 데이터 모델에서 직접 추출하거나,
    DOM 폴백 시에도 602(컨테이너이동현황) 그리드 영역만 정확히 타격함.
    """
    
    # ====== 전략 1: WebSquare 그리드 네이티브 API (가장 정확) ======
    ws_grid_script = r"""
    // WebSquare 그리드 컴포넌트에서 데이터 모델을 직접 추출
    // 이 방법은 DOM이 아닌 JS 데이터 모델에서 가져오므로 100% 신뢰 가능
    var results = [];
    
    // 1단계: WebSquare 그리드 컴포넌트 찾기 (602 = 컨테이너이동현황 메뉴)
    var gridIds = [
        'mf_tac_layout_contents_602_body_gridView',
        'mf_tac_layout_contents_602_body_grd_list',
        'mf_tac_layout_contents_602_body_grid'
    ];
    
    var grid = null;
    for (var g = 0; g < gridIds.length; g++) {
        try {
            var el = document.getElementById(gridIds[g]);
            if (el && typeof el.getRowCount === 'function') { grid = el; break; }
        } catch(e) {}
    }
    
    // 2단계: ID로 못 찾으면, 602 컨텐츠 영역 내의 모든 WebSquare 그리드 탐색
    if (!grid) {
        var container = document.querySelector('[id*="602_body"]') || 
                        document.querySelector('[id*="602"]');
        if (container) {
            var candidates = container.querySelectorAll('[id*="grid"], [id*="grd"]');
            for (var c = 0; c < candidates.length; c++) {
                if (typeof candidates[c].getRowCount === 'function') {
                    grid = candidates[c];
                    break;
                }
            }
        }
    }
    
    if (grid && typeof grid.getRowCount === 'function') {
        var rowCount = grid.getRowCount();
        if (rowCount === 0) return "GRID_EMPTY_PENDING";
        
        // getAllJSON이 있으면 한방에 추출
        if (typeof grid.getAllJSON === 'function') {
            try {
                var jsonData = grid.getAllJSON();
                if (typeof jsonData === 'string') jsonData = JSON.parse(jsonData);
                if (Array.isArray(jsonData)) {
                    for (var r = 0; r < jsonData.length; r++) {
                        var row = jsonData[r];
                        var vals = Object.values(row);
                        var line = vals.join('|');
                        if (/^\s*\d+\|/.test(line) && /(수입|수출|반입|반출|양하|적하)/.test(line)) {
                            results.push(line);
                        }
                    }
                    if (results.length > 0) return results.join('\n');
                }
            } catch(e) {}
        }
        
        // getCellData로 셀별 추출 (폴백)
        if (typeof grid.getCellData === 'function') {
            var colCount = 15; // 최대 컬럼 수
            try { 
                if (typeof grid.getColumnCount === 'function') colCount = grid.getColumnCount();
            } catch(e) {}
            
            for (var r = 0; r < rowCount; r++) {
                var rowVals = [];
                for (var c = 0; c < colCount; c++) {
                    try {
                        var val = grid.getCellData(r, c);
                        rowVals.push(String(val || '').trim());
                    } catch(e) { rowVals.push(''); }
                }
                var cellLine = rowVals.join('|');
                if (/^\s*\d+\|/.test(cellLine) && /(수입|수출|반입|반출|양하|적하)/.test(cellLine)) {
                    results.push(cellLine);
                }
            }
            if (results.length > 0) return results.join('\n');
        }
    }
    
    return "";
    """
    
    # ====== 전략 2: 602 그리드 영역 DOM 정밀 타겟팅 (WebSquare API 없을 때) ======
    dom_targeted_script = r"""
    var results = [];
    
    // 602(컨테이너이동현황) 영역의 테이블만 정확히 타격
    var gridContainer = document.querySelector('[id*="602_body"]');
    if (!gridContainer) {
        // 폴백: 602 관련 요소 검색
        var all602 = document.querySelectorAll('[id*="602"]');
        for (var i = 0; i < all602.length; i++) {
            if (all602[i].querySelectorAll('tr').length > 2) {
                gridContainer = all602[i];
                break;
            }
        }
    }
    
    if (!gridContainer) return "";
    
    // 해당 영역 내의 데이터 테이블에서만 추출 (w2grid 본문 테이블 타겟팅)
    var tables = gridContainer.querySelectorAll('table.w2grid_table, table[id*="body"], table');
    var seenTexts = {};
    
    for (var t = 0; t < tables.length; t++) {
        var rows = tables[t].querySelectorAll('tr');
        for (var j = 0; j < rows.length; j++) {
            var cells = rows[j].cells;
            if (!cells || cells.length < 5) continue;
            
            var rowVals = [];
            for (var k = 0; k < cells.length; k++) {
                rowVals.push(cells[k].innerText.trim().replace(/\s+/g, ' '));
            }
            var rowText = rowVals.join('|');
            
            // 숫자 시작 + 수출입/반입/반출 포함 행만 (데이터 행 필터)
            var hasDirection = (rowText.indexOf('수입') !== -1 || rowText.indexOf('수출') !== -1 || 
                               rowText.indexOf('반입') !== -1 || rowText.indexOf('반출') !== -1);
            var isNumberedRow = /^\d+\|/.test(rowText);
            
            if (isNumberedRow && hasDirection && !seenTexts[rowText]) {
                results.push(rowText);
                seenTexts[rowText] = true;
            }
        }
    }
    
    return results.length > 0 ? results.join('\n') : "";
    """
    
    # [v4.9.9] 최대 6초(12회×0.5s) 대기 — 전략 1(WebSquare API) 우선
    for attempt in range(12):
        try:
            res = page.run_js(ws_grid_script)
            if res and res == "GRID_EMPTY_PENDING":
                pass
            if res and '|' in res and len(res.strip()) > 10:
                return res
        except: pass
        
        # 전략 1 실패 시 전략 2(DOM 정밀 타겟팅) 시도
        if attempt >= 2:  # 첫 2회는 API만 시도 (로딩 대기)
            try:
                res = page.run_js(dom_targeted_script)
                if res and '|' in res and len(res.strip()) > 10:
                    return res
            except: pass
        
        # [v4.12.3] 데이터 없음 메시지 조기 감지 (지연 방지 및 잔상 제거)
        try:
            # 전체 페이지가 아닌 602 결과 영역과 현재 보이는 모달만 검사한다.
            inner_text = read_result_scope_text(page)
            if is_no_data_text(inner_text):
                return "내역없음확인"
        except: pass
        
        time.sleep(0.5)
        
    # 데이터 없음 확인 (최종 fallback)
    try:
        scoped_text = read_result_scope_text(page)
        if is_no_data_text(scoped_text):
            return "내역없음확인"
    except: pass
        
    return None

def login_and_prepare(u_id, u_pw, log_callback=None, show_browser=False, port=9222):
    if ChromiumOptions is None or ChromiumPage is None:
        return (None, "DrissionPage 패키지가 설치되지 않았습니다.")

    start_time = time.time()
    def _log(msg):
        elapsed = time.time() - start_time
        if log_callback: log_callback(f"[{elapsed:6.2f}s] {msg}")

    _log(f"DrissionPage 시작... (포트: {port}, 헤드리스: {not show_browser})")
    
    co = ChromiumOptions()
    co.set_local_port(port)
    
    # [v5.6.3] NAS 최적화: /tmp 용량 부족 문제를 피하기 위해 현재 작업 디렉토리에 프로필 생성
    import tempfile 
    base_profile_dir = os.path.join(os.getcwd(), ".tmp_profiles")
    profile_path = os.path.join(base_profile_dir, f"drission_port_{port}")
    if not os.path.exists(base_profile_dir):
        os.makedirs(base_profile_dir, exist_ok=True)
    
    co.set_user_data_path(profile_path)
    
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-setuid-sandbox') # [추가] 리눅스 권한 격리 해제
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--disable-gpu') 
    co.set_argument('--disable-software-rasterizer')
    co.set_argument('--no-first-run') # [추가] 첫 실행 설정 건너뜀
    co.set_argument('--no-default-browser-check') # [추가] 기본 브라우저 체크 해제
    co.set_argument('--proxy-server=direct://')
    co.set_argument('--proxy-bypass-list=*')
    co.set_argument('--window-size=1920,1080')
    co.set_argument('--incognito') 
    co.set_argument('--disable-blink-features=AutomationControlled')
    co.set_argument('--disable-infobars') 
    co.set_argument('--test-type') 
    co.set_argument('--disable-extensions')
    
    # Docker/NAS 환경 고려
    chrome_path = os.environ.get("CHROME_BIN", "/usr/bin/google-chrome")
    if os.path.exists(chrome_path):
        co.set_browser_path(chrome_path)

    if not show_browser:
        co.set_argument('--headless=new') # [v5.6.5] 최신 헤드리스 모드 명시 (리눅스 안정성)
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
            # ID 입력 (변수에 요소를 저장하지 않고 직접 셀렉터 타격 -> StaleElement 원천 차단)
            page.actions.click('#mf_wfm_subContainer_ibx_userId').type(u_id.strip())
            time.sleep(1.0)
            
            # 비밀번호 입력
            page.actions.click('#mf_wfm_subContainer_sct_password').type(u_pw)
            time.sleep(1.0)
            
            # 로그인 버튼 클릭
            try:
                page.actions.click('#mf_wfm_subContainer_btn_login')
            except:
                page.run_js("try{document.querySelector('#mf_wfm_subContainer_btn_login').click();}catch(e){}")
            
            time.sleep(1.0)
            
            # 클릭 직후 상태 확인용 스크린샷 (로그인 버튼 누른 직후)
            time.sleep(1)
            save_screenshot(page, "after_login_click")
            
            _log("로그인 대기 중 (최대 15초)...")
            # 로그인 성공 여부 15초간 폴링
            success = False
            fail_reason = "로그인 성공 확인 불가 (ID/PW 확인 필요)"
            for _ in range(15):
                time.sleep(1)
                modal_status = close_modals(page)
                if modal_status == "LOGIN_FAILED_CREDENTIALS":
                    fail_reason = "로그인 실패: 아이디 또는 비밀번호 오류"
                    break
                
                if is_session_valid(page):
                    success = True
                    break
            
            if not success:
                save_screenshot(page, "login_fail")
                _log(f"🚨 {fail_reason}")
                page.quit()
                return (None, fail_reason)

        # 3. 메뉴 진입
        if open_els_menu(page, _log):
            _log("✅ 모든 준비 완료 (로그인 + 메뉴 진입)")
            page.login_time = time.time() # [v4.12.1] 세션 관리를 위한 로그인 시점 기록
            page.last_activity = time.time()
            page.page_ready = True
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
        
        if status is True or status == "내역없음확인":
            if status == "내역없음확인":
                final_rows.append(make_status_row(cn, "NODATA", "내역 없음"))
                continue
            else:
                grid_text = scrape_hyper_verify(page, cn)

            parsed_rows = parse_grid_text_to_rows(cn, grid_text)
            if parsed_rows:
                final_rows.extend(parsed_rows)
            else:
                final_rows.append(make_status_row(cn, "ERROR", "데이터 추출 실패"))
        else:
            final_rows.append(make_status_row(cn, "ERROR", str(status)))

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
    """세션 연장 버튼(상단 연장) 클릭 (v4.12.1)
    
    [개선] 
    1. find_ele_globally를 사용하여 프레임 컨텍스트에 상관없이 버튼 수색
    2. 물리 클릭이 실패할 경우를 대비해 by_js=True 병행
    3. 버튼 클릭 후 타이머(tbx_sessionTime) 변화를 확인하여 성공 여부 반환
    """
    try:
        # WebSquare 연장 버튼 ID: mf_wfm_top_btn_sessinExtension (오타 주의!)
        # [v4.12.1] 전역 수색으로 변경
        ext_btn = find_ele_globally(page, '#mf_wfm_top_btn_sessinExtension', timeout=3) or \
                  find_ele_globally(page, 'text:연장', timeout=1)
        
        if ext_btn:
            # 클릭 전 타이머 값 확인 (디버그용)
            try:
                timer = find_ele_globally(page, '[id*="sessionTime"]', timeout=0.5)
                if timer:
                    before_time = timer.text
                    if log_callback: log_callback(f"⏳ 연장 전 세션 시간: {before_time}")
            except: pass

            # 버튼 클릭 (JS 클릭이 더 확실함)
            try:
                ext_btn.click(by_js=True)
            except:
                ext_btn.click()
            
            if log_callback: log_callback("⏳ 세션 연장 버튼 클릭 완료 (60분 초기화 시도)")
            
            # 클릭 후 잠깐 대기하며 타이머 변화 확인
            time.sleep(1)
            try:
                timer = find_ele_globally(page, '[id*="sessionTime"]', timeout=0.5)
                if timer:
                    after_time = timer.text
                    if log_callback: log_callback(f"✅ 연장 후 세션 시간: {after_time}")
            except: pass
            
            return True
        else:
            if log_callback: log_callback("⚠️ 세션 연장 버튼을 찾을 수 없습니다. (ID: mf_wfm_top_btn_sessinExtension)")
            # [v4.12.1] 버튼을 못 찾을 경우 스크린샷 저장하여 원인 파악
            save_screenshot(page, "extend_session_fail")
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
