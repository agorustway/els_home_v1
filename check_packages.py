import sys

print("=== Python 환경 확인 ===")
print(f"Python 버전: {sys.version}")
print()

packages = {
    "flask": "Flask",
    "flask_cors": "Flask-CORS",
    "pandas": "Pandas",
    "openpyxl": "OpenPyXL",
    "selenium": "Selenium",
    "webdriver_manager": "WebDriver Manager"
}

missing = []
installed = []

for module, name in packages.items():
    try:
        __import__(module)
        installed.append(name)
        print(f"✅ {name}")
    except ImportError:
        missing.append(name)
        print(f"❌ {name} - 설치 필요")

print()
if missing:
    print("⚠️  누락된 패키지:")
    print("   pip install " + " ".join(missing).lower().replace("-", "_"))
else:
    print("🎉 모든 필수 패키지가 설치되어 있습니다!")
