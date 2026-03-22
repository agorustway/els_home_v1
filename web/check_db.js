const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'vehicle_trips' });
  if (error) {
    console.log("RPC Error (expected if not exists):", error.message);
    const { data: d2, error: e2 } = await supabase.from('vehicle_trips').insert({ 
      user_id: null,
      driver_name: 'test',
      driver_phone: 'test',
      vehicle_number: 'test',
      container_number: 'TEST',
      seal_number: 'TEST',
      container_type: '45FT',
      container_kind: 'DRY',
      status: 'driving'
    }).select();
    console.log("Insert 45FT result:", e2);
    
    // Test what values are allowed
    const types = ['20FT', '40FT', '40FT_HQ', 'ETC', '45FT'];
    for (let t of types) {
       const {data, error} = await supabase.from('vehicle_trips').insert({ 
          driver_name: 'test', vehicle_number: 'test', container_type: t, container_kind: 'DRY', status: 'completed', container_number: 'A' 
       }).select();
       if(data && data.length > 0) {
           await supabase.from('vehicle_trips').delete().eq('id', data[0].id);
       }
       console.log(`Type ${t}: ${error ? error.message : 'OK'}`);
    }
  }
}
check();
