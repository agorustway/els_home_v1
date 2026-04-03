import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv("web/.env.local")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

res = supabase.from_("branch_dispatch_settings").select("*").eq("branch_id", "asan").single().execute()
print(f"ASAN Settings: {res.data}")

res_latest = supabase.from_("branch_dispatch").select("updated_at").eq("branch_id", "asan").order("updated_at", desc=True).limit(1).execute()
print(f"Latest Sync: {res_latest.data}")
