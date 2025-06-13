import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';
import { spawn } from 'child_process';
const SIGNALING_URL = 'http://localhost:3000';
class VirtualDeviceStreamer {
    constructor() {
        this.isStreaming = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.device = new mediasoupClient.Device();
        this.socket = io(SIGNALING_URL, {
            transports: ['websocket'],
            timeout: 20000,
            forceNew: true
        });
        this.setupSocketHandlers();
    }
    setupSocketHandlers() {
        this.socket.on('connect', () => {
            console.log('✅ Socket connected');
            this.reconnectAttempts = 0;
        });
        this.socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket disconnected: ${reason}`);
            this.cleanup();
        });
        this.socket.on('error', (error) => {
            console.error('❌ Socket error:', error);
        });
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
        });
        this.socket.on('reconnect_error', (error) => {
            this.reconnectAttempts++;
            console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('❌ Max reconnection attempts reached. Giving up.');
                this.cleanup();
            }
        });
    }
    async waitForConnection() {
        return new Promise((resolve, reject) => {
            if (this.socket.connected) {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                reject(new Error('Socket connection timeout'));
            }, 30000);
            this.socket.once('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            this.socket.once('connect_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    async loadDevice() {
        if (this.device.loaded) {
            return;
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Device loading timeout'));
            }, 10000);
            this.socket.emit('getRouterRtpCapabilities', (routerRtpCapabilities) => {
                clearTimeout(timeout);
                if (!routerRtpCapabilities) {
                    reject(new Error('Failed to get router RTP capabilities'));
                    return;
                }
                try {
                    this.device.load({ routerRtpCapabilities });
                    console.log('✅ Device loaded');
                    resolve();
                }
                catch (error) {
                    reject(new Error(`Device load failed: ${error}`));
                }
            });
        });
    }
    async createConsumerTransport() {
        const rtpCapabilities = this.device.rtpCapabilities;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Transport creation timeout'));
            }, 15000);
            this.socket.emit('createConsumerTransport', rtpCapabilities, async (transportOptions) => {
                clearTimeout(timeout);
                if (!transportOptions) {
                    reject(new Error('Failed to get transport options'));
                    return;
                }
                try {
                    this.transport = this.device.createRecvTransport(transportOptions);
                    this.transport.on('connect', ({ dtlsParameters }, callback) => {
                        this.socket.emit('connectConsumerTransport', { dtlsParameters }, (response) => {
                            if (response?.error) {
                                console.error('❌ Transport connect failed:', response.error);
                            }
                            else {
                                console.log('✅ Transport connected');
                            }
                            callback();
                        });
                    });
                    this.transport.on('connectionstatechange', (state) => {
                        console.log(`🔗 Transport connection state: ${state}`);
                        if (state === 'failed' || state === 'closed') {
                            console.error('❌ Transport connection failed/closed');
                            this.cleanup();
                        }
                    });
                    resolve();
                }
                catch (error) {
                    reject(new Error(`Transport creation failed: ${error}`));
                }
            });
        });
    }
    async createConsumer(kind) {
        if (!this.transport) {
            throw new Error('Transport not created');
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve(null); // Don't reject, just return null if no producer available
            }, 10000);
            this.socket.emit('consume', { kind, rtpCapabilities: this.device.rtpCapabilities }, async (response) => {
                clearTimeout(timeout);
                if (!response || 'error' in response) {
                    console.log(`ℹ️ No ${kind} producer available`);
                    resolve(null);
                    return;
                }
                try {
                    const { id, producerId, rtpParameters } = response;
                    const consumer = await this.transport.consume({
                        id,
                        producerId,
                        kind,
                        rtpParameters
                    });
                    // Resume the consumer
                    this.socket.emit('resumeConsumer', { consumerId: id }, (resumeResponse) => {
                        if (resumeResponse?.error) {
                            console.error(`❌ Failed to resume ${kind} consumer:`, resumeResponse.error);
                        }
                        else {
                            console.log(`✅ ${kind} consumer resumed`);
                        }
                    });
                    resolve(consumer);
                }
                catch (error) {
                    console.error(`❌ Failed to create ${kind} consumer:`, error);
                    resolve(null);
                }
            });
        });
    }
    setupFFmpeg(hasVideo, hasAudio) {
        const args = [
            '-f', 'webm',
            '-i', 'pipe:0',
            '-y' // Overwrite output files
        ];
        if (hasVideo) {
            args.push('-map', '0:v', '-f', 'dshow', '-pix_fmt', 'yuv420p', '-r', '30', '-video_size', '1280x720', 'video="OBS-Camera"');
        }
        if (hasAudio) {
            args.push('-map', '0:a', '-f', 'dshow', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', 'audio="CABLE Input (VB-Audio Virtual Cable)"');
        }
        try {
            const ffmpeg = spawn('ffmpeg', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            ffmpeg.on('error', (error) => {
                console.error('❌ FFmpeg process error:', error);
                this.cleanup();
            });
            ffmpeg.on('close', (code, signal) => {
                if (code !== null) {
                    console.log(`🎬 FFmpeg exited with code ${code}`);
                }
                if (signal !== null) {
                    console.log(`🎬 FFmpeg killed with signal ${signal}`);
                }
            });
            ffmpeg.stderr?.on('data', (data) => {
                const message = data.toString();
                if (message.includes('Error') || message.includes('error')) {
                    console.error(`❌ FFmpeg error: ${message}`);
                }
            });
            return ffmpeg;
        }
        catch (error) {
            console.error('❌ Failed to start FFmpeg:', error);
            return undefined;
        }
    }
    startMediaRecorder(stream, hasVideo, hasAudio) {
        try {
            // Check for supported MIME types
            const mimeTypes = [
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=h264,opus',
                'video/webm'
            ];
            let selectedMimeType = '';
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    break;
                }
            }
            if (!selectedMimeType) {
                throw new Error('No supported MIME type found for MediaRecorder');
            }
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType,
                videoBitsPerSecond: hasVideo ? 2000000 : undefined,
                audioBitsPerSecond: hasAudio ? 128000 : undefined
            });
            this.ffmpegProcess = this.setupFFmpeg(hasVideo, hasAudio);
            if (!this.ffmpegProcess) {
                throw new Error('Failed to start FFmpeg process');
            }
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && this.ffmpegProcess?.stdin?.writable) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (this.ffmpegProcess?.stdin?.writable && reader.result) {
                            const buffer = Buffer.from(reader.result);
                            this.ffmpegProcess.stdin.write(buffer);
                        }
                    };
                    reader.onerror = () => {
                        console.error('❌ FileReader error');
                    };
                    reader.readAsArrayBuffer(event.data);
                }
            };
            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorder error:', event);
                this.cleanup();
            };
            this.mediaRecorder.onstop = () => {
                console.log('🎬 MediaRecorder stopped');
                if (this.ffmpegProcess?.stdin?.writable) {
                    this.ffmpegProcess.stdin.end();
                }
            };
            // Start recording with 1 second intervals
            this.mediaRecorder.start(1000);
            this.isStreaming = true;
            console.log(`🎬 Started streaming with ${selectedMimeType}`);
        }
        catch (error) {
            console.error('❌ Failed to start MediaRecorder:', error);
            throw error;
        }
    }
    async startReceiver() {
        try {
            console.log('🚀 Starting MediaSoup receiver...');
            // 1. Connect to signaling server
            await this.waitForConnection();
            // 2. Load device with router capabilities
            await this.loadDevice();
            // 3. Create consumer transport
            await this.createConsumerTransport();
            // 4. Create consumers
            const [videoConsumer, audioConsumer] = await Promise.all([
                this.createConsumer('video'),
                this.createConsumer('audio')
            ]);
            if (!videoConsumer && !audioConsumer) {
                throw new Error('No video or audio producers available');
            }
            // 5. Create combined media stream
            const tracks = [];
            if (videoConsumer) {
                tracks.push(videoConsumer.track);
                console.log('✅ Video track added');
            }
            if (audioConsumer) {
                tracks.push(audioConsumer.track);
                console.log('✅ Audio track added');
            }
            const combinedStream = new MediaStream(tracks);
            // 6. Start streaming to virtual devices
            this.startMediaRecorder(combinedStream, !!videoConsumer, !!audioConsumer);
            console.log('✅ Receiver successfully started and streaming to virtual devices');
        }
        catch (error) {
            console.error('❌ Failed to start receiver:', error);
            this.cleanup();
            throw error;
        }
    }
    stop() {
        console.log('🛑 Stopping receiver...');
        this.cleanup();
    }
    cleanup() {
        this.isStreaming = false;
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            }
            catch (error) {
                console.error('❌ Error stopping MediaRecorder:', error);
            }
        }
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
            try {
                this.ffmpegProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                        this.ffmpegProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
            catch (error) {
                console.error('❌ Error killing FFmpeg process:', error);
            }
        }
        if (this.transport && !this.transport.closed) {
            try {
                this.transport.close();
            }
            catch (error) {
                console.error('❌ Error closing transport:', error);
            }
        }
        this.mediaRecorder = undefined;
        this.ffmpegProcess = undefined;
        this.transport = undefined;
        console.log('🧹 Cleanup completed');
    }
}
// Export the main function
export async function startReceiver() {
    const streamer = new VirtualDeviceStreamer();
    await streamer.startReceiver();
    return streamer;
}
// Usage example:
/*
try {
  const streamer = await startReceiver();
  
  // To stop later:
  // streamer.stop();
} catch (error) {
  console.error('Failed to start streaming:', error);
}
*/ 
