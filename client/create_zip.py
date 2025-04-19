"""
Create lab package zip file using Python's zipfile module
"""
import os
import zipfile

def create_lab_zip():
    """Create a zip file of the lab directory contents"""
    print("Creating lab package zip using Python...")
    
    # Ensure we're in the right directory
    lab_dir = 'dist/lab'
    if not os.path.exists(lab_dir):
        print(f"Error: {lab_dir} directory not found!")
        return False
    
    # List all files in the lab directory
    lab_files = []
    for filename in os.listdir(lab_dir):
        full_path = os.path.join(lab_dir, filename)
        if os.path.isfile(full_path):
            lab_files.append(full_path)
    
    # Print what we're including
    print(f"Adding {len(lab_files)} files to zip:")
    for file in lab_files:
        print(f"- {os.path.basename(file)}")
    
    # Create the zip file
    zip_path = 'dist/HydraTestLab.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in lab_files:
            zipf.write(file, os.path.basename(file))
    
    # Verify the zip contents
    with zipfile.ZipFile(zip_path, 'r') as zipf:
        print(f"\nVerified zip contents ({os.path.getsize(zip_path)} bytes):")
        for file_info in zipf.infolist():
            print(f"- {file_info.filename} ({file_info.file_size} bytes)")
    
    return True

if __name__ == "__main__":
    create_lab_zip() 