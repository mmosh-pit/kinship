/**
 * Kinship Studio - Audio Playback
 *
 * Handles playback of audio from Gemini Live API.
 * Includes jitter buffer for smooth playback and barge-in support.
 */

export interface AudioPlaybackConfig {
  /** Sample rate of incoming audio (default: 24000 for Gemini output) */
  sampleRate?: number;
  /** Number of channels (default: 1 for mono) */
  channels?: number;
  /** Jitter buffer size in milliseconds (default: 150ms) */
  jitterBufferMs?: number;
}

export interface AudioPlaybackCallbacks {
  /** Called when playback starts */
  onPlaybackStart?: () => void;
  /** Called when playback stops (buffer empty) */
  onPlaybackStop?: () => void;
  /** Called with current playback level (0-1) */
  onAudioLevel?: (level: number) => void;
}

interface QueuedAudio {
  buffer: AudioBuffer;
  timestamp: number;
}

/**
 * Audio playback with jitter buffer.
 *
 * Supports barge-in (interruption) - when the user starts speaking while
 * the AI is responding, call clear() to immediately stop playback and
 * clear the buffer.
 *
 * Usage:
 *   const playback = new AudioPlayback(config, callbacks);
 *   await playback.initialize();
 *   playback.enqueue(audioData);
 *   // Audio plays automatically
 *   playback.clear();  // For barge-in
 *   playback.stop();
 */
export class AudioPlayback {
  private config: Required<AudioPlaybackConfig>;
  private callbacks: AudioPlaybackCallbacks;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  private audioQueue: QueuedAudio[] = [];
  private isPlaying = false;
  private nextPlayTime = 0;

  private levelCheckInterval: number | null = null;
  private playbackCheckInterval: number | null = null;

  // Default config
  private static readonly DEFAULT_CONFIG: Required<AudioPlaybackConfig> = {
    sampleRate: 24000,
    channels: 1,
    jitterBufferMs: 150,
  };

