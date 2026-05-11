const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data, error } = await supabase.from('branch_dispatch').select('target_date').eq('branch_id', 'asan');
    if (error) console.error(error);
    else {
        const dates = [...new Set(data.map(d => d.target_date))].sort();
        console.log('Available dates:', dates);
    }
})();
