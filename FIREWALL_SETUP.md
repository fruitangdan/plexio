# Firewall Setup for Plexio on macOS

## Option 1: Allow Docker through Firewall (Recommended)

1. Open **System Settings** (or **System Preferences** on older macOS)
2. Go to **Network** → **Firewall** (or **Security & Privacy** → **Firewall**)
3. Click the **Firewall Options** button (you may need to unlock with your password)
4. Look for **Docker** in the list of applications
5. If Docker is listed, make sure it's set to **Allow incoming connections**
6. If Docker is not listed, click the **+** button and add Docker Desktop

## Option 2: Allow Port 80 Specifically

If the above doesn't work, you can allow port 80 specifically:

1. Open **Terminal**
2. Run this command (you'll need to enter your password):
   ```bash
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Docker.app/Contents/MacOS/Docker
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /Applications/Docker.app/Contents/MacOS/Docker
   ```

## Option 3: Temporarily Disable Firewall (For Testing Only)

**⚠️ WARNING: Only do this for testing. Re-enable it after testing.**

1. Open **System Settings** → **Network** → **Firewall**
2. Turn off the firewall temporarily
3. Test if FireTV can access the streams
4. **Re-enable the firewall** after testing

## Verify Firewall Settings

To check if the firewall is blocking:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

To list allowed applications:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

## Important: Use Local Discovery URL

Make sure when configuring the addon, you select the **local** discovery URL (e.g., `http://192.168.0.27:32400`) instead of a remote/relay URL. The backend running in Docker needs to be able to access the Plex server, and local IPs work best.
