from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all submodules
hiddenimports = collect_submodules('hydra_client')

# Collect package data files
datas = collect_data_files('hydra_client') 