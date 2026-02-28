from PIL import Image, ImageDraw, ImageColor
import sys
import os

def remove_white_bg(img):
    img = img.convert("RGBA")
    datas = img.getdata()
    newData = []
    # Tolerance for "white"
    threshold = 240
    for item in datas:
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            # Change all white (also shades of whites) to transparent
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    return img

def create_splash():
    logo_path = 'web/public/images/logo_b.jpg'
    out_splash = 'web/public/splash.png'
    out_icon = 'web/public/icon-512.png'

    if not os.path.exists(logo_path):
        print("Logo not found")
        sys.exit(1)

    logo = Image.open(logo_path)
    
    # Remove white background
    logo = remove_white_bg(logo)

    # Calculate size for iOS format (1284 x 2778)
    splash_w, splash_h = 1284, 2778
    
    # Create background (linear gradient or solid color - solid blue from manifest #2563eb)
    # Using #0f172a or a nice navy blue like the login page
    bg_color = (30, 58, 138, 255) # Tailwind #1e3a8a
    
    splash = Image.new("RGBA", (splash_w, splash_h), bg_color)
    
    # Resize logo appropriately (if it's too small/big)
    # Make logo width 60% of screen width
    target_logo_w = int(splash_w * 0.6)
    ratio = target_logo_w / logo.width
    target_logo_h = int(logo.height * ratio)
    
    logo_resized = logo.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)
    
    # Center the logo mathematically
    offset_x = (splash_w - target_logo_w) // 2
    offset_y = (splash_h - target_logo_h) // 2
    
    splash.paste(logo_resized, (offset_x, offset_y), logo_resized)
    
    # Save splash
    splash.save(out_splash, format="png")
    print(f"Saved splash screen at {out_splash}")
    
    # Also create a transparent icon for manifest
    icon = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    # resize logo for icon
    target_icon_w = int(512 * 0.8)
    icon_ratio = target_icon_w / logo.width
    target_icon_h = int(logo.height * icon_ratio)
    
    icon_logo = logo.resize((target_icon_w, target_icon_h), Image.Resampling.LANCZOS)
    
    offset_x = (512 - target_icon_w) // 2
    offset_y = (512 - target_icon_h) // 2
    
    icon.paste(icon_logo, (offset_x, offset_y), icon_logo)
    
    icon.save(out_icon, format="png")
    print(f"Saved icon at {out_icon}")

if __name__ == "__main__":
    create_splash()
