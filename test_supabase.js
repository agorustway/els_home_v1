require('dotenv').config({ path: 'web/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl) {
    console.log("No Supabase URL found in .env.local");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: logs, error } = await supabase.from('user_activity_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success! Found rows:", logs.length);
        console.log("Sample:", logs[0]);
    }
}
check();
