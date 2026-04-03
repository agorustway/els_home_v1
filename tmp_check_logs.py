import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv("web/.env.local")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

res = supabase.from_("user_activity_logs").select("*").order("created_at", desc=True).limit(5).execute()
print(f"Latest Logs: {res.data}")
