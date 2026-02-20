import os

def search_log(target):
    path = r'c:\Users\hoon\Desktop\els_home_v1\web\DEVELOPMENT_LOG_BACKUP.md'
    if not os.path.exists(path):
        print("File not found")
        return
    
    with open(path, 'rb') as f:
        content = f.read()
    
    lines = content.split(b'\n')
    for line in lines:
        try:
            decoded = line.decode('cp949')
            if target.lower() in decoded.lower():
                print(decoded.strip())
        except:
            try:
                decoded = line.decode('utf-8')
                if target.lower() in decoded.lower():
                    print(decoded.strip())
            except:
                pass

if __name__ == "__main__":
    import sys
    search_log(sys.argv[1] if len(sys.argv) > 1 else "WebSquare")
