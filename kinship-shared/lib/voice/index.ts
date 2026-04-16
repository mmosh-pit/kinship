/**
 * Kinship Studio - Voice Chat Module
 *
 * Real-time voice chat with Gemini Live API.
 * Supports barge-in (interruption) when user speaks during AI response.
 */

export { VoiceClient } from './voice-client';
export type {
  VoiceClientConfig,
  VoiceClientState,
  VoiceClientCallbacks,
  TranscriptEntry,
  ToolCallInfo,
} from './voice-client';

export { AudioCapture } from './audio-capture';
export type {
  AudioCaptureConfig,
  AudioCaptureCallbacks,
} from './audio-capture';

export { AudioPlayback } from './audio-playback';
export type {
  AudioPlaybackConfig,
  AudioPlaybackCallbacks,
} from './audio-playback';