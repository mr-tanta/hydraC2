"""
Script to create a valid Windows icon file
"""
from PIL import Image
import os

# Check if the icon already exists and remove it
if os.path.exists('windows.ico'):
    os.remove('windows.ico')

# Create a simple blue square icon (Windows-like)
img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
for y in range(256):
    for x in range(256):
        # Create Windows-like squares
        if (x < 120 and y < 120) or (x >= 136 and y < 120) or (x < 120 and y >= 136) or (x >= 136 and y >= 136):
            img.putpixel((x, y), (0, 120, 215, 255))  # Windows blue

# Save as ICO
img.save('windows.ico', format='ICO')
print("Windows icon file created successfully!") 