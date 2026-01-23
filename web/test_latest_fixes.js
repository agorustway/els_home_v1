const fs = require('fs');
const path = require('path');

const results = [];
function assert(testName, condition, message) {
    if (condition) results.push(`[PASS] ${testName}: ${message}`);
    else results.push(`[FAIL] ${testName}: ${message}`);
}

console.log('--- Latest Fixes Verification ---\n');

// 1. Check login/page.js for useState and redirect logic
const loginPage = fs.readFileSync(path.join(__dirname, 'app/login/page.js'), 'utf8');
assert('Login useState', loginPage.includes('useState'), 'useState should be imported');
assert('Login redirect logic', loginPage.includes('document.referrer') || loginPage.includes('setNext'), 'Should have back-redirection logic');

// 2. Check board.module.css for mobile column styles
const boardCss = fs.readFileSync(path.join(__dirname, 'app/employees/(intranet)/board/board.module.css'), 'utf8');
assert('Board Mobile Title', boardCss.includes('.colTitle') && boardCss.includes('font-size: 1.15rem'), 'Mobile title should be 1.15rem');
assert('Board Mobile Metadata', boardCss.includes('.colAuthor') && boardCss.includes('font-size: 0.78rem'), 'Mobile metadata should be 0.78rem');

// 3. Check BranchPage for fixed params handling
const branchPage = fs.readFileSync(path.join(__dirname, 'app/employees/branches/[branch]/page.js'), 'utf8');
assert('BranchPage Params', !branchPage.includes('use(params)'), 'Should not use use(params) hook (Direct access preferred in this setup)');
assert('BranchPage Full List', branchPage.includes('asan_cy') && branchPage.includes('bulk'), 'Should have full branch list mapping');

// 4. Check Header for full branch list
const header = fs.readFileSync(path.join(__dirname, 'components/Header.js'), 'utf8');
assert('Header Branches', header.includes('asan_cy') && header.includes('bulk'), 'Dropdown should have all branches');

console.log('\n--- Results ---');
results.forEach(r => console.log(r));

if (results.some(r => r.startsWith('[FAIL]'))) {
    console.log('\n❌ Verification failed.');
    process.exit(1);
} else {
    console.log('\n✅ All checks passed.');
}
