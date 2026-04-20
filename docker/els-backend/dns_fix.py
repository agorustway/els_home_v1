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
    if host in HOST_MAPPING:
        ip = HOST_MAPPING[host]
        # 릴레이 로깅 (너무 잦으면 level=DEBUG로 변경)
        # print(f"[{datetime.now()}] [DNS-FIX] Local Mapping: {host} -> {ip}")
        return original_getaddrinfo(ip, port, family, type, proto, flags)
    return original_getaddrinfo(host, port, family, type, proto, flags)

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
        logger.info(f"[{datetime.now()}] [DNS-FIX] /etc/hosts updated with {len(HOST_MAPPING)} hosts.")
    except Exception as e:
        logger.error(f"[{datetime.now()}] [DNS-FIX] Failed to update /etc/hosts: {e}")
        # Fallback to monkeypatch
        if socket.getaddrinfo != host_forced_getaddrinfo:
            socket.getaddrinfo = host_forced_getaddrinfo
            logger.info(f"[{datetime.now()}] [DNS-FIX] Fallback to monkeypatch applied.")

apply_dns_patch()
