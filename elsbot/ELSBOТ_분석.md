# elsbot 분석 (ELS 하이퍼터보 / etrans 크롤링)

## 개요

- **대상**: etrans (klnet) ELS 하이퍼터보 — 컨테이너 이동현황 조회
- **특징**: iframe·팝업·동적 그리드, Chrome 백그라운드(헤드리스) + 시간 대기 필요

## 구조

| 파일 | 역할 |
|------|------|
| `els_bot.py` | CLI용 메인: 로그인, 메뉴 진입, 조회 루프, 엑셀 저장 |
| `els_web_runner.py` | 웹 연동용: `els_bot` 함수만 사용, JSON 입출력 (parse / login / run) |
| `els_config.json` | user_id, user_pw (로컬 저장) |

## 흐름 (els_web_runner 기준)

1. **parse**  
   `container_list.xlsx` → A1=제목(컨테이너넘버), A2~ 컨테이너 번호 리스트 → JSON `{"containers": [...]}`

2. **login**  
   `login_and_prepare(id, pw)` → Chrome 헤드리스, etrans 로그인, 메뉴에서 "컨테이너 이동현황" 진입 → 성공 시 드라이버 반환, JSON `{"ok": true, "log": [...]}`

3. **run**  
   - `login_and_prepare` → 컨테이너별:
     - `solve_input_and_search(driver, cn)`: iframe 내 입력창에 번호 입력·엔터
     - `scrape_hyper_verify(driver, cn)`: 그리드에서 "수출/수입" 행만 파싱, `|` 구분 한 줄씩
   - 결과: `final_rows` (조회번호 + 파이프 구분 컬럼들)
   - 엑셀: openpyxl로 **Sheet1**(No=1만), **Sheet2**(전체), 수입/반입/ERROR·NODATA 색상
   - 임시 파일 경로 + JSON `{ "log", "sheet1", "sheet2", "output_path" }` 반환

## 엑셀 형식 (elsbot 원본과 동일)

- **Sheet1**: `No == "1"` 행만 (요약)
- **Sheet2**: 전체 행
- 컬럼: 조회번호, No, 수출입, 구분, 터미널, MOVE TIME, 모선, 항차, 선사, 적공, SIZE, POD, POL, 차량번호, RFID
- 스타일: 수입(빨강), 반입(파랑), ERROR/NODATA(빨강)

웹에서 "다운로드" 시 이 **elsbot이 만든 엑셀 파일을 그대로** 읽어서 전달하므로, 파일 내용·형식은 elsbot과 동일합니다.

## 주의사항

- **인코딩**: Node에서 Python 호출 시 `PYTHONIOENCODING=utf-8` 사용 권장. stdout가 JSON이 아닐 수 있으므로 `{` ~ `}` 구간만 잘라 파싱.
- **시간**: 로그인·페이지 로딩·그리드 대기 등 대기 시간이 길어질 수 있음 (etrans 특성).
- **헤드리스**: Chrome 백그라운드 실행이 필요하므로 서버에 Chrome/ChromeDriver(또는 webdriver_manager) 환경 필요.
