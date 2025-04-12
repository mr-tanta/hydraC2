@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cd client
cl /LD /I ..\venv\Include /link /LIBPATH:..\venv\Libs python311.lib injector.cpp injector_bindings.cpp /OUT:injector.pyd
cd .. 