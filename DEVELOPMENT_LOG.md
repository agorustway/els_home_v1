# 개발 로그

## 2026년 2월 4일 수요일
### els_bot.py 및 app.py 파일의 'time' 모듈 import 누락 수정
- `elsbot/els_bot.py`: `import time`이 이미 존재하여 수정하지 않음.
- `docker/els-backend/app.py`: `import time` 누락 확인 후 최상단에 추가.
- `[예외] name 'time' is not defined` 에러 해결.

### els_bot.py 엑셀 데이터 파싱 로직 수정
- `elsbot/els_bot.py` 내 `main` 함수의 파싱 로직 개선.
- `re.split` 대신 탭(`\t`)을 우선 기준으로 분리하도록 수정하여 날짜/시간 데이터의 공백 쪼개짐 방지.
- `row_data`의 길이를 검증(`len(row_data) < 5`)하고 `No` 필드의 유효성(`isdigit()`, `1 <= No <= 15`)을 추가하여 유효하지 않은 데이터 줄 필터링.
- `Sheet1`에 `No`가 '1'인 데이터만 들어가도록 하는 로직은 기존대로 유지됨 (파싱 정확도 개선으로 필터링 효과 증대).