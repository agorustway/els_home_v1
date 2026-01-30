import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import time
import datetime
import ctypes
import json
import os

# 설정 파일 경로
CONFIG_FILE = "els_config.json"

def load_config():
    """마지막으로 사용한 아이디/비번 불러오기"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {"user_id": "", "user_pw": ""}

def save_config(user_id, user_pw):
    """아이디/비번 저장하기"""
    with open(CONFIG_FILE, "w") as f:
        json.dump({"user_id": user_id, "user_pw": user_pw}, f)

def open_els_menu(driver):
    """메뉴 자동 진입 (안정성 모드)"""
    for _ in range(15):
        frames = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in [None] + frames:
            try:
                if frame: driver.switch_to.frame(frame)
                target = driver.find_elements(By.XPATH, "//*[contains(text(), '컨테이너') and contains(text(), '이동현황')]")
                if target:
                    driver.execute_script("arguments[0].click();", target[0])
                    time.sleep(5); return True
            except: continue
            finally: driver.switch_to.default_content()
        time.sleep(1)
    return False

def solve_input_and_search(driver, container_no):
    """정밀 타이핑 조회 트리거"""
    frames = driver.find_elements(By.TAG_NAME, "iframe")
    for frame in [None] + frames:
        try:
            if frame: driver.switch_to.frame(frame)
            input_field = driver.find_elements(By.CSS_SELECTOR, "input[id*='containerNo']")
            if input_field:
                target = input_field[0]
                target.click()
                target.send_keys(Keys.CONTROL + "a"); target.send_keys(Keys.DELETE)
                target.send_keys(container_no); time.sleep(0.2)
                target.send_keys(Keys.ENTER)
                return True
        except: continue
        finally: driver.switch_to.default_content()
    return False

def scrape_dynamic_data(driver):
    """0.3초 단위 초스피드 캐치 로직"""
    script = """
    function getGridData(win) {
        try {
            var rows = win.document.querySelectorAll('div[id*="body_div"] tr, table[id*="body_table"] tr');
            var allData = [];
            rows.forEach(row => {
                var cells = row.querySelectorAll('td');
                if (cells.length >= 10) {
                    var rowArray = [];
                    cells.forEach(td => { rowArray.push(td.innerText.trim()); });
                    var rowStr = rowArray.join('|');
                    if ((rowStr.includes('수출') || rowStr.includes('수입')) && !rowStr.includes('RFID')) {
                        allData.push(rowStr);
                    }
                }
            });
            if (allData.length > 0) return allData.join('\\n');
            var fs = win.frames;
            for (var j = 0; j < fs.length; j++) {
                var res = getGridData(fs[j]);
                if (res) return res;
            }
        } catch(e) { return null; }
        return null;
    }
    return getGridData(window);
    """
    return driver.execute_script(script)

def run_els_crawler():
    config = load_config()
    print("--- 이엘에스(els) 마스터 자동화 봇 ---")
    
    # 기본값 보여주고 입력 받기 (엔터 치면 마지막 값 사용)
    user_id = input(f"아이디 [{config['user_id']}]: ") or config['user_id']
    user_pw = input(f"비밀번호 [{config['user_pw']}]: ") or config['user_pw']
    save_config(user_id, user_pw)

    options = webdriver.ChromeOptions()
    options.add_argument("--headless") 
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    start_all_time = time.time() # 전체 시간 측정 시작
    
    try:
        print("\n로그인 및 엔진 가동 중...")
        driver.get("https://etrans.klnet.co.kr/index.do")
        time.sleep(2)
        driver.find_element(By.ID, "mf_wfm_subContainer_ibx_userId").send_keys(user_id)
        driver.find_element(By.ID, "mf_wfm_subContainer_sct_password").send_keys(user_pw)
        driver.find_element(By.ID, "mf_wfm_subContainer_sct_password").send_keys(Keys.ENTER)
        time.sleep(10)

        if not open_els_menu(driver):
            print("메뉴 진입 실패"); return

        df_input = pd.read_excel("container_list.xlsx")
        container_list = df_input.iloc[2:, 0].dropna().tolist() 

        final_rows = []
        headers = ["조회번호", "No", "수출입", "구분", "터미널", "MOVE TIME", "모선", "항차", "선사", "적공", "SIZE", "POD(출발지)", "POL(도착지)", "차량번호", "RFID"]

        for cn in container_list:
            print(f"[{cn}] 수집 중...", end=" ", flush=True)
            if solve_input_and_search(driver, cn):
                grid_text = None
                for _ in range(35): # 최대 10초 대기
                    grid_text = scrape_dynamic_data(driver)
                    if grid_text: break
                    time.sleep(0.3) 
                
                if grid_text:
                    for line in grid_text.split('\n'):
                        parts = line.split('|')
                        final_rows.append([cn] + parts)
                    print("성공!")
                else: print("내역 없음.")

        if final_rows:
            now = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            df_result = pd.DataFrame(final_rows)
            df_result.columns = headers[:df_result.shape[1]]
            df_result.to_excel(f"els_master_report_{now}.xlsx", index=False)
            
            total_time = (time.time() - start_all_time) / 60 # 분 단위 환산
            msg = f"형, 숙제 끝났어!\n\n- 조회 건수: {len(container_list)}건\n- 소요 시간: {total_time:.1f}분"
            print(f"\n{msg}")
            ctypes.windll.user32.MessageBoxW(0, msg, "작업 완료 알림", 64)

    finally: driver.quit()

if __name__ == "__main__": run_els_crawler()