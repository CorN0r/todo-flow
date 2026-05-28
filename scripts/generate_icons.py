from PIL import Image
import os

src = r"C:\Users\CorN0r\Pictures\app-icon.png"
icons_dir = r"D:\Claude\todo-flow\src-tauri\icons"

img = Image.open(src)
print(f"Source: {img.size}, mode={img.mode}")

if img.mode != "RGBA":
    img = img.convert("RGBA")
    print("Converted to RGBA")

sizes = {
    "32x32.png": (32, 32),
    "128x128.png": (128, 128),
    "128x128@2x.png": (256, 256),
    "64x64.png": (64, 64),
    "icon.png": (512, 512),
}

square_sizes = {
    "Square30x30Logo.png": (30, 30),
    "Square44x44Logo.png": (44, 44),
    "Square71x71Logo.png": (71, 71),
    "Square89x89Logo.png": (89, 89),
    "Square107x107Logo.png": (107, 107),
    "Square142x142Logo.png": (142, 142),
    "Square150x150Logo.png": (150, 150),
    "Square284x284Logo.png": (284, 284),
    "Square310x310Logo.png": (310, 310),
    "StoreLogo.png": (50, 50),
}

print("\n--- Generating PNG icons ---")
for name, size in sizes.items():
    resized = img.resize(size, Image.LANCZOS)
    out_path = os.path.join(icons_dir, name)
    resized.save(out_path, "PNG")
    print(f"  {name} ({size[0]}x{size[1]})")

print("\n--- Generating Square logos ---")
for name, size in square_sizes.items():
    resized = img.resize(size, Image.LANCZOS)
    out_path = os.path.join(icons_dir, name)
    resized.save(out_path, "PNG")
    print(f"  {name} ({size[0]}x{size[1]})")

print("\n--- Generating icon.ico ---")
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_images = []
for size in ico_sizes:
    resized = img.resize(size, Image.LANCZOS)
    ico_images.append(resized)
    print(f"  {size[0]}x{size[1]}")

ico_path = os.path.join(icons_dir, "icon.ico")
ico_images[0].save(
    ico_path,
    format="ICO",
    append_images=ico_images[1:],
)
print(f"  Saved: {ico_path}")

print("\nDone! All icons regenerated.")
