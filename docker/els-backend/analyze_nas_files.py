import os

targets = [
    "/volume1/서울본사",
    "/volume2/아산지점",
    "/volume2/당진지점",
    "/volume2/자료실"
]

skip_words = ["#recycle", "@eaDir", "보안", "RESTRICTED", "PRIVATE", "E_임직원캐비넷", "F_Backup", "G_Downloads"]
# '자료실'은 자료실 지점 자체가 있으므로 제외 키워드에서 빼고 분석 (코드상의 필터링 로직 점검용)

supported_exts = [".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".txt", ".hwpx", ".png", ".jpg", ".jpeg", ".gif"]

def analyze():
    print(f"{'Branch Path':<30} | {'Total Files':<12} | {'Targets':<12}")
    print("-" * 60)
    
    for t in targets:
        total = 0
        target_count = 0
        if not os.path.exists(t):
            print(f"{t:<30} | {'Not Found':<12}")
            continue
            
        for root, dirs, files in os.walk(t):
            # 제외 키워드 체크 (자료실 제외)
            if any(word in root for word in skip_words):
                continue
            
            for f in files:
                total += 1
                ext = os.path.splitext(f)[1].lower()
                if ext in supported_exts:
                    target_count += 1
        
        print(f"{t:<30} | {total:<12} | {target_count:<12}")

if __name__ == "__main__":
    analyze()
