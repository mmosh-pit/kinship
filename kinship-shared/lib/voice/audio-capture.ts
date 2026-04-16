/**
 * Kinship Studio - Audio Capture
 *
 * Handles microphone capture and audio processing for voice chat.
 * Outputs 16kHz PCM audio suitable for Gemini Live API.
 */

export interface AudioCaptureConfig {
  /** Target sample rate (default: 16000 for Gemini) */
  sampleRate?: number;
  /** Audio chunk duration in milliseconds (default: 100ms) */
  chunkDurationMs?: number;
  /** Enable echo cancellation */
  echoCancellation?: boolean;
  /** Enable noise suppression */
  noiseSuppression?: boolean;
  /** Enable auto gain control */
  autoGainControl?: boolean;
}

export interface AudioCaptureCallbacks {
  /** Called with audio chunks */
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  /** Called when capture starts */
  onStart?: () => void;
  /** Called when capture stops */
  onStop?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Called with audio level (0-1) for visualization */
  onAudioLevel?: (level: number) => void;
}

/**
 * Audio capture from microphone.
 *
 * Usage:
 *   const capture = new AudioCapture(config, callbacks);
 *   await capture.start();
 *   // Audio chunks sent via onAudioChunk callback
 *   capture.stop();
 */
export class AudioCapture {
  private config: AudioCaptureConfig;
  private callbacks: AudioCaptureCallbacks;

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private isCapturing = false;
  private levelCheckInterval: number | null = null;

  // Default config
  private static readonly DEFAULT_CONFIG: Required<AudioCaptureConfig> = {
    sampleRate: 16000,
    chunkDurationMs: 100,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  constructor(
    config: AudioCaptureConfig = {},
    callbacks: AudioCaptureCallbacks = {}
  ) {
    this.config = { ...AudioCapture.DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /** Whether capture is active */
  get isActive(): boolean {
    return this.isCapturing;
  }

  /**
   * Request microphone permission and start capturing.
   */
  async start(): Promise<boolean> {
    if (this.isCapturing) {
      console.warn('[AudioCapture] Already capturing');
      return true;
    }

    try {
      // Request microphone access
      console.log('[AudioCapture] Requesting microphone access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          sampleRate: this.config.sampleRate,
        },
        video: false,
      });

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create source node from microphone stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      // Create analyser for level metering
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.sourceNode.connect(this.analyserNode);

      // Try to use AudioWorklet for low-latency processing
      try {
        await this.setupAudioWorklet();
      } catch (error) {
        console.warn('[AudioCapture] AudioWorklet not available, using ScriptProcessor fallback');
        this.setupScriptProcessor();
      }

      // Start level monitoring
      this.startLevelMonitoring();

      this.isCapturing = true;
      this.callbacks.onStart?.();
      console.log('[AudioCapture] Started capturing');

      return true;
    } catch (error) {
      console.error('[AudioCapture] Failed to start:', error);
      this.callbacks.onError?.(String(error));
      return false;
    }
  }

  /**
   * Stop capturing audio.
   */
  stop(): void {
    if (!this.isCapturing) {
      return;
    }

    console.log('[AudioCapture] Stopping capture...');

    // Stop level monitoring
    if (this.levelCheckInterval) {
      clearInterval(this.levelCheckInterval);
      this.levelCheckInterval = null;
    }

    // Disconnect nodes
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Stop media stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.isCapturing = false;
    this.callbacks.onStop?.();
    console.log('[AudioCapture] Stopped');
  }

  /**
   * Setup AudioWorklet for low-latency processing.
   */
  private async setupAudioWorklet(): Promise<void> {
    if (!this.audioContext || !this.sourceNode) {
      throw new Error('Audio context not initialized');
    }

    // Create inline worklet processor code
    const processorCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferSize = ${Math.floor((this.config.sampleRate! * this.config.chunkDurationMs!) / 1000)};
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) return true;

          const channelData = input[0];

          for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            if (this.bufferIndex >= this.bufferSize) {
              // Convert to 16-bit PCM
              const pcm = new Int16Array(this.bufferSize);
              for (let j = 0; j < this.bufferSize; j++) {
                const s = Math.max(-1, Math.min(1, this.buffer[j]));
                pcm[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              this.port.postMessage(pcm.buffer, [pcm.buffer]);
              this.buffer = new Float32Array(this.bufferSize);
              this.bufferIndex = 0;
            }
          }

          return true;
        }
      }

      registerProcessor('pcm-processor', PCMProcessor);
    `;

    // Create blob URL for the processor
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    // Load the worklet module
    await this.audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // Handle audio chunks from worklet
    this.workletNode.port.onmessage = (event) => {
      this.callbacks.onAudioChunk?.(event.data);
    };

    // Connect source -> worklet
    this.sourceNode.connect(this.workletNode);
  }

  /**
   * Fallback to ScriptProcessorNode for browsers without AudioWorklet.
   */
  private setupScriptProcessor(): void {
    if (!this.audioContext || !this.sourceNode) {
      throw new Error('Audio context not initialized');
    }

    const bufferSize = Math.pow(2, Math.ceil(Math.log2(
      (this.config.sampleRate! * this.config.chunkDurationMs!) / 1000
    )));

    // Note: ScriptProcessorNode is deprecated but needed for older browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scriptNode = (this.audioContext as any).createScriptProcessor(
      bufferSize,
      1,
      1
    );

    scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Convert to 16-bit PCM
      const pcm = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.callbacks.onAudioChunk?.(pcm.buffer);
    };

    this.sourceNode.connect(scriptNode);
    scriptNode.connect(this.audioContext.destination);
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
      if (!this.analyserNode) return;

      this.analyserNode.getByteFrequencyData(dataArray);

      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = rms / 255; // Normalize to 0-1

      this.callbacks.onAudioLevel?.(level);
    }, 50); // 20fps
  }

  /**
   * Check if microphone permission is granted.
   */
  static async checkPermission(): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      return result.state;
    } catch {
      // Fallback for browsers that don't support permissions query
      return 'prompt';
    }
  }

  /**
   * Get list of available audio input devices.
   */
  static async getDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }
}