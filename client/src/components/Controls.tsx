import React, { useState } from 'react';

const Controls = () => {
  const [isStreaming, setIsStreaming] = useState(false);

  const toggleStream = () => {
    setIsStreaming(prev => !prev);
    window.electronAPI.send('start-stream');
window.electronAPI.receive('stream-status', (status) => console.log(status));

  };



  return (
    <div className="space-y-4">
      <button
        onClick={toggleStream}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-xl"
      >
        {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
      </button>
    </div>
  );
};

export default Controls;
