"""
Public base URL for Stremio addon responses.
When behind Cloudflare or PUBLIC_BASE_URL, all manifest/stream URLs must use this base
so remote clients can reach the addon and proxied streams.
"""
import ipaddress
import os

from starlette.requests import Request


def _is_private_host(host: str) -> bool:
    if not host or host in ("localhost", "127.0.0.1"):
        return True
    # Strip brackets from IPv6
    host_clean = host.strip("[]")
    try:
        ip = ipaddress.ip_address(host_clean)
        return ip.is_private or ip.is_loopback
    except ValueError:
        pass
    return False


def get_public_base_url(request: Request) -> str | None:
    """
    Return the public base URL (no trailing slash) to use for addon and stream URLs.
    - If PUBLIC_BASE_URL env is set, use it (after stripping and ensuring no trailing slash).
    - Else infer from request headers (CF-Visitor, X-Forwarded-Proto, X-Forwarded-Host, Host).
    - Default scheme to https when behind Cloudflare (CF-Visitor or X-Forwarded-Proto).
    - Returns None when we should use direct/local URLs (local dev without PUBLIC_BASE_URL).
    - Never returns a URL with localhost, 127.0.0.1, or private LAN IPs.
    """
    base = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if base:
        # Validate env URL: must not be private
        try:
            from yarl import URL

            u = URL(base)
            if _is_private_host(u.host):
                print(f"[public_url] PUBLIC_BASE_URL has private host {u.host}, ignoring")
                base = ""
            else:
                print(f"[public_url] Using PUBLIC_BASE_URL: {base}")
                return base
        except Exception as e:
            print(f"[public_url] Invalid PUBLIC_BASE_URL: {e}")
            base = ""

    # Infer from request
    scheme = "https"
    host = None
    forwarded_proto = request.headers.get("X-Forwarded-Proto")
    forwarded_host = request.headers.get("X-Forwarded-Host")
    cf_visitor = request.headers.get("CF-Visitor")  # Cloudflare: {"scheme":"https"}
    host_header = request.headers.get("Host", "")

    if cf_visitor:
        if "https" in cf_visitor.lower():
            scheme = "https"
        elif "http" in cf_visitor.lower():
            scheme = "http"
    if forwarded_proto:
        scheme = forwarded_proto.strip().lower() or scheme
    if forwarded_host:
        host = forwarded_host.split(",")[0].strip()
    if not host and host_header:
        host = host_header.split(",")[0].strip()

    if not host or _is_private_host(host):
        # Local or private: do not return a public URL
        return None

    # Strip standard ports from host if present (e.g. Host: plexio.example.com:443)
    if host.endswith(":443") and scheme == "https":
        host = host[:-4]
    elif host.endswith(":80") and scheme == "http":
        host = host[:-3]
    base = f"{scheme}://{host}"
    print(f"[public_url] Inferred public base: {base}")
    return base


def get_public_streaming_base_url(request: Request) -> str | None:
    """
    Base URL to use for proxy (stream) URLs. When set, avoids Cloudflare proxy limits.
    Uses PUBLIC_STREAMING_BASE_URL if set, otherwise same as get_public_base_url().
    """
    streaming = os.environ.get("PUBLIC_STREAMING_BASE_URL", "").strip().rstrip("/")
    if streaming:
        try:
            from yarl import URL

            u = URL(streaming)
            if _is_private_host(u.host):
                print(f"[public_url] PUBLIC_STREAMING_BASE_URL has private host, ignoring")
                streaming = ""
            else:
                print(f"[public_url] Using PUBLIC_STREAMING_BASE_URL: {streaming}")
                return streaming
        except Exception as e:
            print(f"[public_url] Invalid PUBLIC_STREAMING_BASE_URL: {e}")
            streaming = ""
    return get_public_base_url(request)
