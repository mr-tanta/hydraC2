import os
import subprocess

# Define the Git executable path
git_paths = [
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\bin\\git.exe",
    "C:\\Git\\bin\\git.exe",
]

# Find the Git executable
git_exe = None
for path in git_paths:
    if os.path.exists(path):
        git_exe = path
        break

if git_exe is None:
    print("Git executable not found. Please try restarting your system and running 'git init' directly.")
    exit(1)

# Initialize Git repository
print(f"Using Git at: {git_exe}")
subprocess.run([git_exe, "init"])

# Get the current directory path
current_dir = os.getcwd()
print(f"Current directory: {current_dir}")

# Add the directory as safe
try:
    subprocess.run([git_exe, "config", "--global", "--add", "safe.directory", current_dir])
    print(f"Added {current_dir} as a safe directory")
except Exception as e:
    print(f"Warning: Could not add safe directory: {e}")

# Create .gitignore file
gitignore_content = """
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
*.egg-info/
.installed.cfg
*.egg

# SQLite database
*.db
*.sqlite3

# Logs
*.log

# Environment variables
.env

# Virtual environment
venv/
ENV/

# IDE files
.idea/
.vscode/
*.swp
*.swo

# Certificate files
*.key
*.crt
*.pem

# Sensitive configuration
secrets.yaml
config.yaml

# Windows specific
Thumbs.db
ehthumbs.db
Desktop.ini
"""

with open(".gitignore", "w") as f:
    f.write(gitignore_content)

print("Created .gitignore file")

# Set Git user information (required for commits)
try:
    subprocess.run([git_exe, "config", "user.email", "hydra@example.com"])
    subprocess.run([git_exe, "config", "user.name", "Hydra C2 User"])
    print("Set Git user information")
except Exception as e:
    print(f"Warning: Could not set Git user information: {e}")

# Add files to Git
subprocess.run([git_exe, "add", "."])
print("Added files to Git staging area")

# Initial commit
subprocess.run([git_exe, "commit", "-m", "Initial commit for Hydra C2 project"])
print("Created initial commit")

print("Git repository initialization complete!") 