const fs = require('fs');
const path = require('path');

const results = [];

function assert(componentName, description, condition) {
    if (condition) {
        results.push(`[PASS] ${componentName}: ${description}`);
    } else {
        results.push(`[FAIL] ${componentName}: ${description}`);
    }
}

function checkFileContent(filePath, searchStrings) {
    try {
        const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
        return searchStrings.every(str => content.includes(str));
    } catch (e) {
        return false;
    }
}

console.log('Starting Mobile UI Verification...\n');

// 1. Header Verification
const headerLogic = checkFileContent('components/Header.js', [
    'expandedMenus',
    'toggleDropdown',
    'const [expandedMenus, setExpandedMenus] = useState([])'
]);
assert('Header', 'Multi-menu expansion logic implemented', headerLogic);

const headerStyle = checkFileContent('components/Header.module.css', [
    '.mobileNavOpen',
    '.overlayOpen',
    '.mobileLink {'
]);
assert('Header', 'Mobile navigation styles (open/overlay) defined', headerStyle);

// 2. Employees Portal Verification
const empPage = checkFileContent('app/employees/page.js', [
    'className={styles.layoutWrapper}',
    'className={styles.mainContent}'
]);
assert('Employees Page', 'Responsive layout wrapper class applied', empPage);

const empStyle = checkFileContent('app/employees/employees.module.css', [
    '@media (max-width: 1024px)',
    '.layoutWrapper {',
    'grid-template-columns: 1fr;'
]);
assert('Employees CSS', 'Mobile grid layout (1fr) configured', empStyle);

// 3. Asan Game Verification
const gameStyle = checkFileContent('app/employees/branches/asan/menu/menu.module.css', [
    '.tabs {',
    'overflow-x: auto;',
    'white-space: nowrap;'
]);
assert('Asan Game CSS', 'Horizontal scrollable tabs configured', gameStyle);

// 4. Archive Verification
const archiveStyle = checkFileContent('app/employees/(intranet)/archive/archive.module.css', [
    '.controls {',
    'overflow-x: auto;',
    'white-space: nowrap;'
]);
assert('Archive CSS', 'Horizontal scrollable controls configured', archiveStyle);


// Summary
console.log('\n--- Verification Results ---');
results.forEach(r => console.log(r));

const failures = results.filter(r => r.startsWith('[FAIL]'));
if (failures.length === 0) {
    console.log('\n✅ All Mobile UI checks passed successfully.');
} else {
    console.log(`\n❌ Found ${failures.length} issues.`);
    process.exit(1);
}
