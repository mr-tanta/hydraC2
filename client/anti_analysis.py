import os
import sys
import time
import ctypes
import platform
import socket
import psutil
import win32api
import win32con
import win32process
import win32security
from ctypes import windll, c_uint, c_void_p, byref, sizeof
from ctypes.wintypes import HANDLE, DWORD, LPWSTR, WORD

class AntiAnalysis:
    def __init__(self):
        self.blacklisted_processes = {
            "ollydbg.exe", "ida64.exe", "ida.exe",
            "wireshark.exe", "processhacker.exe",
            "x64dbg.exe", "x32dbg.exe", "windbg.exe",
            "procmon.exe", "procexp.exe", "pestudio.exe",
            "processhacker.exe", "regmon.exe", "filemon.exe"
        }
        
        self.blacklisted_usernames = {
            "malware", "maltest", "virus", "sandbox",
            "sample", "analyst", "analysis", "snort",
            "vmware", "vbox"
        }
        
        self.blacklisted_hostnames = {
            "sandbox", "analysis", "maltest", "malware",
            "virus", "snort", "vmware", "vbox"
        }
        
        self.blacklisted_mac_prefixes = {
            "00:05:69",  # VMware
            "00:0C:29",  # VMware
            "00:1C:14",  # VMware
            "00:50:56",  # VMware
            "08:00:27"   # VirtualBox
        }
        
    def check_environment(self):
        """Run all environment checks"""
        checks = [
            self._check_debugger,
            self._check_virtualization,
            self._check_sandbox_artifacts,
            self._check_analysis_tools,
            self._check_system_resources,
            self._check_timing,
            self._check_hardware_artifacts
        ]
        
        for check in checks:
            if check():
                return True  # Analysis environment detected
        return False
        
    def _check_debugger(self):
        """Check for debugger presence"""
        # Check IsDebuggerPresent
        if windll.kernel32.IsDebuggerPresent():
            return True
            
        # Check NtGlobalFlag
        peb = self._get_peb()
        if peb.NtGlobalFlag & 0x70:  # Debugger flags
            return True
            
        # Check for hardware breakpoints
        context = self._get_thread_context()
        if context.Dr0 != 0 or context.Dr1 != 0 or \
           context.Dr2 != 0 or context.Dr3 != 0:
            return True
            
        return False
        
    def _check_virtualization(self):
        """Check for virtualization artifacts"""
        # Check MAC address
        mac = self._get_mac_address()
        for prefix in self.blacklisted_mac_prefixes:
            if mac.startswith(prefix):
                return True
                
        # Check common VM devices
        try:
            with open(r"\\.\VBoxMiniRdrDN", "rb"):
                return True  # VirtualBox device found
        except:
            pass
            
        try:
            with open(r"\\.\vmci", "rb"):
                return True  # VMware device found
        except:
            pass
            
        return False
        
    def _check_sandbox_artifacts(self):
        """Check for sandbox artifacts"""
        username = os.getenv("USERNAME", "").lower()
        hostname = socket.gethostname().lower()
        
        if username in self.blacklisted_usernames:
            return True
            
        if hostname in self.blacklisted_hostnames:
            return True
            
        # Check for sandbox-specific registry keys
        try:
            import winreg
            reg = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SYSTEM\CurrentControlSet\Services\Disk\Enum"
            )
            value = winreg.QueryValueEx(reg, "0")[0].lower()
            if "vbox" in value or "vmware" in value:
                return True
        except:
            pass
            
        return False
        
    def _check_analysis_tools(self):
        """Check for analysis tools"""
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'].lower() in self.blacklisted_processes:
                    return True
            except:
                continue
        return False
        
    def _check_system_resources(self):
        """Check system resources for VM indicators"""
        # Check RAM size (most sandboxes use minimal RAM)
        if psutil.virtual_memory().total < 4 * 1024 * 1024 * 1024:  # 4GB
            return True
            
        # Check CPU cores (most sandboxes use minimal cores)
        if psutil.cpu_count() < 2:
            return True
            
        # Check disk size
        if psutil.disk_usage('/').total < 60 * 1024 * 1024 * 1024:  # 60GB
            return True
            
        return False
        
    def _check_timing(self):
        """Detect analysis through timing checks"""
        start = time.time()
        time.sleep(0.1)
        
        # If sleep was shorter than expected (sandbox fast-forward)
        if time.time() - start < 0.09:
            return True
            
        # CPU timestamp check
        start = self._rdtsc()
        time.sleep(0.1)
        end = self._rdtsc()
        
        # If cycle count is too low (emulation)
        if end - start < 10000000:
            return True
            
        return False
        
    def _check_hardware_artifacts(self):
        """Check for hardware artifacts indicating VM"""
        try:
            # Check CPUID
            if self._check_cpuid():
                return True
                
            # Check for VM backdoor ports
            if self._check_vm_ports():
                return True
                
        except:
            pass
            
        return False
        
    def _get_peb(self):
        """Get Process Environment Block"""
        class PEB(ctypes.Structure):
            _fields_ = [
                ("InheritedAddressSpace", c_uint),
                ("ReadImageFileExecOptions", c_uint),
                ("BeingDebugged", c_uint),
                ("NtGlobalFlag", c_uint)
            ]
            
        peb = PEB()
        windll.ntdll.NtQueryInformationProcess(
            -1, 0, byref(peb), sizeof(peb), None
        )
        return peb
        
    def _get_thread_context(self):
        """Get thread context for checking hardware breakpoints"""
        class CONTEXT(ctypes.Structure):
            _fields_ = [
                ("ContextFlags", DWORD),
                ("Dr0", c_void_p),
                ("Dr1", c_void_p),
                ("Dr2", c_void_p),
                ("Dr3", c_void_p),
                ("Dr6", c_void_p),
                ("Dr7", c_void_p)
            ]
            
        context = CONTEXT()
        handle = windll.kernel32.GetCurrentThread()
        windll.kernel32.GetThreadContext(handle, byref(context))
        return context
        
    def _get_mac_address(self):
        """Get MAC address of first NIC"""
        import uuid
        return hex(uuid.getnode())[2:]
        
    def _rdtsc(self):
        """Read CPU timestamp counter"""
        if platform.machine().endswith('64'):
            return int.from_bytes(
                windll.ntdll.RtlGetEnabledExtendedFeatures(0),
                byteorder='little'
            )
        else:
            return windll.ntdll.RtlGetEnabledExtendedFeatures(0)
            
    def _check_cpuid(self):
        """Check CPUID for VM indicators"""
        try:
            import cpuid
            vendor = cpuid.CPUID().vendor()
            return vendor in ["KVMKVMKVM", "VMwareVMware", "XenVMMXenVMM"]
        except:
            return False
            
    def _check_vm_ports(self):
        """Check for VM backdoor ports"""
        try:
            # VMware backdoor port
            windll.inpout32.Inp32(0x5658)
            return True
        except:
            return False
            
    def enable_self_protection(self):
        """Enable anti-tampering measures"""
        # Set high process priority
        handle = win32api.GetCurrentProcess()
        win32process.SetPriorityClass(
            handle, win32process.HIGH_PRIORITY_CLASS
        )
        
        # Enable SeDebugPrivilege for self-defense
        priv_flags = win32security.TOKEN_ADJUST_PRIVILEGES | \
                    win32security.TOKEN_QUERY
        h_token = win32security.OpenProcessToken(
            handle, priv_flags
        )
        
        priv_id = win32security.LookupPrivilegeValue(
            None, win32security.SE_DEBUG_NAME
        )
        
        # Enable the privilege
        win32security.AdjustTokenPrivileges(
            h_token, 0,
            [(priv_id, win32security.SE_PRIVILEGE_ENABLED)]
        )
        
        # Protect process memory
        windll.kernel32.VirtualProtect(
            windll.kernel32.GetModuleHandleA(None),
            1024 * 1024,  # Protect first 1MB
            win32con.PAGE_READONLY,
            ctypes.byref(DWORD(0))
        ) 