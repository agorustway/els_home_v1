import sys
import os
import json
import time

# elsbot 폴더를 path에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify

def test_user_containers():
    u_id = "ELS1106"
    u_pw = "elss1106@"
    
    test_cns = ["TRHU6420680", "EMCU1681436"]
    
    print(f"[TEST] {u_id} 계정 정보로 로컬 테스트 시작...")
    
    driver, error = login_and_prepare(u_id, u_pw, log_callback=print, show_browser=False, port=38005)
    
    if error:
        print(f"[FAIL] 로그인 실패: {error}")
        return

    try:
        for cn in test_cns:
            print(f"\n--- [{cn}] 조회 시작 ---")
            status = solve_input_and_search(driver, cn, log_callback=print)
            print(f"조회 클릭 결과: {status}")
            
            time.sleep(2)
            grid_text = scrape_hyper_verify(driver, cn)
            if grid_text:
                print(f"데이터 추출 성공! ({len(grid_text)} bytes)")
                print(f"미리보기: {grid_text[:200]}...")
            else:
                print("데이터 추출 실패")
    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    test_user_containers()
