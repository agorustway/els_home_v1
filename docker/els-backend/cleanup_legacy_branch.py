import os
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Supabase credentials missing.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def cleanup():
    print("Cleaning up '자료실' branch data...")
    
    # 1. document_chunks 삭제 (metadata->branch 가 '자료실'인 것)
    # Note: supabase-py doesn't support nested metadata filter easily in a single delete
    # But we can find source_ids from nas_file_index first
    
    res = supabase.table("nas_file_index").select("path").eq("branch", "자료실").execute()
    paths = [item['path'] for item in res.data]
    
    if paths:
        print(f"Found {len(paths)} files in '자료실' branch. Deleting chunks...")
        for p in paths:
            supabase.table("document_chunks").delete().eq("source_id", p).execute()
        
        print("Deleting file index entries...")
        supabase.table("nas_file_index").delete().eq("branch", "자료실").execute()
        print("Done.")
    else:
        print("No data found for '자료실' branch.")

if __name__ == "__main__":
    cleanup()
