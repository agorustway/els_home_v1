from PIL import Image
import os

base_path = r"C:\Users\nollae\Desktop\회사소개서"

paths = [
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-0.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-1.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-2.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-3.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-4.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-5.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-6.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-7.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-8.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-9.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-10.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-11.jpg"),
    os.path.join(base_path, "[별첨1] 회사소개서-이미지-12.jpg"),
]

images = [Image.open(p) for p in paths]

# 가장 넓은 이미지 기준으로 가로 통일
max_width = max(img.width for img in images)

resized_images = []
for img in images:
    if img.width != max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height))
    resized_images.append(img)

total_height = sum(img.height for img in resized_images)

merged_image = Image.new("RGB", (max_width, total_height), "white")

y_offset = 0
for img in resized_images:
    merged_image.paste(img, (0, y_offset))
    y_offset += img.height

output_path = os.path.join(base_path, "ELS_solution_세로합본.jpg")
merged_image.save(output_path, "JPEG", quality=95)

print(f"완료: {output_path}")
