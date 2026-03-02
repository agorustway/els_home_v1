import os
import glob

files = glob.glob('c:/Users/hoon/Desktop/els_home_v1/web/app/employees/**/*.js', recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to find:
    # </div>
    # <div className={styles.controls}...>
    # ...
    # </div>
    # AND put it inside the upper <div> if it is <div className={styles.headerBanner}>
    
    if '<div className={styles.headerBanner}>' in content and 'className={styles.controls}' in content:
        # manual replace
        lines = content.split('\n')
        
        banner_start = -1
        banner_end = -1
        controls_start = -1
        controls_end = -1
        
        for i, line in enumerate(lines):
            if '<div className={styles.headerBanner}>' in line:
                banner_start = i
            if '<h1 className={styles.title}>' in line and banner_start != -1:
                banner_end = i + 1  # assuming </div> is immediately after
                
        for i, line in enumerate(lines):
            if 'className={styles.controls}' in line:
                controls_start = i
                
        if banner_start != -1 and controls_start != -1 and controls_start == banner_end + 1:
            # We assume controls block only has 1 level of nested children or is just simple
            # Let's count divs to find controls end
            div_count = 0
            for i in range(controls_start, len(lines)):
                div_count += lines[i].count('<div') - lines[i].count('</div')
                if div_count == 0:
                    controls_end = i
                    break
                    
            if controls_end != -1:
                # Move banner </div> to after controls_end
                lines.pop(banner_end)
                lines.insert(controls_end, '            </div>')
                
                with open(file, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(lines))
                print(f"Fixed {file}")

