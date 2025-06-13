import React from 'react';
import Controls from '../components/Controls';
import AVSender from '../components/AVSender';
import AVReceiver from '../components/AVReceiver';

const Home = () => {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          🎥 CrossStream
        </h1>
        <p className="text-gray-400 text-lg">
          Cross-platform streaming application
        </p>
      </div>
      
      <div className="max-w-md mx-auto">
        <Controls />
      </div>
      
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Ready to stream audio and video across platforms</p>
      </div>
      
      <div className="mt-8 flex flex-col md:flex-row justify-center gap-8">
        <AVSender />
        <AVReceiver />
      </div>
    </div>
  );
};

export default Home;