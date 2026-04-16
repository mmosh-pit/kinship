/**
 * Kinship Studio - Voice Chat Client
 *
 * WebSocket client for real-time voice chat with Gemini Live API.
 * Handles connection, audio streaming, and message handling.
 * Supports barge-in (interruption) when user speaks during AI response.
 */

export type VoiceClientState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'active'
  | 'ai_speaking'
  | 'error';

export interface VoiceClientConfig {
  /** Backend WebSocket URL */
  wsUrl: string;
  /** Presence agent ID */
  presenceId: string;
  /** User ID */
  userId?: string;
  /** User wallet address */
  userWallet?: string;
  /** User role */
  userRole?: string;
  /** Voice name */
  voice?: string;
  /** Auth token for API calls */
  authToken?: string;
}

export interface TranscriptEntry {
  text: string;
  role: 'user' | 'assistant';
  isFinal: boolean;
  timestamp: Date;
}

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
}

export interface VoiceClientCallbacks {
  /** Called when audio data is received from the server */
  onAudio?: (audioData: ArrayBuffer) => void;
  /** Called when transcript is received */
  onTranscript?: (entry: TranscriptEntry) => void;
  /** Called when a tool is being called */
  onToolCall?: (info: ToolCallInfo) => void;
  /** Called when a tool returns a result */
  onToolResult?: (info: ToolCallInfo) => void;
  /** Called when state changes */
  onStateChange?: (state: VoiceClientState) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Called when session is ready */
  onReady?: (sessionId: string, presenceName: string) => void;
  /**
   * Called when AI is interrupted by user (barge-in).
   * 
   * This happens when Gemini detects user speech while generating a response.
   * Gemini automatically stops generation - the frontend must clear its
   * audio playback buffer to stop playing the old response.
   */
  onInterrupted?: () => void;
}

/**
 * Voice chat WebSocket client.
 *
 * Usage:
 *   const client = new VoiceClient(config, callbacks);
 *   await client.connect();
 *   client.sendAudio(audioBuffer);
 *   client.disconnect();
 */
export class VoiceClient {
  private config: VoiceClientConfig;
  private callbacks: VoiceClientCallbacks;
  private ws: WebSocket | null = null;
  private _state: VoiceClientState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private sessionId: string | null = null;
  private presenceName: string | null = null;

