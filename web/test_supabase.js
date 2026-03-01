const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
let KEY = '';
let URL = '';
lines.forEach(l => {
    if (l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) URL = l.split('=')[1].trim();
    if (l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) KEY = l.split('=')[1].trim();
});

fetch(`${URL}/rest/v1/user_activity_logs?select=*`, {
    headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`
    }
}).then(r => r.json()).then(data => {
    console.log(JSON.stringify(data, null, 2).substring(0, 1000));
}).catch(console.error);
