"use client";

import VoiceSessionControls from "@/components/Voice/VoiceSessionControls";
import VoiceEventLog from "@/components/Voice/VoiceEventLog";
import VoiceToolPanel from "@/components/Voice/VoiceToolPanel";
import useVoiceSession from "@/lib/useVoiceSession";

export default function VoicePage() {
  const {
    isSessionActive,
    events,
    startSession,
    stopSession,
    sendClientEvent,
    sendTextMessage
  } = useVoiceSession();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse"></div>
              <h1 className="text-2xl font-bold text-gray-900">Voice AI Console</h1>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isSessionActive 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}>
                {isSessionActive ? '🟢 Connected' : '⚫ Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6 h-[calc(100vh-180px)]">
          {/* Left Panel - Conversation */}
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Event Log */}
            <div className="flex-1 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900">Conversation Log</h2>
                  <p className="text-sm text-gray-600 mt-1">Real-time voice interaction events</p>
                </div>
                <div className="flex-1 p-6 overflow-y-auto max-h-[calc(100vh-100px)] min-h-0">
                  <VoiceEventLog events={events} />
                </div>
              </div>
            </div>
            
            {/* Session Controls */}
            <div className="border-t border-gray-100 bg-gray-50 p-6">
              <VoiceSessionControls
                startSession={startSession}
                stopSession={stopSession}
                sendClientEvent={sendClientEvent}
                sendTextMessage={sendTextMessage}
                events={events}
                isSessionActive={isSessionActive}
              />
            </div>
          </div>

          {/* Right Panel - Tools */}
          <div className="w-96 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="h-full flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">AI Tools</h2>
                <p className="text-sm text-gray-600 mt-1">Function calling capabilities</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <VoiceToolPanel
                  sendClientEvent={sendClientEvent}
                  events={events}
                  isSessionActive={isSessionActive}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 