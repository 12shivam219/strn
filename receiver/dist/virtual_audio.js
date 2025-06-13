import { spawn } from 'child_process';
export function pipeToVirtualMic(streamUrl) {
    const ffmpegArgs = [
        '-i', streamUrl,
        '-f', 'dshow', // or 'avfoundation' on macOS
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        'audio="CABLE Input (VB-Audio Virtual Cable)"'
    ];
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    ffmpeg.stderr.on('data', (data) => {
        console.error(`[VirtualMic] ${data}`);
    });
    ffmpeg.on('close', (code) => {
        console.log(`[VirtualMic] FFmpeg exited with code ${code}`);
    });
}
