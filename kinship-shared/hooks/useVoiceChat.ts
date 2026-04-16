'use client';

/**
 * Kinship Studio - useVoiceChat Hook
 *
 * React hook for voice chat functionality.
 * Manages voice client, audio capture, and playback.
 * Supports barge-in (interruption) when user speaks during AI response.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  VoiceClient,
  VoiceClientState,
  VoiceClientConfig,
  TranscriptEntry,
  ToolCallInfo,
} from '@/lib/voice/voice-client';
import { AudioCapture } from '@/lib/voice/audio-capture';
import { AudioPlayback } from '@/lib/voice/audio-playback';

export interface UseVoiceChatOptions {
  /** Backend API URL */
  apiUrl?: string;
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
  /** Auth token */
  authToken?: string;
  /** Auto-start capture when connected */
  autoStart?: boolean;
}

export interface UseVoiceChatReturn {
  // State
  state: VoiceClientState;
  isConnected: boolean;
  isReady: boolean;
  isMuted: boolean;
  isAiSpeaking: boolean;

  // Session info
  sessionId: string | null;
  presenceName: string | null;

  // Transcript
  transcript: TranscriptEntry[];

  // Current tool call (if any)
  currentToolCall: ToolCallInfo | null;

  // Audio levels (0-1)
  inputLevel: number;
  outputLevel: number;

  // Actions
  connect: () => Promise<boolean>;
  disconnect: () => void;
  toggleMute: () => void;
  sendText: (text: string) => void;

  // Error
  error: string | null;
}

/**
 * Hook for voice chat functionality.
 *
 * Handles barge-in automatically: when the server sends an "interrupted"
 * event (user spoke while AI was responding), the audio playback buffer
 * is immediately cleared so old audio stops playing.
 *
 * Usage:
 *   const {
 *     state,
 *     isReady,
 *     transcript,
 *     connect,
 *     disconnect,
 *     toggleMute,
 *   } = useVoiceChat({ presenceId: 'agent_123' });
 */
export function useVoiceChat(options: UseVoiceChatOptions): UseVoiceChatReturn {
  const {
    apiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000',
    presenceId,
    userId = '',
    userWallet = '',
    userRole = 'member',
    voice = 'Aoede',
    authToken,
    autoStart = true,
  } = options;

  // State
  const [state, setState] = useState<VoiceClientState>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [presenceName, setPresenceName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCallInfo | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for instances
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const audioPlaybackRef = useRef<AudioPlayback | null>(null);

  // Derived state
  const isConnected = state !== 'disconnected' && state !== 'error';
  const isReady = state === 'ready' || state === 'active' || state === 'ai_speaking';
  const isAiSpeaking = state === 'ai_speaking';

  /**
   * Connect to voice chat.
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (voiceClientRef.current) {
      console.warn('[useVoiceChat] Already connected');
      return false;
    }

    setError(null);
    setTranscript([]);
    setCurrentToolCall(null);

    try {
      // Initialize audio playback
      const playback = new AudioPlayback(
        {
          sampleRate: 24000,
          jitterBufferMs: 150,
        },
        {
          onAudioLevel: setOutputLevel,
          onPlaybackStart: () => {
            console.log('[useVoiceChat] Playback started');
          },
          onPlaybackStop: () => {
            console.log('[useVoiceChat] Playback stopped');
            setOutputLevel(0);
          },
        }
      );
      await playback.initialize();
      audioPlaybackRef.current = playback;

      // Initialize audio capture
      const capture = new AudioCapture(
        {
          sampleRate: 16000,
          chunkDurationMs: 100,
        },
        {
          onAudioChunk: (chunk) => {
            if (!isMuted && voiceClientRef.current?.isReady) {
              voiceClientRef.current.sendAudio(chunk);
            }
          },
          onAudioLevel: setInputLevel,
          onError: (err) => {
            setError(`Microphone error: ${err}`);
          },
        }
      );
      audioCaptureRef.current = capture;

      // Create voice client
      const config: VoiceClientConfig = {
        wsUrl: apiUrl,
        presenceId,
        userId,
        userWallet,
        userRole,
        voice,
        authToken,
      };

      const client = new VoiceClient(config, {
        onStateChange: (newState) => {
          setState(newState);
        },
        onAudio: (audioData) => {
          playback.enqueue(audioData);
        },
        onTranscript: (entry) => {
          setTranscript((prev) => [...prev, entry]);
        },
        onToolCall: (info) => {
          setCurrentToolCall(info);
        },
        onToolResult: (info) => {
          setCurrentToolCall(info);
          // Clear after a short delay
          setTimeout(() => setCurrentToolCall(null), 2000);
        },
        onReady: (sid, name) => {
          setSessionId(sid);
          setPresenceName(name);
        },
        onError: (err) => {
          setError(err);
        },
        onInterrupted: () => {
          // Barge-in: User interrupted AI while it was speaking
          // Clear the audio playback buffer immediately so old audio stops
          console.log('[useVoiceChat] AI interrupted - clearing audio buffer');
          playback.clear();
          setOutputLevel(0);
        },
      });

      voiceClientRef.current = client;

      // Connect
      const connected = await client.connect();

      if (connected && autoStart) {
        // Start audio capture
        await capture.start();
      }

      return connected;
    } catch (err) {
      setError(String(err));
      return false;
    }
  }, [apiUrl, presenceId, userId, userWallet, userRole, voice, authToken, autoStart, isMuted]);

  /**
   * Disconnect from voice chat.
   */
  const disconnect = useCallback(() => {
    // Stop audio capture
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }

    // Stop audio playback
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.dispose();
      audioPlaybackRef.current = null;
    }

    // Disconnect voice client
    if (voiceClientRef.current) {
      voiceClientRef.current.disconnect();
      voiceClientRef.current = null;
    }

    // Reset state
    setState('disconnected');
    setSessionId(null);
    setPresenceName(null);
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  /**
   * Toggle mute state.
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;

      // Notify server
      voiceClientRef.current?.sendControl(newMuted ? 'mute' : 'unmute');

      return newMuted;
    });
  }, []);

  /**
   * Send text input.
   */
  const sendText = useCallback((text: string) => {
    if (voiceClientRef.current?.isReady) {
      voiceClientRef.current.sendText(text);

      // Add to transcript
      setTranscript((prev) => [
        ...prev,
        {
          text,
          role: 'user',
          isFinal: true,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    state,
    isConnected,
    isReady,
    isMuted,
    isAiSpeaking,

    // Session info
    sessionId,
    presenceName,

    // Transcript
    transcript,

    // Current tool call
    currentToolCall,

    // Audio levels
    inputLevel,
    outputLevel,

    // Actions
    connect,
    disconnect,
    toggleMute,
    sendText,

    // Error
    error,
  };
}

export default useVoiceChat;