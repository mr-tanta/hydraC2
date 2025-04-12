import os
import psutil
import win32process
import win32api
import win32con
import win32security
import win32event
import win32service
import win32serviceutil
import win32ts
import ctypes
from typing import List, Dict, Optional, Union
from ctypes import wintypes

class ProcessManager:
    def __init__(self):
        self.kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        self.advapi32 = ctypes.WinDLL('advapi32', use_last_error=True)
        
    def get_process_list(self) -> List[Dict]:
        """Get list of all processes"""
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_percent']):
            try:
                pinfo = proc.info
                processes.append({
                    'pid': pinfo['pid'],
                    'name': pinfo['name'],
                    'username': pinfo['username'],
                    'cpu_percent': pinfo['cpu_percent'],
                    'memory_percent': pinfo['memory_percent']
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return processes
        
    def get_process_info(self, pid: int) -> Optional[Dict]:
        """Get detailed information about a specific process"""
        try:
            proc = psutil.Process(pid)
            return {
                'pid': proc.pid,
                'name': proc.name(),
                'username': proc.username(),
                'cpu_percent': proc.cpu_percent(),
                'memory_percent': proc.memory_percent(),
                'create_time': proc.create_time(),
                'status': proc.status(),
                'num_threads': proc.num_threads(),
                'num_handles': proc.num_handles(),
                'io_counters': proc.io_counters()._asdict() if proc.io_counters() else None,
                'connections': [conn._asdict() for conn in proc.connections()],
                'open_files': [f.path for f in proc.open_files()],
                'cmdline': proc.cmdline(),
                'exe': proc.exe(),
                'cwd': proc.cwd()
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
            
    def kill_process(self, pid: int) -> bool:
        """Kill a process by PID"""
        try:
            proc = psutil.Process(pid)
            proc.kill()
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False
            
    def suspend_process(self, pid: int) -> bool:
        """Suspend a process by PID"""
        try:
            handle = self.kernel32.OpenProcess(
                win32con.PROCESS_SUSPEND_RESUME,
                False,
                pid
            )
            if handle:
                self.kernel32.NtSuspendProcess(handle)
                self.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return False
            
    def resume_process(self, pid: int) -> bool:
        """Resume a suspended process by PID"""
        try:
            handle = self.kernel32.OpenProcess(
                win32con.PROCESS_SUSPEND_RESUME,
                False,
                pid
            )
            if handle:
                self.kernel32.NtResumeProcess(handle)
                self.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return False
            
    def inject_dll(self, pid: int, dll_path: str) -> bool:
        """Inject a DLL into a process"""
        try:
            # Get process handle
            process_handle = self.kernel32.OpenProcess(
                win32con.PROCESS_ALL_ACCESS,
                False,
                pid
            )
            
            if not process_handle:
                return False
                
            # Allocate memory for DLL path
            dll_path_bytes = (dll_path + '\0').encode('utf-8')
            path_size = len(dll_path_bytes)
            remote_memory = self.kernel32.VirtualAllocEx(
                process_handle,
                None,
                path_size,
                win32con.MEM_COMMIT | win32con.MEM_RESERVE,
                win32con.PAGE_READWRITE
            )
            
            if not remote_memory:
                self.kernel32.CloseHandle(process_handle)
                return False
                
            # Write DLL path to process memory
            written = ctypes.c_size_t()
            if not self.kernel32.WriteProcessMemory(
                process_handle,
                remote_memory,
                dll_path_bytes,
                path_size,
                ctypes.byref(written)
            ):
                self.kernel32.VirtualFreeEx(
                    process_handle,
                    remote_memory,
                    0,
                    win32con.MEM_RELEASE
                )
                self.kernel32.CloseHandle(process_handle)
                return False
                
            # Get LoadLibraryA address
            kernel32_handle = self.kernel32.GetModuleHandleW('kernel32.dll')
            load_library_addr = self.kernel32.GetProcAddress(
                kernel32_handle,
                b'LoadLibraryA'
            )
            
            # Create remote thread to load DLL
            thread_handle = self.kernel32.CreateRemoteThread(
                process_handle,
                None,
                0,
                load_library_addr,
                remote_memory,
                0,
                None
            )
            
            if not thread_handle:
                self.kernel32.VirtualFreeEx(
                    process_handle,
                    remote_memory,
                    0,
                    win32con.MEM_RELEASE
                )
                self.kernel32.CloseHandle(process_handle)
                return False
                
            # Wait for thread completion
            self.kernel32.WaitForSingleObject(thread_handle, 0xFFFFFFFF)
            
            # Cleanup
            self.kernel32.CloseHandle(thread_handle)
            self.kernel32.VirtualFreeEx(
                process_handle,
                remote_memory,
                0,
                win32con.MEM_RELEASE
            )
            self.kernel32.CloseHandle(process_handle)
            
            return True
            
        except Exception:
            return False
            
    def get_process_handles(self, pid: int) -> List[Dict]:
        """Get list of handles for a process"""
        try:
            proc = psutil.Process(pid)
            handles = []
            for handle in proc.open_files():
                handles.append({
                    'path': handle.path,
                    'fd': handle.fd
                })
            return handles
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return []
            
    def get_process_modules(self, pid: int) -> List[Dict]:
        """Get list of loaded modules for a process"""
        try:
            proc = psutil.Process(pid)
            modules = []
            for module in proc.memory_maps():
                modules.append({
                    'path': module.path,
                    'rss': module.rss,
                    'vms': module.vms,
                    'num_page_faults': module.num_page_faults
                })
            return modules
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return []
            
    def get_process_threads(self, pid: int) -> List[Dict]:
        """Get list of threads for a process"""
        try:
            proc = psutil.Process(pid)
            threads = []
            for thread in proc.threads():
                threads.append({
                    'id': thread.id,
                    'user_time': thread.user_time,
                    'system_time': thread.system_time
                })
            return threads
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return []
            
    def set_process_priority(self, pid: int, priority: int) -> bool:
        """Set process priority"""
        try:
            proc = psutil.Process(pid)
            proc.nice(priority)
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False
            
    def get_process_environment(self, pid: int) -> Optional[Dict]:
        """Get process environment variables"""
        try:
            proc = psutil.Process(pid)
            return proc.environ()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None 