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
}

def host_forced_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in HOST_MAPPING:
        ip = HOST_MAPPING[host]
        # 릴레이 로깅 (너무 잦으면 level=DEBUG로 변경)
        # print(f"[{datetime.now()}] [DNS-FIX] Local Mapping: {host} -> {ip}")
        return original_getaddrinfo(ip, port, family, type, proto, flags)
    return original_getaddrinfo(host, port, family, type, proto, flags)

def apply_dns_patch():
    """socket.getaddrinfo를 패치하여 DNS가 없는 환경에서도 특정 도메인 접속이 가능하도록 합니다."""
    if socket.getaddrinfo != host_forced_getaddrinfo:
        socket.getaddrinfo = host_forced_getaddrinfo
        logger.info(f"[{datetime.now()}] [DNS-FIX] socket.getaddrinfo monkeypatch applied for {len(HOST_MAPPING)} hosts.")
        # print(f"[{datetime.now()}] [DNS-FIX] socket.getaddrinfo monkeypatch applied.")

if __name__ == "__main__":
    # 단독 실행 시 테스트
    apply_dns_patch()
    print(f"Test resolution: {socket.getaddrinfo('pzfnrnscwudifgcctzke.supabase.co', 443)[0][4][0]}")
