require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data, error } = await supabase.from('branch_dispatch').select('target_date, type, headers, data').eq('branch_id', 'asan').eq('target_date', '2026-05-11');
    if (error) console.error(error);
    else {
        console.log('5/11 Records:', data.length);
        if (data.length > 0) {
            console.log('Headers:', data[0].headers);
            console.log('First 2 rows:', data[0].data.slice(0, 2));
        }
    }
})();
