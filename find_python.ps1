# Get Python version
python --version

# Get Python installation path
python -c "import sys; print(sys.executable)"

# Get Python include path
python -c "import sysconfig; print(sysconfig.get_path('include'))"

# Get Python lib path
python -c "import sysconfig; print(sysconfig.get_path('stdlib'))" 