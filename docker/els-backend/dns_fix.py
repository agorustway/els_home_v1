import socket
import logging
import os
from datetime import datetime

# --- 설정 ---
# [v5.6.4] 안정화 단계이므로 디버그 로그 비활성화
DEBUG_MODE = False

logger = logging.getLogger("DNS-FIX")

# 1. 원본 getaddrinfo 보관
original_getaddrinfo = socket.getaddrinfo

# 2. 강제 매핑 테이블 [v5.0.40]
# Cloudflare IPs for Supabase (pzfnrnscwudifgcctzke)
# 104.18.35.151, 172.64.149.246 등 Cloudflare Anycast IP 사용 가능
SUPABASE_IP = "172.64.149.246" 
NAS_LOCAL_IP = "192.168.0.4"

HOST_MAPPING = {
    # New Supabase Domain (Local Workspace)
    "pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "auth.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "realtime.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "storage.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "rest.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    
    # Old Supabase Domain (NAS Production Workspace - bzbowsvfsyerhpgrdrva)
    "bzbowsvfsyerhpgrdrva.supabase.co": SUPABASE_IP,
    "auth.bzbowsvfsyerhpgrdrva.supabase.co": SUPABASE_IP,
    "realtime.bzbowsvfsyerhpgrdrva.supabase.co": SUPABASE_IP,
    "storage.bzbowsvfsyerhpgrdrva.supabase.co": SUPABASE_IP,
    "rest.bzbowsvfsyerhpgrdrva.supabase.co": SUPABASE_IP,

    # NAS Local Domains (Synology DDNS)
    "elssolution.synology.me": NAS_LOCAL_IP,
    
    # Fallback for External APIs in case of total DNS failure
    "generativelanguage.googleapis.com": "142.250.199.138",
    "api.beopmang.org": "104.21.5.12"
}

def host_forced_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
        
        # FIX: Cannot use type() because 'type' is masked by the argument 'type=0'!
        host_type_name = host.__class__.__name__
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX-DEBUG] getaddrinfo called with host={repr(host)} ({host_type_name}), port={port}")
        
        if check_host in HOST_MAPPING:
            ip = HOST_MAPPING[check_host]
            if DEBUG_MODE:
                print(f"[{datetime.now()}] [DNS-FIX] Intercepted: {check_host} -> {ip}")
            # Replace host with ip (keep type consistent just in case)
            host = ip.encode('utf-8') if isinstance(host, bytes) else ip
    except Exception as e:
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] Patch error: {e}")
    return original_getaddrinfo(host, port, family, type, proto, flags)

# [v5.0.42] Socket 클래스 몽키패치 (httplib, requests 등에서 직접 socket.socket을 쓰는 경우 대응)
class PatchedSocket(socket.socket):
    def connect(self, address):
        host, port = address
        try:
            check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
            if check_host in HOST_MAPPING:
                ip = HOST_MAPPING[check_host]
                if DEBUG_MODE:
                    print(f"[{datetime.now()}] [DNS-FIX] Socket Intercepted: {check_host} -> {ip}")
                host = ip
        except:
            pass
        return super().connect((host, port))

def apply_dns_patch():
    # 1. /etc/hosts 강제 수정 시도 (가장 낮은 계층에서 해결)
    """/etc/hosts 파일을 직접 수정하여 모든 라이브러리(httpx 포함)가 강제 IP를 바라보게 만듭니다."""
    try:
        if os.name != 'nt': # 리눅스에서만 작동
            with open("/etc/hosts", "r") as f:
                content = f.read()
            
            with open("/etc/hosts", "a") as f:
                f.write("\n# [v5.0.40] DNS FIX\n")
                for host, ip in HOST_MAPPING.items():
                    if host not in content:
                        f.write(f"{ip}\t{host}\n")
            if DEBUG_MODE:
                print(f"[{datetime.now()}] [DNS-FIX] /etc/hosts updated with {len(HOST_MAPPING)} hosts.")
    except Exception as e:
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] Failed to update /etc/hosts: {e}")
        
    # [v5.0.43] 항상 몽키패치를 적용 (파일 쓰기가 성공하더라도 OS 환경에 따라 무시될 수 있으므로 이중 보장)
    if socket.getaddrinfo != host_forced_getaddrinfo:
        socket.getaddrinfo = host_forced_getaddrinfo
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] Global socket.getaddrinfo monkeypatch applied.")
        
    if socket.socket != PatchedSocket:
        socket.socket = PatchedSocket
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] Global socket.socket subclass wrapper applied.")
        
    # [v5.0.45] HTTPCore 몽키패치 추가 (가장 확실한 계층)
    try:
        import httpcore._backends.sync
        original_connect_tcp = httpcore._backends.sync.SyncBackend.connect_tcp
        
        def patched_connect_tcp(self, host, port, *args, **kwargs):
            try:
                check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
                host_type_name = host.__class__.__name__
                if DEBUG_MODE:
                    print(f"[{datetime.now()}] [DNS-FIX-DEBUG] httpcore connect_tcp called with host={repr(host)} ({host_type_name}), port={port}")
                
                if check_host in HOST_MAPPING:
                    ip = HOST_MAPPING[check_host]
                    if DEBUG_MODE:
                        print(f"[{datetime.now()}] [DNS-FIX] httpcore intercepted: {check_host} -> {ip}")
                    # Replace host with ip (keep type consistent just in case)
                    host = ip.encode('utf-8') if isinstance(host, bytes) else ip
            except Exception as e:
                if DEBUG_MODE:
                    print(f"[{datetime.now()}] [DNS-FIX] httpcore patch error: {e}")
            return original_connect_tcp(self, host, port, *args, **kwargs)
            
        httpcore._backends.sync.SyncBackend.connect_tcp = patched_connect_tcp
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] httpcore.SyncBackend.connect_tcp monkeypatch applied.")
    except Exception as e:
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] Failed to patch httpcore sync: {e}")
        
    try:
        import httpcore._backends.anyio
        original_anyio_connect = httpcore._backends.anyio.AnyIOBackend.connect_tcp
        async def patched_anyio_connect(self, host, port, *args, **kwargs):
            try:
                check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
                if check_host in HOST_MAPPING:
                    ip = HOST_MAPPING[check_host]
                    if DEBUG_MODE:
                        print(f"[{datetime.now()}] [DNS-FIX] httpcore(anyio) intercepted: {check_host} -> {ip}")
                    host = ip.encode('utf-8') if isinstance(host, bytes) else ip
            except Exception as e:
                if DEBUG_MODE:
                    print(f"[{datetime.now()}] [DNS-FIX] httpcore(anyio) patch error: {e}")
            return await original_anyio_connect(self, host, port, *args, **kwargs)
            
        httpcore._backends.anyio.AnyIOBackend.connect_tcp = patched_anyio_connect
        if DEBUG_MODE:
            print(f"[{datetime.now()}] [DNS-FIX] httpcore.AnyIOBackend.connect_tcp monkeypatch applied.")
    except Exception as e:
        pass # Ignore anyio if not present or fails

apply_dns_patch()
