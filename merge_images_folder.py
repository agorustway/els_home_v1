import os
import re
from PIL import Image

# 1. 경로 설정 (반드시 본인의 경로로 다시 확인하세요)
base_path = r"C:\Users\hoon\Desktop\ilovepdf_pages-to-jpg"
output_name = "ELS_2026안전운임설명_v1.jpg"

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

# 2. 폴더 내 모든 파일 가져와서 출력해보기 (디버깅용)
all_files = os.listdir(base_path)
print(f"폴더에서 발견된 전체 파일 개수: {len(all_files)}개")

# 3. 이미지 파일 필터링 (확장자가 없는 경우도 대비)
valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff')
file_names = []

for f in all_files:
    # 이미 생성된 결과물 제외
    if f == output_name:
        continue
    
    # 확장자가 있거나, 파일명에 'page-'가 포함된 경우 이미지로 간주 시도
    if f.lower().endswith(valid_extensions) or "page-" in f:
        file_names.append(f)

# 이름 순으로 정렬
file_names.sort(key=natural_sort_key)

if not file_names:
    print("❌ 합칠 이미지 파일을 찾지 못했습니다. 확장자(.jpg 등)가 붙어있는지 확인해주세요.")
else:
    print(f"✅ 찾은 파일 목록 ({len(file_names)}개): {file_names[:3]} ... {file_names[-1:]}")

    paths = [os.path.join(base_path, f) for f in file_names]
    
    images = []
    for p in paths:
        try:
            img = Image.open(p).convert("RGB")
            images.append(img)
        except Exception as e:
            print(f"⚠️ 파일을 열 수 없습니다 ({p}): {e}")

    if not images:
        print("❌ 유효한 이미지 데이터가 없습니다.")
    else:
        # 가로 길이 통일 및 합치기 진행
        max_width = max(img.width for img in images)
        resized_images = []
        for img in images:
            if img.width != max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            resized_images.append(img)

        total_height = sum(img.height for img in resized_images)
        merged_image = Image.new("RGB", (max_width, total_height), "white")

        y_offset = 0
        for img in resized_images:
            merged_image.paste(img, (0, y_offset))
            y_offset += img.height

        output_path = os.path.join(base_path, output_name)
        merged_image.save(output_path, "JPEG", quality=95)
        print(f"✨ 완료되었습니다! 저장 위치: {output_path}")