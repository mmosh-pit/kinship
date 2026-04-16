import { useState } from "react";

function SessionStopped({ startSession }: { startSession: () => void }) {
  const [isActivating, setIsActivating] = useState(false);

  function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    startSession();
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to start conversation</h3>
        <p className="text-sm text-gray-600 mb-6">Click below to begin real-time voice AI interaction</p>
      </div>
      
      <button
        onClick={handleStartSession}
        disabled={isActivating}
        className={`group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-xl transition-all duration-200 transform ${
          isActivating 
            ? "bg-gray-400 cursor-not-allowed" 
            : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 hover:scale-105 shadow-lg hover:shadow-xl"
        } text-white`}
      >
        <div className="flex items-center space-x-3">
          <div className={`w-6 h-6 flex items-center justify-center ${
            isActivating ? 'animate-spin' : 'group-hover:scale-110 transition-transform'
          }`}>
            {isActivating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-xl">⚡</span>
            )}
          </div>
          <span>{isActivating ? "Starting session..." : "Start Voice Session"}</span>
        </div>
        
        {!isActivating && (
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-600 to-red-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
        )}
      </button>
      
      <div className="flex items-center space-x-2 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-300"></span>
        <span>Make sure your microphone is enabled</span>
      </div>
    </div>
  );
}

function SessionActive({ 
  stopSession, 
  sendTextMessage 
}: { 
  stopSession: () => void;
  sendTextMessage: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  function handleSendClientEvent() {
    if (message.trim()) {
      sendTextMessage(message);
      setMessage("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-medium text-green-700">Session Active</span>
          </div>
        </div>
        
        <button 
          onClick={stopSession}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors duration-200"
        >
          <span className="w-4 h-4 mr-2">☁️</span>
          Disconnect
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <div className="flex-1">
            <label htmlFor="text-message" className="block text-sm font-medium text-gray-700 mb-2">
              Send text message
            </label>
            <div className="relative">
              <input
                id="text-message"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && message.trim()) {
                    handleSendClientEvent();
                  }
                }}
                type="text"
                placeholder="Type your message here..."
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors duration-200 pr-12"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <kbd className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-300 rounded">
                  ⏎
                </kbd>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleSendClientEvent}
            disabled={!message.trim()}
            className={`flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 ${
              message.trim()
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            <span className="text-lg">💬</span>
          </button>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Use voice or text to interact with AI</span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span>Listening...</span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface VoiceSessionControlsProps {
  startSession: () => void;
  stopSession: () => void;
  sendClientEvent: (message: any) => void;
  sendTextMessage: (message: string) => void;
  events: any[];
  isSessionActive: boolean;
}

export default function VoiceSessionControls({
  startSession,
  stopSession,
  sendClientEvent,
  sendTextMessage,
  events,
  isSessionActive,
}: VoiceSessionControlsProps) {
  return (
    <div className="w-full">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendTextMessage={sendTextMessage}
        />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
} 