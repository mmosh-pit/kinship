'use client';

/**
 * Kinship Studio - Voice Chat Button
 *
 * Button component for initiating and controlling voice chat.
 */

import React, { useState } from 'react';
import { useVoiceChat, UseVoiceChatOptions } from '@/hooks/useVoiceChat';

interface VoiceChatButtonProps {
  /** Presence agent ID */
  presenceId: string;
  /** User ID */
  userId?: string;
  /** User wallet */
  userWallet?: string;
  /** User role */
  userRole?: string;
  /** Voice name */
  voice?: string;
  /** Additional class name */
  className?: string;
  /** Show transcript panel */
  showTranscript?: boolean;
}

/**
 * Voice chat button with built-in state management.
 */
export function VoiceChatButton({
  presenceId,
  userId,
  userWallet,
  userRole,
  voice = 'Aoede',
  className = '',
  showTranscript = true,
}: VoiceChatButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get auth token from localStorage (same as chat flow)
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('token') || undefined;
    }
    return undefined;
  };

  const {
    state,
    isConnected,
    isReady,
    isMuted,
    isAiSpeaking,
    sessionId,
    presenceName,
    transcript,
    currentToolCall,
    inputLevel,
    outputLevel,
    connect,
    disconnect,
    toggleMute,
    error,
  } = useVoiceChat({
    presenceId,
    userId,
    userWallet,
    userRole,
    voice,
    authToken: getAuthToken(),
  });

  const handleClick = async () => {
    if (isConnected) {
      disconnect();
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
      await connect();
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'connecting':
        return 'bg-yellow-500';
      case 'ready':
      case 'active':
        return 'bg-green-500';
      case 'ai_speaking':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStateText = () => {
    switch (state) {
      case 'disconnected':
        return 'Start Voice Chat';
      case 'connecting':
        return 'Connecting...';
      case 'ready':
        return 'Listening...';
      case 'active':
        return 'Speaking...';
      case 'ai_speaking':
        return `${presenceName || 'AI'} is speaking...`;
      case 'error':
        return 'Error - Click to retry';
      default:
        return state;
    }
  };

  return (
    <div className={`voice-chat-container ${className}`}>
      {/* Main Button */}
      <button
        onClick={handleClick}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full
          font-medium transition-all duration-200
          ${isConnected
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
          }
        `}
      >
        {/* Microphone Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          {isConnected ? (
            // Stop icon
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
              clipRule="evenodd"
            />
          ) : (
            // Microphone icon
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          )}
        </svg>

        <span>{isConnected ? 'End Call' : 'Voice Chat'}</span>

        {/* Status indicator */}
        {isConnected && (
          <span className={`w-2 h-2 rounded-full ${getStateColor()} animate-pulse`} />
        )}
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="mt-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[300px]">
          {/* Status Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${getStateColor()}`} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getStateText()}
              </span>
            </div>

            {/* Mute Button */}
            {isReady && (
              <button
                onClick={toggleMute}
                className={`
                  p-2 rounded-full transition-colors
                  ${isMuted
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  {isMuted ? (
                    // Muted icon
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  ) : (
                    // Volume icon
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
              </button>
            )}
          </div>

          {/* Audio Level Indicators */}
          {isReady && (
            <div className="mb-3 space-y-2">
              {/* Input Level */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12">You</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-75"
                    style={{ width: `${inputLevel * 100}%` }}
                  />
                </div>
              </div>

              {/* Output Level */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12">AI</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-75"
                    style={{ width: `${outputLevel * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tool Call Indicator */}
          {currentToolCall && (
            <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-purple-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm text-purple-700 dark:text-purple-300">
                  {currentToolCall.status === 'pending'
                    ? `Calling ${currentToolCall.name}...`
                    : currentToolCall.status === 'success'
                    ? `${currentToolCall.name} completed`
                    : `${currentToolCall.name} failed`}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Transcript */}
          {showTranscript && transcript.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Transcript
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {transcript.slice(-5).map((entry, index) => (
                  <div
                    key={index}
                    className={`text-sm ${
                      entry.role === 'user'
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    <span className="font-medium">
                      {entry.role === 'user' ? 'You: ' : `${presenceName || 'AI'}: `}
                    </span>
                    <span className={!entry.isFinal ? 'opacity-60' : ''}>
                      {entry.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session Info */}
          {sessionId && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400">
                Session: {sessionId}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VoiceChatButton;