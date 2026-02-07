# els_bot.py 경로 확인 스크립트
import els_bot
import os

print(f"els_bot module path: {els_bot.__file__}")
print(f"Absolute path: {os.path.abspath(els_bot.__file__)}")

# import time 확인
import inspect
source = inspect.getsource(els_bot)
if "import time" in source:
    print("✅ 'import time' found in els_bot.py")
else:
    print("❌ 'import time' NOT found in els_bot.py")

# login_and_prepare 함수 확인
if hasattr(els_bot, 'login_and_prepare'):
    func_source = inspect.getsource(els_bot.login_and_prepare)
    print(f"\nlogin_and_prepare function (first 500 chars):")
    print(func_source[:500])
else:
    print("❌ login_and_prepare function NOT found")
