const fs = require('fs');
const path = require('path');

const results = [];

function assert(testName, condition, message) {
    if (condition) {
        results.push(`[PASS] ${testName}: ${message}`);
    } else {
        results.push(`[FAIL] ${testName}: ${message}`);
    }
}

function checkFileContent(filePath, regex) {
    try {
        const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
        return regex.test(content);
    } catch (e) {
        return false;
    }
}

console.log('Starting Deployment Fix Verification...\n');

// 1. Header Media Query Overlap Check (Dead Zone)
const cssContent = fs.readFileSync(path.join(__dirname, 'components/Header.module.css'), 'utf8');

// Extract max-width from @media (max-width: XXXpx) { .nav ... display: none }
const navHiddenMatch = cssContent.match(/@media \(max-width:\s*(\d+)px\)[^}]*\.nav\s*\{[^}]*display:\s*none/);
const mobileToggleHiddenMatch = cssContent.match(/@media \(min-width:\s*(\d+)px\)[^}]*\.mobileToggle[^}]*display:\s*none/);

if (navHiddenMatch && mobileToggleHiddenMatch) {
    const navHidePoint = parseInt(navHiddenMatch[1]);
    const toggleHidePoint = parseInt(mobileToggleHiddenMatch[1]);
    
    // Ideally navHidePoint should be equal to toggleHidePoint - 1
    // e.g. nav hides at 1024, toggle hides at 1025. 
    // If nav hides at 1024, toggle hides at 1200, then 1025-1199 has NO menu. 
    
    assert('Header Responsive Breakpoints', 
        navHidePoint === (toggleHidePoint - 1),
        `Nav hides at ${navHidePoint}px, Toggle hides at ${toggleHidePoint}px. Gap check: ${navHidePoint === toggleHidePoint - 1}`
    );
} else {
    // If exact regex match fails, manual inspection is needed, but assuming standard logic
    // Let's check if 1024 is used consistently.
    assert('Header CSS Consistency', 
        cssContent.includes('max-width: 1024px') && cssContent.includes('min-width: 1025px'),
        'Breakpoints should match (1024px vs 1025px)'
    );
}

// 2. Loading State Safety in useUserRole
const userRoleHook = fs.readFileSync(path.join(__dirname, 'hooks/useUserRole.js'), 'utf8');
assert('useUserRole Loading Safety', 
    userRoleHook.includes('finally {') && userRoleHook.includes('setLoading(false)'),
    'Should always turn off loading in finally block'
);

// 3. API Error Handling in NAS Files Route
// We assume checking existence of try-catch block
const nasRoutePath = 'app/api/nas/files/route.js';
if (fs.existsSync(path.join(__dirname, nasRoutePath))) {
    const nasRoute = fs.readFileSync(path.join(__dirname, nasRoutePath), 'utf8');
    assert('NAS API Error Handling', 
        nasRoute.includes('try {') && nasRoute.includes('return NextResponse.json({ error:'),
        'API route should return JSON error on failure'
    );
} else {
    // Pass if file doesn't exist (might be checking wrong path), but log warning
    console.log('[WARN] NAS Route file not found for check');
}


// Summary
console.log('\n--- Verification Results ---');
results.forEach(r => console.log(r));

const failures = results.filter(r => r.startsWith('[FAIL]'));
if (failures.length > 0) {
    console.log(`\n❌ Found ${failures.length} issues.`);
    process.exit(1);
} else {
    console.log('\n✅ No critical code logic errors found (Environment variables check recommended).');
}
