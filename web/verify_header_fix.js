const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components/Header.js');
const content = fs.readFileSync(filePath, 'utf8');

const checks = [
    { name: 'Inline Utility Style', pattern: /style=\{\{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' \}\}/ },
    { name: 'Inline DesktopAuth Style', pattern: /style=\{\{ display: 'flex', alignItems: 'center', gap: '10px', visibility: 'visible', opacity: 1 \}\}/ },
    { name: 'Inline Header Bg', pattern: /backgroundColor: isDarkHeader \? '#ffffff' : 'transparent'/ }
];

console.log('Verifying Header.js changes...');
checks.forEach(check => {
    if (content.includes(check.pattern.source.replace(/\\/g, ''))) { // Simple string check might fail due to formatting, using includes for key parts
        console.log(`[PASS] ${check.name}`);
    } else {
        // Fallback check for key properties
        if (check.name === 'Inline Utility Style' && content.includes("display: 'flex'") && content.includes("marginLeft: 'auto'")) {
             console.log(`[PASS] ${check.name} (Partial Match)`);
        } else if (check.name === 'Inline DesktopAuth Style' && content.includes("visibility: 'visible'") && content.includes("opacity: 1")) {
             console.log(`[PASS] ${check.name} (Partial Match)`);
        } else {
             console.log(`[FAIL] ${check.name}`);
        }
    }
});
