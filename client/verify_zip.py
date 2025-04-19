"""
Verify the lab package zip file contents
"""
import zipfile

def verify_lab_zip():
    """Print the contents of the lab zip file"""
    try:
        with zipfile.ZipFile('dist/HydraTestLab.zip', 'r') as zipf:
            print("Contents of HydraTestLab.zip:")
            for file_info in zipf.infolist():
                print(f"- {file_info.filename} ({file_info.file_size} bytes)")
    except Exception as e:
        print(f"Error opening zip file: {e}")

if __name__ == "__main__":
    verify_lab_zip() 