import sys
import os
import json
import time

# elsbot 폴더를 path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify

def test_engine_flow():
    # 1. 설정 읽기
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "els_config.json")
    if not os.path.exists(config_path):
        print("[FAIL] els_config.json 파일이 없습니다. 테스트를 위해 로그인이 필요합니다.")
        return

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
        u_id = config.get("user_id")
        u_pw = config.get("user_pw")

    if not u_id or not u_pw:
        print("[FAIL] 설정에 ID/PW가 없습니다.")
        return

    print(f"[TEST] {u_id} 계정으로 엔진 플로우 테스트 시작 (Headless)...")
    
    # 2. 로그인 및 준비 테스트
    # Headless 모드 및 독립된 포트로 실행하여 환경 제약 최소화
    driver, error = login_and_prepare(u_id, u_pw, log_callback=print, show_browser=False, port=37000)
    
    if error:
        print(f"[FAIL] 로그인/준비 실패: {error}")
        return
    
    print("[SUCCESS] 로그인 및 메뉴 진입 성공!")

    try:
        # 3. 조회 테스트
        test_cns = ["HMMU6915674"]
        for test_cn in test_cns:
            print(f"\n[TEST] 컨테이너 조회 테스트: {test_cn}")
            
            status = solve_input_and_search(driver, test_cn, log_callback=print)
            print(f"[INFO] 조회 시도 결과: {status}")
            
            # 4. 데이터 추출 테스트
            print("[TEST] 데이터 추출(Scrape) 테스트...")
            grid_text = scrape_hyper_verify(driver, test_cn)
            
            if grid_text:
                print(f"[SUCCESS] {test_cn} 데이터 추출 성공!")
                print(f"[PREVIEW] {grid_text[:200]}...")
            else:
                print(f"[FAIL] {test_cn} 데이터 추출 실패")
            
    finally:
        print("\n[INFO] 테스트 종료.")
        if driver:
            driver.quit()

if __name__ == "__main__":
    test_engine_flow()
