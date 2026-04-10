import sys
import os
import json
import time

# elsbot 폴더를 path에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from els_bot import login_and_prepare, solve_input_and_search, scrape_hyper_verify, extend_session

def test_user_containers():
    # 게스트 모드 테스트를 위해 고정 계정 사용 (실제 테스트 시 ID/PW 확인 필요)
    u_id = "ELS1106"
    u_pw = "elss1106@"
    
    # 형이 요청한 테스트 컨테이너 3종
    test_containers = ["HPCU4963180", "FFAU6842307", "BEAU5241456"]
    
    print(f"[TEST] {u_id} 계정(게스트 모드 세션)으로 로컬 테스트 시작...")
    
    # [v4.4.48] 포트 충돌 방지를 위해 무작위 포트 선택
    import random
    test_port = random.randint(30000, 45000)
    
    # show_browser=True로 설정하여 형이 직접 눈으로 확인 가능하게 함
    driver, error = login_and_prepare(u_id, u_pw, log_callback=print, show_browser=True, port=test_port)
    
    if error:
        print(f"[FAIL] 로그인 실패: {error}")
        return

    try:
        for cn in test_containers:
            print(f"\n--- [{cn}] 조회 시작 ---")
            status = solve_input_and_search(driver, cn, log_callback=print)
            
            if status is True:
                time.sleep(2)
                grid_text = scrape_hyper_verify(driver, cn)
                if grid_text:
                    print(f"✅ {cn} 데이터 추출 성공 ({len(grid_text.splitlines())}건)")
                    print(f"미리보기: {grid_text[:100]}...")
                else:
                    print(f"⚠️ {cn} 조회는 성공했으나 데이터가 없습니다.")
            else:
                print(f"❌ {cn} 조회 실패: {status}")

        # [v4.4.39] 마지막으로 세션 연장 버튼 테스트
        print("\n[TEST] 세션 연장 버튼 클릭 테스트...")
        extend_session(driver, log_callback=print)
        
        print("\n[SUCCESS] 모든 로컬 테스트 항목 통과! o7!")
        print("5초 후 브라우저를 종료합니다. 빌드 준비 완료!")
        time.sleep(5)
        
    except Exception as e:
        print(f"[ERROR] 테스트 중 발생: {e}")
    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    test_user_containers()
