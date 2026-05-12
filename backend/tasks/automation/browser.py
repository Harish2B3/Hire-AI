import subprocess
import os
import socket
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def is_port_open(port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except:
        return False

def launch_remote_debugging_chrome():
    """
    Launches Chrome with remote debugging enabled on port 9222.
    Only runs if the port is not already occupied.
    """
    # Check if we should even try to launch (e.g. disable in CI)
    if os.environ.get("DISABLE_BROWSER_AUTO_LAUNCH") == "1":
        return

    port = 9222
    if is_port_open(port):
        print(f"[*] Port {port} is already open. Remote debugging Chrome is likely already running.")
        return

    # Common Chrome installation paths on Windows
    paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    
    chrome_path = next((p for p in paths if os.path.exists(p)), None)
    
    if not chrome_path:
        print("[!] Chrome executable not found in common Windows paths.")
        print("[!] Please set CHROME_PATH environment variable or ensure Chrome is installed.")
        return

    # Use a backend-owned browser-userdata directory for consistency.
    backend_dir = Path(__file__).resolve().parent.parent.parent
    user_data_dir = str(backend_dir / "browser-userdata" / "remote-debugging")
    if not os.path.exists(user_data_dir):
        os.makedirs(user_data_dir, exist_ok=True)

    cmd = [
        str(chrome_path),
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
    ]

    print(f"[*] Launching Chrome for Playwright remote debugging on port {port}...")
    try:
        # Chrome is a GUI app, so on Windows it naturally detaches from the parent console.
        # We don't need complex creationflags that can cause WinError 87.
        subprocess.Popen(
            cmd, 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL,
            shell=False
        )
        print(f"[*] Chrome launched with user-data-dir: {user_data_dir}")
    except Exception as e:
        print(f"[!] Failed to launch Chrome: {e}")
