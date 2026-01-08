# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

# Get the project root directory
# PyInstaller runs from the project root, so we can use the current working directory
# or resolve from the spec file location
try:
    # Try to get the spec file directory from SPECPATH (set by PyInstaller)
    if 'SPECPATH' in globals():
        spec_file_path = SPECPATH
        if os.path.isfile(spec_file_path):
            spec_dir = os.path.dirname(os.path.abspath(spec_file_path))
        else:
            spec_dir = os.path.abspath(spec_file_path)
        # Project root is parent of electron directory
        project_root = os.path.dirname(spec_dir)
    else:
        # Fallback: assume we're running from project root
        # The spec file is at electron/backend.spec, so go up one level
        project_root = os.getcwd()
except:
    # Ultimate fallback: use current working directory
    project_root = os.getcwd()

# Use absolute path for main.py
main_py_path = os.path.join(project_root, 'plexio', 'main.py')

# Verify the main.py path exists
if not os.path.exists(main_py_path):
    # Try alternative: maybe project_root needs to account for electron subdirectory
    alt_project_root = os.path.dirname(os.path.dirname(os.path.abspath(main_py_path)))
    alt_main_py = os.path.join(alt_project_root, 'plexio', 'main.py')
    if os.path.exists(alt_main_py):
        project_root = alt_project_root
        main_py_path = alt_main_py
    else:
        raise FileNotFoundError(f'Could not find main.py at {main_py_path}. Project root: {project_root}, cwd: {os.getcwd()}')

a = Analysis(
    [main_py_path],
    pathex=[project_root],
    binaries=[],
    datas=[
        (os.path.join(project_root, 'plexio'), 'plexio'),
    ],
    hiddenimports=[
        'uvicorn',
        'fastapi',
        'aiohttp',
        'pydantic',
        'pydantic_settings',
        'yarl',
        'redis',
        'sentry_sdk',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
