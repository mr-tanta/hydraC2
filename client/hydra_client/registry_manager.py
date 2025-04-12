import win32api
import win32con
import win32security
import win32service
import win32serviceutil
import win32ts
import ctypes
from typing import Dict, List, Optional, Union, Any
from ctypes import wintypes
import json

class RegistryManager:
    def __init__(self):
        self.advapi32 = ctypes.WinDLL('advapi32', use_last_error=True)
        
    def _open_key(
        self,
        key_path: str,
        access: int = win32con.KEY_ALL_ACCESS
    ) -> Optional[int]:
        """Open registry key"""
        try:
            return win32api.RegOpenKeyEx(
                key_path,
                0,
                access
            )
        except Exception:
            return None
            
    def _close_key(self, key: int) -> bool:
        """Close registry key"""
        try:
            win32api.RegCloseKey(key)
            return True
        except Exception:
            return False
            
    def read_value(
        self,
        key_path: str,
        value_name: str
    ) -> Optional[Any]:
        """Read registry value"""
        try:
            key = self._open_key(key_path)
            if not key:
                return None
                
            value, value_type = win32api.RegQueryValueEx(
                key,
                value_name
            )
            
            self._close_key(key)
            return value
            
        except Exception:
            return None
            
    def write_value(
        self,
        key_path: str,
        value_name: str,
        value: Any,
        value_type: int = win32con.REG_SZ
    ) -> bool:
        """Write registry value"""
        try:
            key = self._open_key(key_path)
            if not key:
                return False
                
            win32api.RegSetValueEx(
                key,
                value_name,
                0,
                value_type,
                value
            )
            
            self._close_key(key)
            return True
            
        except Exception:
            return False
            
    def delete_value(
        self,
        key_path: str,
        value_name: str
    ) -> bool:
        """Delete registry value"""
        try:
            key = self._open_key(key_path)
            if not key:
                return False
                
            win32api.RegDeleteValue(
                key,
                value_name
            )
            
            self._close_key(key)
            return True
            
        except Exception:
            return False
            
    def create_key(
        self,
        key_path: str,
        key_name: str
    ) -> Optional[int]:
        """Create registry key"""
        try:
            key = self._open_key(key_path)
            if not key:
                return None
                
            new_key = win32api.RegCreateKey(
                key,
                key_name
            )
            
            self._close_key(key)
            return new_key
            
        except Exception:
            return None
            
    def delete_key(
        self,
        key_path: str,
        key_name: str
    ) -> bool:
        """Delete registry key"""
        try:
            key = self._open_key(key_path)
            if not key:
                return False
                
            win32api.RegDeleteKey(
                key,
                key_name
            )
            
            self._close_key(key)
            return True
            
        except Exception:
            return False
            
    def list_values(
        self,
        key_path: str
    ) -> List[Dict]:
        """List registry values"""
        try:
            key = self._open_key(key_path)
            if not key:
                return []
                
            values = []
            index = 0
            
            while True:
                try:
                    name, value, type = win32api.RegEnumValue(
                        key,
                        index
                    )
                    values.append({
                        'name': name,
                        'value': value,
                        'type': type
                    })
                    index += 1
                except Exception:
                    break
                    
            self._close_key(key)
            return values
            
        except Exception:
            return []
            
    def list_keys(
        self,
        key_path: str
    ) -> List[str]:
        """List registry keys"""
        try:
            key = self._open_key(key_path)
            if not key:
                return []
                
            keys = []
            index = 0
            
            while True:
                try:
                    name = win32api.RegEnumKey(key, index)
                    keys.append(name)
                    index += 1
                except Exception:
                    break
                    
            self._close_key(key)
            return keys
            
        except Exception:
            return []
            
    def get_key_security(
        self,
        key_path: str
    ) -> Optional[Dict]:
        """Get registry key security information"""
        try:
            key = self._open_key(key_path)
            if not key:
                return None
                
            security = win32security.GetSecurityInfo(
                key,
                win32security.SE_REGISTRY_KEY,
                win32security.OWNER_SECURITY_INFORMATION |
                win32security.GROUP_SECURITY_INFORMATION |
                win32security.DACL_SECURITY_INFORMATION |
                win32security.SACL_SECURITY_INFORMATION
            )
            
            self._close_key(key)
            return {
                'owner': security[0],
                'group': security[1],
                'dacl': security[2],
                'sacl': security[3]
            }
            
        except Exception:
            return None
            
    def set_key_security(
        self,
        key_path: str,
        security_info: Dict
    ) -> bool:
        """Set registry key security information"""
        try:
            key = self._open_key(key_path)
            if not key:
                return False
                
            win32security.SetSecurityInfo(
                key,
                win32security.SE_REGISTRY_KEY,
                win32security.OWNER_SECURITY_INFORMATION |
                win32security.GROUP_SECURITY_INFORMATION |
                win32security.DACL_SECURITY_INFORMATION |
                win32security.SACL_SECURITY_INFORMATION,
                security_info.get('owner'),
                security_info.get('group'),
                security_info.get('dacl'),
                security_info.get('sacl')
            )
            
            self._close_key(key)
            return True
            
        except Exception:
            return False
            
    def backup_key(
        self,
        key_path: str,
        backup_path: str
    ) -> bool:
        """Backup registry key"""
        try:
            key = self._open_key(key_path)
            if not key:
                return False
                
            # Create backup file
            with open(backup_path, 'w') as f:
                json.dump({
                    'values': self.list_values(key_path),
                    'keys': self.list_keys(key_path),
                    'security': self.get_key_security(key_path)
                }, f, indent=4)
                
            self._close_key(key)
            return True
            
        except Exception:
            return False
            
    def restore_key(
        self,
        key_path: str,
        backup_path: str
    ) -> bool:
        """Restore registry key from backup"""
        try:
            # Read backup file
            with open(backup_path, 'r') as f:
                backup = json.load(f)
                
            # Create key if it doesn't exist
            key = self.create_key(key_path, '')
            if not key:
                return False
                
            # Restore values
            for value in backup['values']:
                self.write_value(
                    key_path,
                    value['name'],
                    value['value'],
                    value['type']
                )
                
            # Restore security
            if backup['security']:
                self.set_key_security(key_path, backup['security'])
                
            return True
            
        except Exception:
            return False 