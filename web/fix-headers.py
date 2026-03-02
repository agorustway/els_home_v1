import os
import re

directory = "c:/Users/hoon/Desktop/els_home_v1/web/app/employees"

pattern = re.compile(r'(<div className=\{styles\.headerBanner\}>\s*<h1 className=\{styles\.title\}>[^<]*</h1>\s*)</div>\s*(<div className=\{styles\.controls\}[^>]*>.*?(?:</div>))', re.DOTALL)

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith("page.js") or file.endswith("ArchiveBrowser.js"):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            def repl(m):
                # We need to correctly capture the end of the controls div if it has nested children.
                # Actually, an easier regex is replacing </div> followed by <div className={styles.controls} ...> 
                return m.group(1) + m.group(2) + '\n            </div>'
            
            # Since the regex .*? </div> might be greedy or not greedy enough (if the controls has nested divs), 
            # I should use a simpler string replace instead or just use the multi_replace_file_content tool, but there are so many files.
            pass
