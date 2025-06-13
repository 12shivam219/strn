import React, { useState } from 'react';

const Controls = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('Ready to stream');

  const toggleStream = async () => {
    try {
      setStatus('Processing...');
      
      if (window.electronAPI) {
        const result = await window.electronAPI.toggleStream();
        console.log('Stream toggle result:', result);
        
        setIsStreaming(prev => !prev);
        setStatus(isStreaming ? 'Stream stopped' : 'Stream started');
      } else {
        // Web version - start browser-based streaming
        await startWebStreaming();
      }
    } catch (error) {
      console.error('Error toggling stream:', error);
      setStatus('Error: ' + error.message);
    }
  };

  const startWebStreaming = async () => {
    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      setIsStreaming(true);
      setStatus('Streaming from browser');
      
      // Here you would integrate with your streaming logic
      console.log('Browser stream started:', stream);
      
    } catch (error) {
      console.error('Error starting web stream:', error);
      setStatus('Error accessing camera/microphone');
    }
  };

  return (
    <div className="space-y-4 p-6 bg-gray-800 rounded-lg">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Stream Controls</h2>
        <p className="text-gray-400 text-sm mb-4">{status}</p>
      </div>
      
      <button
        onClick={toggleStream}
        className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
          isStreaming 
            ? 'bg-red-600 hover:bg-red-700 text-white' 
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {isStreaming ? '⏹️ Stop Streaming' : '▶️ Start Streaming'}
      </button>
      
      <div className="flex space-x-2">
        <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-gray-500'}`}></div>
        <span className="text-sm text-gray-400">
          {isStreaming ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
};

export default Controls;