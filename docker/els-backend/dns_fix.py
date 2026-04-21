import socket
import logging
import os
from datetime import datetime

logger = logging.getLogger("DNS-FIX")

# 1. 원본 getaddrinfo 보관
original_getaddrinfo = socket.getaddrinfo

# 2. 강제 매핑 테이블 [v5.0.40]
# Cloudflare IPs for Supabase (pzfnrnscwudifgcctzke)
# 104.18.35.151, 172.64.149.246 등 Cloudflare Anycast IP 사용 가능
SUPABASE_IP = "172.64.149.246" 
NAS_LOCAL_IP = "192.168.0.4"

HOST_MAPPING = {
    # Supabase Domains
    "pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "auth.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "realtime.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "storage.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    "rest.pzfnrnscwudifgcctzke.supabase.co": SUPABASE_IP,
    
    # NAS Local Domains (Synology DDNS)
    "elssolution.synology.me": NAS_LOCAL_IP,
    
    # Fallback for External APIs in case of total DNS failure
    "generativelanguage.googleapis.com": "142.250.199.138",
    "api.beopmang.org": "104.21.5.12"
}

def host_forced_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
        if check_host in HOST_MAPPING:
            ip = HOST_MAPPING[check_host]
            print(f"[{datetime.now()}] [DNS-FIX] Intercepted getaddrinfo: {check_host} -> {ip}")
            return original_getaddrinfo(ip, port, family, type, proto, flags)
    except Exception:
        pass
    return original_getaddrinfo(host, port, family, type, proto, flags)

# 3. 소켓 객체 자체를 래핑 [v5.0.43]
# C-level socket.connect() calls bypass python's getaddrinfo. We must wrap socket.socket directly.
original_socket = socket.socket

class PatchedSocket(original_socket):
    def connect(self, address):
        try:
            if isinstance(address, tuple) and len(address) >= 2:
                host = address[0]
                check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
                if check_host in HOST_MAPPING:
                    ip = HOST_MAPPING[check_host]
                    print(f"[{datetime.now()}] [DNS-FIX] PatchedSocket intercepted: {check_host} -> {ip}")
                    # If the original host was bytes, provide the IP as bytes to maintain type safety just in case
                    out_ip = ip.encode('utf-8') if isinstance(host, bytes) else ip
                    address = (out_ip,) + address[1:]
        except Exception as e:
            print(f"[{datetime.now()}] [DNS-FIX] PatchedSocket error: {e}")
        return super().connect(address)
        
    def connect_ex(self, address):
        try:
            if isinstance(address, tuple) and len(address) >= 2:
                host = address[0]
                check_host = host.decode('utf-8') if isinstance(host, bytes) else str(host)
                if check_host in HOST_MAPPING:
                    ip = HOST_MAPPING[check_host]
                    print(f"[{datetime.now()}] [DNS-FIX] PatchedSocket(ex) intercepted: {check_host} -> {ip}")
                    out_ip = ip.encode('utf-8') if isinstance(host, bytes) else ip
                    address = (out_ip,) + address[1:]
        except Exception as e:
            print(f"[{datetime.now()}] [DNS-FIX] PatchedSocket(ex) error: {e}")
        return super().connect_ex(address)

def apply_dns_patch():
    """/etc/hosts 파일을 직접 수정하여 모든 라이브러리(httpx 포함)가 강제 IP를 바라보게 만듭니다."""
    try:
        with open("/etc/hosts", "r") as f:
            content = f.read()
        
        with open("/etc/hosts", "a") as f:
            f.write("\n# [v5.0.40] DNS FIX\n")
            for host, ip in HOST_MAPPING.items():
                if host not in content:
                    f.write(f"{ip}\t{host}\n")
        print(f"[{datetime.now()}] [DNS-FIX] /etc/hosts updated with {len(HOST_MAPPING)} hosts.")
    except Exception as e:
        print(f"[{datetime.now()}] [DNS-FIX] Failed to update /etc/hosts: {e}")
        
    # [v5.0.43] 항상 몽키패치를 적용 (파일 쓰기가 성공하더라도 OS 환경에 따라 무시될 수 있으므로 이중 보장)
    if socket.getaddrinfo != host_forced_getaddrinfo:
        socket.getaddrinfo = host_forced_getaddrinfo
        print(f"[{datetime.now()}] [DNS-FIX] Global socket.getaddrinfo monkeypatch applied.")
        
    if socket.socket != PatchedSocket:
        socket.socket = PatchedSocket
        print(f"[{datetime.now()}] [DNS-FIX] Global socket.socket subclass wrapper applied.")

apply_dns_patch()
