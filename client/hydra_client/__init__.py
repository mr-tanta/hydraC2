"""
Hydra C2 Client Package
"""

__version__ = "1.0.0"

import os
import sys

# Make package modules easily importable
__all__ = [
    "network",
    "remote_control",
    "process_manager",
    "registry_manager",
    "implant",
    "config"
]

# Enable absolute imports within package
package_dir = os.path.dirname(os.path.abspath(__file__))
if package_dir not in sys.path:
    sys.path.insert(0, package_dir) 