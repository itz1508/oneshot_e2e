import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const videoPath = resolve(process.cwd(), 'docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4');

if (!existsSync(videoPath)) {
  console.error(`Video file not found at: ${videoPath}`);
  process.exit(1);
}

console.log(`Opening demonstration video: ${videoPath}`);

const cmd = process.platform === 'win32'
  ? `start "" "${videoPath}"`
  : process.platform === 'darwin'
  ? `open "${videoPath}"`
  : `xdg-open "${videoPath}"`;

exec(cmd, (err) => {
  if (err) {
    console.error('Failed to open video automatically:', err.message);
  } else {
    console.log('Video player launched successfully.');
  }
});
