import os
import sys
import webbrowser
from pathlib import Path

video_path = Path(__file__).resolve().parent.parent / "docs" / "OneShot_Task_Drawer_Compatibility_Fixed.mp4"

if not video_path.exists():
    print(f"Video file not found at: {video_path}", file=sys.stderr)
    sys.exit(1)

print(f"Opening demonstration video: {video_path}")
if sys.platform == "win32":
    os.startfile(str(video_path))
else:
    webbrowser.open(video_path.as_uri())
print("Video player launched successfully.")
