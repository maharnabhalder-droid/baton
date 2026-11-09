import ipaddress
import socket
from urllib.parse import urlparse
import httpx
from fastapi import HTTPException, status

ALLOWED_HOSTS = {"api.github.com", "github.com", "raw.githubusercontent.com"}
MAX_RESPONSE_SIZE = 5 * 1024 * 1024  # 5 MB
REQUEST_TIMEOUT = 5.0  # seconds

def validate_and_resolve_url(target_url: str) -> str:
    parsed = urlparse(target_url)

    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SSRF Protection: Only HTTPS protocol is permitted"
        )

    hostname = parsed.hostname
    if not hostname or hostname.lower() not in ALLOWED_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"SSRF Protection: Host '{hostname}' is not in the allowed list: {list(ALLOWED_HOSTS)}"
        )

    # DNS Resolution and IP checking
    try:
        addr_info = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to resolve hostname"
        )

    for item in addr_info:
        ip_str = item[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
            is_nat64 = str(ip).startswith("64:ff9b:")
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or (ip.is_reserved and not is_nat64)
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"SSRF Protection: Resolved IP '{ip_str}' is private, loopback, or restricted"
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid IP address encountered during resolution"
            )

    return target_url

def fetch_github_file_safe(target_url: str, auth_token: str = "") -> str:
    """
    Safely fetches content from GitHub with strict SSRF protections:
    - Host allowlist
    - DNS resolution & non-routable IP filter
    - Redirects disabled
    - 5s timeout & 5MB cap
    """
    safe_url = validate_and_resolve_url(target_url)

    headers = {"User-Agent": "Baton-Handover-Fetcher/1.0"}
    if auth_token:
        headers["Authorization"] = f"token {auth_token}"

    try:
        # Disallow redirects completely to prevent redirect-based SSRF
        with httpx.Client(follow_redirects=False, timeout=REQUEST_TIMEOUT) as client:
            response = client.get(safe_url, headers=headers)
            
            if response.status_code in (301, 302, 303, 307, 308):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SSRF Protection: HTTP redirects are strictly forbidden"
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"GitHub returned status {response.status_code}"
                )

            content_bytes = response.content
            if len(content_bytes) > MAX_RESPONSE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Remote payload exceeded 5MB cap"
                )

            return content_bytes.decode("utf-8", errors="replace")

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request to GitHub timed out (5s limit)"
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error contacting GitHub: {exc}"
        )
