 
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

export function pipeToVirtualCam(streamUrl: string) {
  const ffmpegArgs = [
    '-i', streamUrl,         // Input from WebRTC player or temp file
    '-f', 'dshow',           // For Windows virtual cam
    '-pix_fmt', 'yuv420p',
    '-vcodec', 'rawvideo',
    '-video_device_number', '0',
    'video="OBS-Camera"'
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.stderr.on('data', (data) => {
    console.error(`[VirtualCam] ${data}`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`[VirtualCam] FFmpeg exited with code ${code}`);
  });
}