  constructor(config: VoiceClientConfig, callbacks: VoiceClientCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /** Current connection state */
  get state(): VoiceClientState {
    return this._state;
  }

  /** Whether client is connected and ready */
  get isReady(): boolean {
    return this._state === 'ready' || this._state === 'active' || this._state === 'ai_speaking';
  }

  /** Session ID from server */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /** Presence name from server */
  get currentPresenceName(): string | null {
    return this.presenceName;
  }

  private setState(state: VoiceClientState): void {
    const oldState = this._state;
    this._state = state;
    console.log(`[VoiceClient] State: ${oldState} -> ${state}`);
    this.callbacks.onStateChange?.(state);
  }

  /**
   * Build WebSocket URL with query parameters.
   * Includes authToken for MCP tool authentication (browsers can't send WS headers).
   */
  private buildWsUrl(): string {
    const params = new URLSearchParams({
      presenceId: this.config.presenceId,
      userId: this.config.userId || '',
      userWallet: this.config.userWallet || '',
      userRole: this.config.userRole || 'member',
      voice: this.config.voice || 'Aoede',
    });

    // Add auth token as query param (WebSocket can't use Authorization header in browsers)
    if (this.config.authToken) {
      params.set('authToken', this.config.authToken);
    }

    // Handle both ws:// and http:// base URLs
    let baseUrl = this.config.wsUrl;
    if (baseUrl.startsWith('http://')) {
      baseUrl = baseUrl.replace('http://', 'ws://');
    } else if (baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace('https://', 'wss://');
    }

    return `${baseUrl}/api/voice/session?${params.toString()}`;
  }

  /**
   * Connect to the voice server.
   */
  async connect(): Promise<boolean> {
    if (this._state !== 'disconnected' && this._state !== 'error') {
      console.warn('[VoiceClient] Already connected or connecting');
      return false;
    }

    this.setState('connecting');

    return new Promise((resolve) => {
      try {
        const wsUrl = this.buildWsUrl();
        console.log('[VoiceClient] Connecting to:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        // Connection opened
        this.ws.onopen = () => {
          console.log('[VoiceClient] WebSocket connected');
          this.setState('connected');
          this.reconnectAttempts = 0;
        };

        // Message received
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        // Connection closed
        this.ws.onclose = (event) => {
          console.log('[VoiceClient] WebSocket closed:', event.code, event.reason);
          this.ws = null;

          if (this._state !== 'disconnected') {
            this.setState('disconnected');
          }

          resolve(false);
        };

        // Connection error
        this.ws.onerror = (error) => {
          console.error('[VoiceClient] WebSocket error:', error);
          this.setState('error');
          this.callbacks.onError?.('Connection error');
          resolve(false);
        };

        // Set timeout for connection
        setTimeout(() => {
          if (this._state === 'connecting') {
            console.error('[VoiceClient] Connection timeout');
            this.ws?.close();
            this.setState('error');
            this.callbacks.onError?.('Connection timeout');
            resolve(false);
          }
        }, 10000);

        // Wait for ready message
        const checkReady = setInterval(() => {
          if (this._state === 'ready') {
            clearInterval(checkReady);
            resolve(true);
          } else if (this._state === 'error' || this._state === 'disconnected') {
            clearInterval(checkReady);
            resolve(false);
          }
        }, 100);
      } catch (error) {
        console.error('[VoiceClient] Failed to connect:', error);
        this.setState('error');
        this.callbacks.onError?.(String(error));
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from the voice server.
   */
  disconnect(): void {
    if (this.ws) {
      // Send end control message
      this.sendControl('end');

      // Close WebSocket
      this.ws.close();
      this.ws = null;
    }

    this.sessionId = null;
    this.presenceName = null;
    this.setState('disconnected');
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const type = message.type;

      switch (type) {
        case 'ready':
          this.sessionId = message.sessionId;
          this.presenceName = message.presenceName;
          this.setState('ready');
          this.callbacks.onReady?.(message.sessionId, message.presenceName);
          break;

        case 'audio':
          if (message.data) {
            const audioData = this.base64ToArrayBuffer(message.data);
            this.callbacks.onAudio?.(audioData);
          }
          break;

        case 'transcript':
          this.callbacks.onTranscript?.({
            text: message.text,
            role: message.role || 'assistant',
            isFinal: message.isFinal || false,
            timestamp: new Date(),
          });
          break;

        case 'tool_call':
          this.callbacks.onToolCall?.({
            name: message.name,
            arguments: message.arguments || {},
            status: 'pending',
          });
          break;

        case 'tool_result':
          this.callbacks.onToolResult?.({
            name: message.name,
            arguments: {},
            result: message.result,
            status: message.result?.success ? 'success' : 'error',
          });
          break;

        case 'state':
          // Update internal state based on server state
          if (message.state === 'active') {
            this.setState('active');
          } else if (message.state === 'ai_speaking') {
            this.setState('ai_speaking');
          } else if (message.state === 'ready') {
            this.setState('ready');
          }
          break;

        case 'interrupted':
          // AI was interrupted by user (barge-in)
          // Gemini detected user speech and stopped generating
          // Frontend should clear audio playback buffer immediately
          console.log('[VoiceClient] AI interrupted by user (barge-in)');
          this.callbacks.onInterrupted?.();
          break;

        case 'error':
          console.error('[VoiceClient] Server error:', message.message);
          this.callbacks.onError?.(message.message);
          break;

        case 'ping':
          // Keepalive ping from server, no action needed
          break;

        default:
          console.warn('[VoiceClient] Unknown message type:', type);
      }
    } catch (error) {
      console.error('[VoiceClient] Failed to parse message:', error);
    }
  }

  /**
   * Send audio data to the server.
   */
  sendAudio(audioBuffer: ArrayBuffer): boolean {
    if (!this.isReady || !this.ws) {
      return false;
    }

    const base64 = this.arrayBufferToBase64(audioBuffer);
    this.ws.send(
      JSON.stringify({
        type: 'audio',
        data: base64,
      })
    );

    return true;
  }

  /**
   * Send text input to the server.
   */
  sendText(text: string): boolean {
    if (!this.isReady || !this.ws) {
      return false;
    }

    this.ws.send(
      JSON.stringify({
        type: 'text',
        text: text,
      })
    );

    return true;
  }

  /**
   * Send control message to the server.
   */
  sendControl(action: 'mute' | 'unmute' | 'end'): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(
      JSON.stringify({
        type: 'control',
        action: action,
      })
    );

    return true;
  }

  /**
   * Convert ArrayBuffer to base64 string.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer.
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}