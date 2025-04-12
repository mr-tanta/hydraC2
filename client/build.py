import os
import sys
import shutil
import platform
import subprocess
import PyInstaller.__main__

def install_package():
    """Install the package in development mode"""
    print("[*] Installing package in development mode...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", "."])

def build_client():
    # Install package first
    install_package()
    
    # Clean previous builds
    if os.path.exists("build"):
        shutil.rmtree("build")
    if os.path.exists("dist"):
        shutil.rmtree("dist")
        
    print("[*] Building 64-bit client executable...")
    
    # Ensure we're using 64-bit Python
    if platform.architecture()[0] != '64bit':
        print("[-] Error: Please run this script with 64-bit Python")
        sys.exit(1)
    
    # Get the absolute path to the package directory
    package_dir = os.path.dirname(os.path.abspath(__file__))
    entry_point = os.path.join(package_dir, 'hydra_client', 'main.py')
    hook_file = os.path.join(package_dir, 'hook-hydra_client.py')
    
    # Create spec file content
    spec_content = f"""
# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['{entry_point.replace(os.sep, '/')}'],
    pathex=['{package_dir.replace(os.sep, '/')}'],
    binaries=[],
    datas=[],
    hiddenimports=['hydra_client'],
    hookspath=['{os.path.dirname(hook_file).replace(os.sep, '/')}'],
    hooksconfig={{}},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='updater',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='x86_64',
    codesign_identity=None,
    entitlements_file=None,
)
"""
    
    # Write spec file
    spec_file = os.path.join(package_dir, 'updater.spec')
    with open(spec_file, 'w') as f:
        f.write(spec_content)
    
    # PyInstaller options
    opts = [
        spec_file,
        '--clean',
        '--log-level=ERROR'
    ]
    
    # Run PyInstaller
    PyInstaller.__main__.run(opts)
    
    print("[+] Build complete! 64-bit executable: dist/updater.exe")
    print("[*] Target architecture: x86_64 (64-bit)")

if __name__ == "__main__":
    build_client() 