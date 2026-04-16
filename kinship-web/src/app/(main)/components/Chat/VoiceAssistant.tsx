"use client";
import React, { useEffect, useRef, useCallback } from "react";
import useAudioVisualizer from "./AudioVisualizer";
import Select from "../common/Select";
import { useAtom } from "jotai";
import { selectedChatStore } from "@/app/(main)/store/chat";
import CloseIcon from "@/assets/icons/CloseIcon";

const VoiceAssistant = (props: any) => {
  // Refs for DOM elements
  const recordButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLParagraphElement | null>(null);

  // Replace previous `let` with refs so they persist across renders
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [selectedChat, setSelectedChat] = useAtom(selectedChatStore);

  // Use the refs returned from the audio visualizer hook
  const {
    canvasRef,
    ctxRef,
    audioContextRef,
    analyserRef,
    dataArrayRef,
    sourceRef,
    isPlayingRef,
    setup,
    stop,
  } = useAudioVisualizer("visualizer");

  // Worklet nodes and control flags
  const micWorkletNodeRef = useRef<any>(null);
  const ttsWorkletNodeRef = useRef<any>(null);
  const userInitiatedStopRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);

  const [isMicOn, setIsMicOn] = React.useState(false);
  const [isInitiated, setIsInitiated] = React.useState(false);

  // VAD settings & counter
  const VAD_THRESHOLD = 0.02;
  const VAD_CONSECUTIVE_FRAMES = 3;
  const vadFrameCountRef = useRef<number>(0);

  // ---------- Helpers ----------
  function showError(message: string) {
    const toast = document.getElementById("error-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 5000);
  }

  function updateButtonState(state: "recording" | "connecting" | "idle") {
    const recordButton = recordButtonRef.current;
    if (!recordButton) return;

    switch (state) {
      case "recording":
        recordButton.classList.add("recording");
        recordButton.innerHTML = `<svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            color="#fff"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="feather feather-mic"
          >
            <path
              d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
            ></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>`;
        isRecordingRef.current = true;
        setIsMicOn(true);
        break;

      case "connecting":
        recordButton.classList.remove("recording");
        recordButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <linearGradient id="a11">
        <stop offset="0" stop-color="#000000ff" stop-opacity="0"></stop>
        <stop offset="1" stop-color="#020202ff"></stop>
    </linearGradient>
    <circle fill="none" stroke="url(#a11)" stroke-width="15" stroke-linecap="round" stroke-dasharray="0 44 0 44 0 44 0 44 0 360" cx="100" cy="100" r="70" transform-origin="center">
        <animateTransform type="rotate" attributeName="transform" calcMode="discrete" dur="2" values="360;324;288;252;216;180;144;108;72;36" repeatCount="indefinite"></animateTransform>
    </circle>
</svg>`;
        isRecordingRef.current = false;
        setIsMicOn(false);
        break;

      case "idle":
      default:
        recordButton.classList.remove("recording");
        recordButton.innerHTML = `<svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            color="#000"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="feather feather-mic"
          >
            <path
              d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
            ></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>`;
        isRecordingRef.current = false;
        setIsMicOn(false);
        break;
    }
  }

  function setupAudioVisualization(stream: MediaStream) {
    setup(stream);
  }

  // ---------- Barge-in / VAD ----------
  function cancelTTS() {
    if (ttsWorkletNodeRef.current) {
      ttsWorkletNodeRef.current.port.postMessage({ type: "clear" });
      console.log("TTS cancelled due to user speech (barge-in)");
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "tts_cancel" }));
    }

    // If playing, notify stop
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "tts_stop" }));
      }
    }

    // Reset VAD
    vadFrameCountRef.current = 0;
  }

  function detectVoiceActivity(pcmData: Int16Array) {
    let sum = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const normalized = pcmData[i] / 32768;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / pcmData.length);

    if (rms > VAD_THRESHOLD) {
      vadFrameCountRef.current++;
      if (
        vadFrameCountRef.current >= VAD_CONSECUTIVE_FRAMES &&
        isPlayingRef.current
      ) {
        cancelTTS();
      }
    } else {
      vadFrameCountRef.current = 0;
    }
    return rms > VAD_THRESHOLD;
  }

  // ---------- Audio Context Init ----------
  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, [audioContextRef]);

  // ---------- Start / Stop Recording ----------
  async function startRecording() {
    if (isRecordingRef.current || isInitiated) return;
    isRecordingRef.current = true;
    setIsMicOn(true);
    userInitiatedStopRef.current = false;
    updateButtonState("connecting");
    setIsInitiated(true);

    try {
      // Get user media
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
        },
      });
      micStreamRef.current = micStream;

      const wsUrl = `wss://ai.kinship.today/ws?token=${localStorage.getItem("token") || ""}&agent_id=${selectedChat!.chatAgent!.id}&bot_id=${selectedChat!.chatAgent!.key}&ai_model=${props.selectedModel || "gpt-5.1"}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("WebSocket connection established.");
        try {
          setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 25000);
          const systemPrompt =
            selectedChat!.chatAgent!.system_prompt +
            `agentId: ${selectedChat!.chatAgent!.key}, authorization: ${localStorage.getItem("token")}`;
          ws.send(
            JSON.stringify({
              type: "system_prompt",
              content: systemPrompt,
            }),
          );
          await initAudioContext();
          await setupAudioWorklet(micStream);
          setupAudioVisualization(micStream);
          await setupTTSPlayback();
          updateButtonState("recording");
        } catch (error: any) {
          setIsInitiated(false);
          console.error("Error setting up audio:", error);
          showError(
            `Failed to initialize audio processing: ${error?.message ?? error}`,
          );
          stopRecording();
        }
      };

      ws.onmessage = handleMessages;
      ws.onerror = (err) => {
        setIsInitiated(false);
        console.error("WebSocket Error:", err);
        showError("Connection error. Please try again.");
        stopRecording();
      };

      ws.onclose = (event) => {
        setIsInitiated(false);
        console.log(
          `WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`,
        );
        if (!userInitiatedStopRef.current) {
          showError("Connection lost. Please restart recording.");
        }
        stopRecording();
      };
    } catch (err) {
      setIsInitiated(false);
      console.error("Error getting user media:", err);
      showError(
        "Could not access microphone. Please grant permission and try again.",
      );
      updateButtonState("idle");
    }
  }

  function stopRecording() {
    isRecordingRef.current = false;
    setIsMicOn(false);
    userInitiatedStopRef.current = true;

    // Send disconnect message to server BEFORE closing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "disconnect" }));
        console.log("Disconnect message sent to server");
      } catch (e) {
        console.error("Error sending disconnect message:", e);
      }
    }

    // Disconnect and clean up worklets
    if (micWorkletNodeRef.current) {
      try {
        micWorkletNodeRef.current.disconnect();
      } catch (e) { }
      micWorkletNodeRef.current = null;
    }

    if (ttsWorkletNodeRef.current) {
      try {
        ttsWorkletNodeRef.current.disconnect();
      } catch (e) { }
      ttsWorkletNodeRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close(1000, "User initiated disconnect");
          wsRef.current = null;
        }
      }, 100);
    }

    // stop visualization audio context via hook stop()
    try {
      stop();
    } catch (e) { }

    // close audioContext if exists
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }

    vadFrameCountRef.current = 0;
    updateButtonState("idle");
  }

  // ---------- AudioWorklet Setup ----------
  async function setupAudioWorklet(stream: MediaStream) {
    if (!audioContextRef.current)
      throw new Error("AudioContext not initialized");

    // load pcm worklet script
    const pcmURL = buildPCMWorkletProcessorURL();
    await audioContextRef.current.audioWorklet.addModule(pcmURL);

    const source = audioContextRef.current.createMediaStreamSource(stream);

    micWorkletNodeRef.current = new (window.AudioWorkletNode ||
      (audioContextRef.current as any).AudioWorkletNode)(
        audioContextRef.current,
        "pcm-worklet-processor",
      );

    // Buffer logic
    let audioBufferChunks: Int16Array[] = [];
    let bufferSize = 0;
    const headerBytes = 10;
    const targetBufferSize = 24000;

    micWorkletNodeRef.current.port.onmessage = (event: any) => {
      const pcmData = new Int16Array(event.data);

      // Always run VAD
      detectVoiceActivity(pcmData);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        audioBufferChunks.push(pcmData);
        bufferSize += pcmData.length;

        if (bufferSize >= targetBufferSize && !isPlayingRef.current) {
          const combinedBuffer = new Int16Array(bufferSize);
          let offset = 0;
          for (const chunk of audioBufferChunks) {
            combinedBuffer.set(chunk, offset);
            offset += chunk.length;
          }

          const dataBuffer = new ArrayBuffer(
            combinedBuffer.byteLength + headerBytes,
          );
          const dataView = new DataView(dataBuffer);
          const dataInt16 = new Int16Array(dataBuffer, headerBytes);

          const identifier = 1;
          const ts = BigInt(Date.now());

          dataView.setUint16(0, identifier, false);
          dataView.setBigUint64(2, ts, false);
          dataInt16.set(combinedBuffer);

          ws.send(dataBuffer);

          audioBufferChunks = [];
          bufferSize = 0;
        }
      }
    };

    // Connect audio graph
    source.connect(micWorkletNodeRef.current);
    micWorkletNodeRef.current.connect(audioContextRef.current.destination);

    console.log("AudioWorklet (mic) started.");
  }

  function buildPCMWorkletProcessorURL() {
    const processorCode = `
    class PCMWorkletProcessor extends AudioWorkletProcessor {
      process(inputs, outputs, parameters) {
        // Check if we have valid input
        if (inputs.length === 0 || !inputs[0] || inputs[0].length === 0) {
          return true;
        }

        const input = inputs[0];
        const inputChannel = input[0]; // Get first channel

        if (inputChannel && inputChannel.length > 0) {
          // convert Float32 → Int16 in the worklet
          const int16 = new Int16Array(inputChannel.length);
          for (let i = 0; i < inputChannel.length; i++) {
            let s = inputChannel[i];
            s = Math.max(-1, Math.min(1, s)); // Clamp to [-1, 1]
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; // Float32 → PCM16
          }

          // Send raw ArrayBuffer, transferable
          try {
            this.port.postMessage(int16.buffer, [int16.buffer]);
          } catch (error) {
            this.port.postMessage(int16.buffer.slice(0));
          }
        }
        return true;
      }
    }

    registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
  `;

    return URL.createObjectURL(
      new Blob([processorCode], { type: "application/javascript" }),
    );
  }

  async function setupTTSPlayback() {
    if (!audioContextRef.current)
      throw new Error("AudioContext not initialized");

    const ttsURL = buildTTSPlaybackProcessorURL();
    await audioContextRef.current.audioWorklet.addModule(ttsURL);

    ttsWorkletNodeRef.current = new (window.AudioWorkletNode ||
      (audioContextRef.current as any).AudioWorkletNode)(
        audioContextRef.current,
        "tts-playback-processor",
      );

    ttsWorkletNodeRef.current.port.onmessage = (event: any) => {
      const { type } = event.data;
      const ws = wsRef.current;
      if (type === "ttsPlaybackStarted") {
        if (!isPlayingRef.current && ws && ws.readyState === WebSocket.OPEN) {
          isPlayingRef.current = true;
          console.log("TTS playback started.");
          ws.send(JSON.stringify({ type: "tts_start" }));
        }
      } else if (type === "ttsPlaybackStopped") {
        if (isPlayingRef.current && ws && ws.readyState === WebSocket.OPEN) {
          isPlayingRef.current = false;
          console.log("TTS playback stopped.");
          ws.send(JSON.stringify({ type: "tts_stop" }));
        }
      }
    };

    ttsWorkletNodeRef.current.connect(audioContextRef.current.destination);
    console.log("TTS playback worklet started.");
  }
  function buildTTSPlaybackProcessorURL() {
    const processorCode = `
    class TTSPlaybackProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.bufferQueue = [];
        this.readOffset = 0;
        this.samplesRemaining = 0;
        this.isPlaying = false;

        // Listen for incoming messages
        this.port.onmessage = (event) => {
          const data = event.data;

          // Handle clear command
          if (data && typeof data === "object" && data.type === "clear") {
            this.bufferQueue = [];
            this.readOffset = 0;
            this.samplesRemaining = 0;
            this.isPlaying = false;
            return;
          }

          // Otherwise treat incoming data as PCM chunk (Int16Array)
          this.bufferQueue.push(data);
          this.samplesRemaining += data.length;
        };
      }

      process(inputs, outputs) {
        const outputChannel = outputs[0][0];

        // No samples to play
        if (this.samplesRemaining === 0) {
          outputChannel.fill(0);

          if (this.isPlaying) {
            this.isPlaying = false;
            this.port.postMessage({ type: 'ttsPlaybackStopped' });
          }

          return true;
        }

        // First sample after idle → signal start
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.port.postMessage({ type: 'ttsPlaybackStarted' });
        }

        let outIdx = 0;

        // Fill output buffer with PCM samples
        while (outIdx < outputChannel.length && this.bufferQueue.length > 0) {
          const currentBuffer = this.bufferQueue[0];
          const sampleValue = currentBuffer[this.readOffset] / 32768;
          outputChannel[outIdx++] = sampleValue;

          this.readOffset++;
          this.samplesRemaining--;

          // Move to next chunk
          if (this.readOffset >= currentBuffer.length) {
            this.bufferQueue.shift();
            this.readOffset = 0;
          }
        }

        // Fill remainder with silence
        while (outIdx < outputChannel.length) {
          outputChannel[outIdx++] = 0;
        }

        return true;
      }
    }

    registerProcessor('tts-playback-processor', TTSPlaybackProcessor);
  `;

    return URL.createObjectURL(
      new Blob([processorCode], { type: "application/javascript" }),
    );
  }

  // ---------- WebSocket Message Handling ----------
  async function handleMessages(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      const { type, content, timestamp } = message;

      switch (type) {
        case "keepalive":
          console.log("Connection alive");
        case "pong":
          console.log("Connection alive");
        case "user.transcript.start":
          handleUserTranscriptStart();
          break;
        case "user.transcript.text.delta":
          handleUserTranscriptDelta(content, timestamp);
          break;
        case "user.transcript.end":
          handleUserTranscriptEnd();
          break;
        case "user.transcript.text":
          handleUserTranscript(content, timestamp);
          break;
        case "ai.response.text.start":
          handleAIResponseStart();
          break;
        case "ai.response.speech.start":
          handleAISpeechStart();
          break;
        case "ai.response.text.delta":
          handleAITextDelta(content, timestamp);
          break;
        case "ai.response.speech.delta":
          await handleAISpeechDelta(content, timestamp);
          break;
        case "ai.response.text.end":
          handleAIResponseEnd();
          break;
        case "ai.response.speech.end":
          handleAISpeechEnd();
          break;
        case "voice_changed":
          console.log(`✅ Voice changed to: ${content || message.voice}`);
          break;
        case "instructions_changed":
          console.log("✅ TTS instructions updated");
          break;
        case "available_voices":
          console.log("Available voices:", message.voices);
          console.log("Current voice:", message.current);
          break;
        case "error":
          console.error("Server error:", content || message.message);
          showError(content || message.message);
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (err) {
      console.error("Error handling message:", err);
    }
  }

  // ---------- Transcript handlers ----------
  function handleUserTranscriptStart() {
    if (isPlayingRef.current) {
      cancelTTS();
    }
    if (transcriptRef.current) transcriptRef.current.innerText = "";
    console.log("User transcript started");
  }

  function handleUserTranscriptDelta(content: string, timestamp: any) {
    if (!transcriptRef.current) return;
    transcriptRef.current.innerText += content;
    if (transcriptRef.current.innerText.length >= 120) {
      transcriptRef.current.innerText =
        "..." + transcriptRef.current.innerText.slice(-120);
    }
    console.log("User transcript delta:", content);
  }

  function handleUserTranscriptEnd() {
    console.log("User transcript ended");
  }

  function handleUserTranscript(content: string, timestamp: any) {
    console.log("User transcript:", content);
  }

  function handleAIResponseStart() {
    if (transcriptRef.current) transcriptRef.current.innerText = "";
    console.log("AI response started");
  }

  function handleAISpeechStart() {
    console.log("AI speech started");
    // Pause visualizer drawing
    isPlayingRef.current = false;
  }

  function handleAITextDelta(content: string, timestamp: any) {
    if (!transcriptRef.current) return;
    transcriptRef.current.innerText += content;
    if (transcriptRef.current.innerText.length >= 120) {
      transcriptRef.current.innerText =
        "..." + transcriptRef.current.innerText.slice(-120);
    }
    console.log("AI text delta:", content);
  }

  async function handleAISpeechDelta(base64Audio: string, timestamp: any) {
    try {
      const int16Data = base64ToInt16Array(base64Audio);

      // openAI sample rate is 24000; resample to audioContext sample rate
      const openAiSampleRate = 24000;
      const outputSampleRate = audioContextRef.current?.sampleRate ?? 48000;

      const resampledData = await resampleInt16Array(
        int16Data,
        openAiSampleRate,
        outputSampleRate,
      );

      if (ttsWorkletNodeRef.current) {
        // Post resampled Int16Array to tts worklet
        ttsWorkletNodeRef.current.port.postMessage(resampledData);
      }
    } catch (error) {
      console.error("Error handling speech delta:", error);
    }
  }

  function handleAIResponseEnd() {
    console.log("AI response ended");
  }

  function handleAISpeechEnd() {
    console.log("AI speech ended");
    // Resume visualizer if analyser exists
    if (analyserRef.current) {
      isPlayingRef.current = true;
    }
  }

  // ---------- Utilities ----------
  async function resampleInt16Array(
    int16Array: Int16Array,
    inputSampleRate: number,
    outputSampleRate: number,
  ): Promise<Int16Array> {
    if (inputSampleRate === outputSampleRate) {
      return int16Array;
    }

    // Convert Int16 -> Float32 in [-1,1]
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const offlineContext = new OfflineAudioContext(
      1,
      Math.ceil((float32Array.length * outputSampleRate) / inputSampleRate),
      outputSampleRate,
    );

    const bufferSource = offlineContext.createBufferSource();
    const audioBuffer = offlineContext.createBuffer(
      1,
      float32Array.length,
      inputSampleRate,
    );

    audioBuffer.copyToChannel(float32Array, 0);
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start(0);

    const resampledBuffer = await offlineContext.startRendering();
    const resampledData = resampledBuffer.getChannelData(0);

    const resampledInt16Array = new Int16Array(resampledData.length);
    for (let i = 0; i < resampledData.length; i++) {
      const s = Math.max(-1, Math.min(1, resampledData[i]));
      resampledInt16Array[i] = Math.round(s * 32767);
    }

    return resampledInt16Array;
  }

  function base64ToInt16Array(b64: string) {
    const raw = atob(b64);
    const buf = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) {
      view[i] = raw.charCodeAt(i);
    }
    return new Int16Array(buf);
  }

  // ---------- Voice control helpers ----------
  function setVoice(voice: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_voice", voice }));
      console.log(`Requesting voice change to: ${voice}`);
    } else {
      console.warn("WebSocket not connected. Cannot change voice.");
    }
  }

  function setInstructions(instructions: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_instructions", instructions }));
    } else {
      console.warn("WebSocket not connected. Cannot change instructions.");
    }
  }

  function getAvailableVoices() {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "get_voices" }));
    } else {
      console.warn("WebSocket not connected. Cannot get voices.");
    }
  }

  const AVAILABLE_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
  ];

  // ---------- Component mount / unmount ----------
  useEffect(() => {
    updateButtonState("idle");

    return () => {
      // cleanup on unmount - ensure proper disconnect
      if (isRecordingRef.current) {
        stopRecording();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- UI handlers ----------
  function onRecordButtonClick() {
    if (!isRecordingRef.current) {
      startRecording();
    } else {
      stopRecording();
    }
  }
  function onVoiceChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newVoice = event.target.value;
    props.setSelectedVoice(newVoice);
    setVoice(newVoice); // already defined in your code
  }

  // ---------- Render ----------
  return (
    <div className="w-[90%] h-[38rem] flex flex-col items-center justify-between mx-14 my-5 bg-[#181747] backdrop-filter backdrop-blur-[6px] px-8 py-10 rounded-xl ">
      <div className="container h-full">
        <div className="h-full">
          <div className="lg:col-start-2 xl:col-start-2 flex justify-end">
            <div className="w-[155px]">
              <Select
                value={props.selectedVoice}
                onChange={(e) => {
                  onVoiceChange;
                }}
                options={[
                  { label: "Alloy", value: "alloy" },
                  { label: "Ash", value: "ash" },
                  { label: "Ballad", value: "ballad" },
                  { label: "Coral", value: "coral" },
                  { label: "Echo", value: "echo" },
                  { label: "Fable", value: "fable" },
                  { label: "Onyx", value: "onyx" },
                  { label: "Nova", value: "nova" },
                  { label: "Sage", value: "sage" },
                  { label: "Shimmer", value: "shimmer" },
                ]}
              />
            </div>
          </div>

          {!isMicOn && (
            <p id="transcript" className="text-center mb-5" ref={transcriptRef}>
              Click the Mic button and start the conversation <br /> with Agent
            </p>
          )}
          {isMicOn && (
            <p id="transcript" className="text-center mb-5" ref={transcriptRef}>
              I am listening
            </p>
          )}

          <div className="relative">
            <canvas id="visualizer" className="w-full bg-transparent" />

            <button
              id="record-button"
              className={`${isMicOn ? "bg-sky-500" : "bg-white"} rounded-full w-[70px] h-[70px] flex justify-center items-center
           absolute bottom-3 left-1/2 top-[70%] transform -translate-x-1/2 -translate-y-1/2`}
              ref={recordButtonRef}
              onClick={onRecordButtonClick}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="feather feather-mic"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
            </button>
          </div>
        </div>
        <div className="glowing-arc"></div>
        <div id="error-toast" className="error-toast"></div>
      </div>
      <button
        className={`relative border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] p-4 rounded-full mt-8 ${false ? "hidden" : ""}`}
        onClick={() => props.setIsSessionActive(!props.isSessionActive)}
      >
        <CloseIcon width="0.8vmax" height="0.8vmax" />
      </button>
    </div>
  );
};

export default VoiceAssistant;
