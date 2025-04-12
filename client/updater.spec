
# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['C:/Mac/Home/Desktop/hydra_c2/client/hydra_client/main.py'],
    pathex=['C:/Mac/Home/Desktop/hydra_c2/client'],
    binaries=[],
    datas=[],
    hiddenimports=['hydra_client'],
    hookspath=['C:/Mac/Home/Desktop/hydra_c2/client'],
    hooksconfig={},
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
