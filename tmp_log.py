import os

log_file = r'c:\Users\hoon\Desktop\els_home_v1\docs\02_DEVELOPMENT_LOG.md'

new_logs = """# 📔 개발 로그 (DEVELOPMENT LOG)

 ## 📅 2026-04-03 (심야) - [BOT/PERF] eTrans 조회 고속화 및 지도 렌더링 수정 (v4.5.6 ~ v4.5.7)
 ### 주제: 봇 병목 구간 완전 해소 및 프론트엔드 네이버맵 생명주기 관리
 #### 주요 내용
 - **eTrans 조회 봇 스피드업 (v4.5.7)**:
   - 기존 백그라운드 세션 키퍼가 20분마다 `main.do`로 페이지를 갱신하던 폴백 로직을 제거하여, 한 번 조회 화면에 진입한 차량은 화면 상태를 끝까지 보존하도록 개선.
   - `driver.page_ready` 상태 플래그를 도입하여 이미 입력창 화면에 대기 중인 경우 최대 2~6초가 소요되는 `open_els_menu()` 메뉴 진입 과정을 완전히 건너뛰도록(Skip) 최적화. (체감 조회 속도가 획기적으로 향상됨)
 - **상세 관제 팝업 미니맵 누락 버그 픽스 (v4.5.6)**:
   - 팝업 모달이 닫히고 열릴 때마다 네이버 지도의 기존 Instance를 재사용하려다 새 DOM 노드(`miniMapRef.current`)와 연결이 끊기는 "이동 경로 지도 미출력" 버그 해결.
   - `useEffect` 내에서 모달 오픈 시마다 무조건 `new window.naver.maps.Map` 객체를 신규 생성하도록 강제하고, 닫기 버튼에서 참조를 초기화하도록 방어 로직 추가.

"""

with open(log_file, 'r', encoding='utf-8-sig', errors='replace') as f:
    lines = f.readlines()

if lines and lines[0].strip().startswith("#"):
    old_content = "".join(lines[1:])
else:
    old_content = "".join(lines)

with open(log_file, 'w', encoding='utf-8-sig') as f:
    f.write(new_logs + old_content)

print("Prepend successful.")
