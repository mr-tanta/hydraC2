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
    print("Git executable not found. Please try restarting your system and running Git commands directly.")
    exit(1)

print(f"Using Git at: {git_exe}")

# Add the remote repository
print("Adding remote repository...")
subprocess.run([git_exe, "remote", "add", "origin", "https://github.com/mr-tanta/hydraC2.git"])

# Rename the branch to main
print("Renaming branch to main...")
subprocess.run([git_exe, "branch", "-M", "main"])

# Push to GitHub
print("Pushing to GitHub...")
push_result = subprocess.run([git_exe, "push", "-u", "origin", "main"], capture_output=True, text=True)

# Check for authentication issues
if push_result.returncode != 0:
    print(f"Push failed with exit code {push_result.returncode}")
    print(f"Error output: {push_result.stderr}")
    
    if "Authentication failed" in push_result.stderr:
        print("\nAuthentication failed. GitHub now requires a personal access token instead of password.")
        print("Please follow these steps:")
        print("1. Go to https://github.com/settings/tokens")
        print("2. Click 'Generate new token'")
        print("3. Give it a name, select the 'repo' scope")
        print("4. Copy the token (you'll only see it once)")
        print("\nThen run these commands in a terminal after restarting it:")
        print("git remote set-url origin https://USERNAME:TOKEN@github.com/mr-tanta/hydraC2.git")
        print("git push -u origin main")
else:
    print("Successfully pushed to GitHub!")
    print("Your code is now available at: https://github.com/mr-tanta/hydraC2.git") 