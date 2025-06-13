export async function getVideoStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
        },
        audio: false
    });
    return stream;
}
