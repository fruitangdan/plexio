# Streaming subdomain setup

## Single domain (recommended)

You can use **only** `plexio.fruitangdan.com` for both the addon and streaming. The app is configured this way by default: manifest and proxy (stream) URLs use `PUBLIC_BASE_URL`. No second hostname or DNS record is required; just point the tunnel at `plexio.fruitangdan.com` and rebuild/install.

---

## Optional: separate stream subdomain (stream.fruitangdan.com)

If you previously used a separate stream hostname, use a **single-level** subdomain so Cloudflare's Universal SSL covers it.  
`stream.plexio.fruitangdan.com` is two levels and is **not** covered by Universal SSL (certificate warning / connection failure). Use **stream.fruitangdan.com** instead.

## 1. On the Mac mini (tunnel)

SSH in: `ssh macmini`

**Edit the tunnel config:**

```bash
sudo nano /etc/cloudflared/config.yml
```

Use **stream.fruitangdan.com** (one subdomain level) in `ingress`:

```yaml
tunnel: 31e25273-1693-4a3e-83b8-4727d6f766cc
credentials-file: /etc/cloudflared/31e25273-1693-4a3e-83b8-4727d6f766cc.json

ingress:
  - hostname: plexio.fruitangdan.com
    service: http://localhost:8000
  - hostname: stream.fruitangdan.com
    service: http://localhost:8000
  - service: http_status:404
```

Save (Ctrl+O, Enter, Ctrl+X), then **restart the tunnel:**

```bash
sudo launchctl kickstart -k system/com.cloudflare.cloudflared
```

Check it’s running: `ps aux | grep cloudflared | grep -v grep`

## 2. In Cloudflare DNS

- Go to **Cloudflare Dashboard** → **fruitangdan.com** → **DNS** → **Records**.
- **Remove** the old **stream.plexio** record if it exists.
- **Add record** for the single-level subdomain:
  - **Type:** CNAME (or Tunnel if you use `cloudflared tunnel route dns`)
  - **Name:** `stream`
  - **Target:** `31e25273-1693-4a3e-83b8-4727d6f766cc.cfargotunnel.com` (if CNAME)
  - **Proxy status:** **Proxied** (orange cloud) so SSL works, or **DNS only** to try avoiding 520 on large streams
- **Save.**

Leave the existing **plexio** record as **Proxied** (orange cloud).

## 3. Rebuild and install the app

The app is configured to use `https://stream.fruitangdan.com` for stream URLs when built for production:

```bash
npm run build
npm run mac:install
```

Then open Plexio on the Mac mini and try playback again.

---

## Reverting (back to current state)

If streaming still doesn’t work and you want to undo:

1. **Cloudflare DNS:** Delete the **stream** record.
2. **Mac mini:** Edit `/etc/cloudflared/config.yml` and remove the `stream.fruitangdan.com` hostname block. Restart: `sudo launchctl kickstart -k system/com.cloudflare.cloudflared`
3. Rebuild/reinstall the app (or leave it; stream URLs will fall back to the main base URL if the streaming hostname isn’t set).
