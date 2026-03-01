const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
let KEY = '';
let URL = '';
lines.forEach(l => {
    if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) URL = l.split('=')[1].replace(/["']/g, '').trim();
    if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) KEY = l.split('=')[1].replace(/["']/g, '').trim();
});

fetch(`${URL}/rest/v1/user_activity_logs?id=not.is.null`, {
    method: 'DELETE',
    headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Prefer': 'return=representation'
    }
}).then(r => r.text()).then(t => console.log('DELETE RESULT:', t.substring(0, 500))).catch(console.error);
