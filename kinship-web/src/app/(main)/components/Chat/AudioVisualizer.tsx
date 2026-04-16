import { useEffect, useRef, useCallback } from "react";

export default function useAudioVisualizer(canvasId: string) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  // Resize Canvas
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = ctxRef.current;
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    // canvas.height = rect.height * window.devicePixelRatio;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    canvas.style.width = rect.width + "px";
    // canvas.style.height = rect.height + "px";
  }, []);

  // Setup Audio Stream
  const setup = useCallback((stream: MediaStream) => {
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);
    isPlayingRef.current = true;
  }, []);

  // Stop Audio
  const stop = useCallback(() => {
    if (sourceRef.current) sourceRef.current.disconnect();

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    isPlayingRef.current = false;
  }, []);

  // Draw main wave
  const drawWave = useCallback(
    (
      frequencies: Uint8Array,
      offset = 0,
      opacity = 1,
      color = "#3b82f6"
    ) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const centerY = rect.height / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;

      ctx.beginPath();

      for (let x = 0; x < rect.width; x++) {
        const freq =
          frequencies[Math.floor((x / rect.width) * frequencies.length)] || 0;

        const amp = (freq / 255) * (centerY * 0.8);
        const waveOffset = Math.sin((x / rect.width) * Math.PI * 4 + offset) * 15;

        const y =
          centerY +
          Math.sin((x / rect.width) * Math.PI * 3 + offset) * amp +
          waveOffset;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    },
    []
  );

  // Draw inverted wave
  const drawInvertedWave = useCallback(
    (frequencies: Uint8Array, offset: number, opacity: number, color: string) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const centerY = rect.height / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;

      ctx.beginPath();

      for (let x = 0; x < rect.width; x++) {
        const freq =
          frequencies[Math.floor((x / rect.width) * frequencies.length)] || 0;

        const amp = (freq / 255) * (centerY * 0.6);
        const waveOffset = Math.sin((x / rect.width) * Math.PI * 5 + offset) * 10;

        const y =
          centerY -
          Math.sin((x / rect.width) * Math.PI * 2.5 + offset) * amp -
          waveOffset;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    },
    []
  );

  // Idle waves when no audio is playing
  const drawIdleAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const time = Date.now() * 0.001;
    const rect = canvas.getBoundingClientRect();
    const centerY = rect.height / 2;

    const waves = [
      { color: "#3b82f6", opacity: 0.4, frequency: 2, amplitude: 15, speed: 1 },
      { color: "#60a5fa", opacity: 0.3, frequency: 1.5, amplitude: 10, speed: 0.8 },
      { color: "#1e40af", opacity: 0.2, frequency: 3, amplitude: 8, speed: 1.2 }
    ];

    waves.forEach((wave) => {
      ctx.save();
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = wave.opacity;
      ctx.shadowBlur = 10;
      ctx.shadowColor = wave.color;

      ctx.beginPath();
      for (let x = 0; x < rect.width; x++) {
        const y =
          centerY +
          Math.sin((x / rect.width) * Math.PI * wave.frequency + time * wave.speed) *
            wave.amplitude;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    });
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;

    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext("2d");

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const animate = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#181747";
      ctx.fillRect(0, 0, rect.width, rect.height);

      const analyser = analyserRef.current;
      const dataArray: any = dataArrayRef.current;

      if (analyser && dataArray && isPlayingRef.current) {
        analyser.getByteFrequencyData(dataArray);

        const time = Date.now() * 0.002;

        // Main waves
        drawWave(dataArray, time * 2, 0.9, "#ffffff");
        drawWave(dataArray, time * 1.5 + 1, 0.7, "#60a5fa");
        drawWave(dataArray, time * 1.8 + 2, 0.5, "#3b82f6");
        drawWave(dataArray, time * 1.2 + 3, 0.3, "#1e40af");

        // Inverted symmetry
        drawInvertedWave(dataArray, time * 2.2, 0.6, "#60a5fa");
        drawInvertedWave(dataArray, time * 1.7 + 1, 0.4, "#3b82f6");
      } else {
        drawIdleAnimation();
      }

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      stop();
    };
  }, [
    canvasId,
    resizeCanvas,
    drawWave,
    drawInvertedWave,
    drawIdleAnimation,
    stop
  ]);

  // RETURN EVERYTHING REQUESTED
  return {
    canvasRef,
    ctxRef,
    audioContextRef,
    analyserRef,
    dataArrayRef,
    sourceRef,
    isPlayingRef,
    setup,
    stop
  };
}
