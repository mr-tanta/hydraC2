# Set up Visual Studio environment
$vcvarsallPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$vcvarsallContent = Get-Content -Path $vcvarsallPath -Raw
$vcvarsallContent = $vcvarsallContent -replace 'set "INCLUDE=', '$env:INCLUDE='
$vcvarsallContent = $vcvarsallContent -replace 'set "LIB=', '$env:LIB='
$vcvarsallContent = $vcvarsallContent -replace 'set "PATH=', '$env:PATH='

# Execute the modified content
Invoke-Expression $vcvarsallContent

# Python paths
$pythonInclude = "C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_3.13.1008.0_x64__qbz5n2kfra8p0\Include"
$pythonLib = "C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_3.13.1008.0_x64__qbz5n2kfra8p0\Lib"

# Compile the extension module
cd client
cl /LD /I $pythonInclude /link /LIBPATH:$pythonLib python313.lib injector.cpp injector_bindings.cpp /OUT:injector.pyd
cd .. 