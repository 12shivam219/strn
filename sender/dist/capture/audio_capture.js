export async function getAudioStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
    });
    return stream;
}
