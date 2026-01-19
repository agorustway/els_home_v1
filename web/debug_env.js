require('dotenv').config({ path: '.env.local' });
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('NAS_URL:', process.env.NAS_URL);
console.log('Keys present:', {
    ANON: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SERVICE: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NAS_USER: !!process.env.NAS_USER,
    NAS_PW: !!process.env.NAS_PW
});