  constructor(
    config: AudioPlaybackConfig = {},
    callbacks: AudioPlaybackCallbacks = {}
  ) {
    this.config = { ...AudioPlayback.DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /** Whether playback is active */
  get isActive(): boolean {
    return this.isPlaying;
  }

  /** Current queue length in milliseconds */
  get queueLengthMs(): number {
    return this.audioQueue.reduce((total, item) => {
      return total + (item.buffer.duration * 1000);
    }, 0);
  }

  /**
   * Initialize audio context and nodes.
   */
  async initialize(): Promise<boolean> {
    try {
      // Create audio context with output sample rate
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Create analyser for level metering
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;

      // Connect nodes: gain -> analyser -> destination
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);

      // Start playback checker
      this.startPlaybackChecker();

      console.log('[AudioPlayback] Initialized');
      return true;
    } catch (error) {
      console.error('[AudioPlayback] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Enqueue audio data for playback.
   *
   * @param audioData - PCM audio as ArrayBuffer (16-bit signed integers)
   */
  enqueue(audioData: ArrayBuffer): void {
    if (!this.audioContext || !this.gainNode) {
      console.warn('[AudioPlayback] Not initialized');
      return;
    }

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Convert PCM to AudioBuffer
    const audioBuffer = this.pcmToAudioBuffer(audioData);
    if (!audioBuffer) {
      return;
    }

    // Add to queue
    this.audioQueue.push({
      buffer: audioBuffer,
      timestamp: Date.now(),
    });

    // Start playback if not already playing and buffer is sufficient
    if (!this.isPlaying && this.queueLengthMs >= this.config.jitterBufferMs) {
      this.startPlayback();
    }
  }

  /**
   * Convert PCM data to AudioBuffer.
   */
  private pcmToAudioBuffer(pcmData: ArrayBuffer): AudioBuffer | null {
    if (!this.audioContext) return null;

    // Interpret as 16-bit signed integers
    const int16Array = new Int16Array(pcmData);
    const numSamples = int16Array.length;

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      this.config.channels,
      numSamples,
      this.config.sampleRate
    );

    // Convert to float and fill buffer
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
      // Convert 16-bit int to float (-1 to 1)
      channelData[i] = int16Array[i] / 32768;
    }

    return audioBuffer;
  }

  /**
   * Start playing queued audio.
   */
  private startPlayback(): void {
    if (!this.audioContext || !this.gainNode || this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    this.nextPlayTime = this.audioContext.currentTime;

    // Start level monitoring
    this.startLevelMonitoring();

    this.callbacks.onPlaybackStart?.();
    console.log('[AudioPlayback] Playback started');

    this.scheduleNextChunk();
  }

  /**
   * Schedule the next audio chunk for playback.
   */
  private scheduleNextChunk(): void {
    if (!this.audioContext || !this.gainNode || !this.isPlaying) {
      return;
    }

    // Check if we have audio to play
    if (this.audioQueue.length === 0) {
      // Buffer underrun - stop playback
      this.stopPlayback();
      return;
    }

    // Get next chunk
    const chunk = this.audioQueue.shift()!;

    // Create buffer source
    const source = this.audioContext.createBufferSource();
    source.buffer = chunk.buffer;
    source.connect(this.gainNode);

    // Schedule playback
    const startTime = Math.max(this.audioContext.currentTime, this.nextPlayTime);
    source.start(startTime);

    // Update next play time
    this.nextPlayTime = startTime + chunk.buffer.duration;

    // Schedule next chunk when this one ends
    source.onended = () => {
      this.scheduleNextChunk();
    };
  }

  /**
   * Stop playback (internal).
   */
  private stopPlayback(): void {
    if (!this.isPlaying) {
      return;
    }

    this.isPlaying = false;
    this.stopLevelMonitoring();
    this.callbacks.onPlaybackStop?.();
    console.log('[AudioPlayback] Playback stopped');
  }

  /**
   * Stop playback and clear queue.
   */
  stop(): void {
    this.audioQueue = [];
    this.stopPlayback();
  }

  /**
   * Clear queue and stop playback immediately (for barge-in/interruption).
   *
   * Call this when the server sends an "interrupted" event, indicating
   * the user started speaking and the AI response was cancelled by Gemini.
   * This immediately stops playing old audio so the user doesn't hear
   * outdated response content.
   */
  clear(): void {
    console.log('[AudioPlayback] Clearing buffer (barge-in)');

    // Clear the queue
    this.audioQueue = [];

    // Stop playback immediately
    this.stopPlayback();

    // Reset next play time so new audio starts fresh
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
  }

  /**
   * Set volume (0-1).
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Start monitoring audio level for visualization.
   */
  private startLevelMonitoring(): void {
    if (!this.analyserNode || !this.callbacks.onAudioLevel) {
      return;
    }

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.levelCheckInterval = window.setInterval(() => {
      if (!this.analyserNode || !this.isPlaying) return;

      this.analyserNode.getByteFrequencyData(dataArray);

      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = rms / 255;

      this.callbacks.onAudioLevel?.(level);
    }, 50);
  }

  /**
   * Stop level monitoring.
   */
  private stopLevelMonitoring(): void {
    if (this.levelCheckInterval) {
      clearInterval(this.levelCheckInterval);
      this.levelCheckInterval = null;
    }
  }

  /**
   * Start periodic check for playback state.
   */
  private startPlaybackChecker(): void {
    // Check if we should start playback (jitter buffer filled)
    this.playbackCheckInterval = window.setInterval(() => {
      if (
        !this.isPlaying &&
        this.audioQueue.length > 0 &&
        this.queueLengthMs >= this.config.jitterBufferMs
      ) {
        this.startPlayback();
      }
    }, 50);
  }

  /**
   * Cleanup and release resources.
   */
  dispose(): void {
    this.stop();

    if (this.playbackCheckInterval) {
      clearInterval(this.playbackCheckInterval);
      this.playbackCheckInterval = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('[AudioPlayback] Disposed');
  }
}