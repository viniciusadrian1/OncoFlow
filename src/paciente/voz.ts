// Push-to-talk and local visual activity. The audio meter never sends data anywhere.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioGravado { base64: string; mimeType: string; }

function mimeSuportado(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((mime) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime));
}

function paraBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '');
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export function useGravador() {
  const [gravando, setGravando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const nivel = useRef(0);
  const contexto = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const geracao = useRef(0);
  const pendente = useRef(false);
  const montado = useRef(true);
  const dados = useRef<{ rec: MediaRecorder; partes: Blob[]; rodada: number } | null>(null);

  const liberarMicrofone = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    nivel.current = 0;
    fluxo.current?.getTracks().forEach((track) => track.stop());
    fluxo.current = null;
    if (contexto.current) void contexto.current.close().catch(() => {});
    contexto.current = null;
    if (montado.current) setGravando(false);
  }, []);

  const cancelar = useCallback(() => {
    geracao.current += 1;
    pendente.current = false;
    const rec = gravador.current;
    if (rec) {
      rec.ondataavailable = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    gravador.current = null;
    dados.current = null;
    liberarMicrofone();
    if (montado.current) setIniciando(false);
  }, [liberarMicrofone]);

  const iniciar = useCallback(async (): Promise<boolean> => {
    if (pendente.current || gravador.current || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;
    const rodada = ++geracao.current;
    pendente.current = true;
    setIniciando(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (rodada !== geracao.current || !montado.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      fluxo.current = stream;
      const mime = mimeSuportado();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const partes: Blob[] = [];
      rec.ondataavailable = (event) => { if (event.data.size) partes.push(event.data); };
      // Keep chunks with their recorder: a late event cannot enter a later recording.
      dados.current = { rec, partes, rodada };
      gravador.current = rec;
      rec.start();
      setGravando(true);

      // Recording still works if the device does not expose Web Audio.
      try {
        const audio = new AudioContext();
        contexto.current = audio;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(stream).connect(analyser);
        const amostras = new Float32Array(analyser.fftSize);
        const medir = () => {
          if (rodada !== geracao.current || rec.state === 'inactive') return;
          analyser.getFloatTimeDomainData(amostras);
          let energia = 0;
          for (const amostra of amostras) energia += amostra * amostra;
          const rms = Math.sqrt(energia / amostras.length);
          nivel.current = Math.min(1, Math.max(0, (rms - .006) * 5));
          frame.current = requestAnimationFrame(medir);
        };
        void audio.resume().catch(() => {});
        medir();
      } catch {
        nivel.current = 0;
      }
      return true;
    } catch {
      if (rodada === geracao.current) {
        gravador.current = null;
        dados.current = null;
        liberarMicrofone();
      }
      return false;
    } finally {
      if (rodada === geracao.current) {
        pendente.current = false;
        if (montado.current) setIniciando(false);
      }
    }
  }, [liberarMicrofone]);

  const parar = useCallback(async (): Promise<AudioGravado | null> => {
    const captura = dados.current;
    if (!captura || captura.rec !== gravador.current || captura.rec.state === 'inactive') return null;
    const { rec, partes, rodada } = captura;
    const mimeType = rec.mimeType || 'audio/webm';
    const terminou = new Promise<void>((resolve) => rec.addEventListener('stop', () => resolve(), { once: true }));
    rec.stop();
    gravador.current = null;
    liberarMicrofone();
    await terminou;
    if (rodada !== geracao.current) return null;
    rec.ondataavailable = null;
    const blob = new Blob(partes, { type: mimeType });
    dados.current = null;
    if (!blob.size) return null;
    const base64 = await paraBase64(blob);
    return rodada === geracao.current ? { base64, mimeType } : null;
  }, [liberarMicrofone]);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; cancelar(); };
  }, [cancelar]);

  return { gravando, iniciando, nivel, iniciar, parar, cancelar };
}

function escolherVoz(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  const preferidas = /aria|jenny|samantha|ava|allison|zira|female|google us english/i;
  return vozes.find((v) => v.lang === 'en-US' && preferidas.test(v.name)) ?? vozes.find((v) => v.lang === 'en-US') ?? vozes[0];
}

export function useFala() {
  const disponivel = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [falando, setFalando] = useState(false);
  const nivel = useRef(0);
  const pulso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geracao = useRef(0);

  const limparPulso = useCallback(() => {
    if (pulso.current) clearTimeout(pulso.current);
    pulso.current = null;
    nivel.current = 0;
  }, []);

  const parar = useCallback(() => {
    geracao.current += 1;
    if (disponivel) window.speechSynthesis.cancel();
    limparPulso();
    setFalando(false);
  }, [disponivel, limparPulso]);

  const falar = useCallback((texto: string, velocidade = 1) => {
    if (!disponivel || !texto) return;
    parar();
    const rodada = geracao.current;
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'en-US';
    fala.rate = velocidade;
    const voz = escolherVoz();
    if (voz) fala.voice = voz;
    fala.onstart = () => {
      if (rodada !== geracao.current) return;
      setFalando(true);
      nivel.current = .22;
    };
    // SpeechSynthesis exposes word events, not output PCM. This is a playback pulse, not a measured TTS waveform.
    fala.onboundary = (event) => {
      if (rodada !== geracao.current) return;
      if (pulso.current) clearTimeout(pulso.current);
      nivel.current = .45 + Math.min(event.charLength || 4, 10) * .045;
      pulso.current = setTimeout(() => { nivel.current = .16; }, 180);
    };
    const terminar = () => {
      if (rodada !== geracao.current) return;
      limparPulso();
      setFalando(false);
    };
    fala.onend = terminar;
    fala.onerror = terminar;
    window.speechSynthesis.speak(fala);
  }, [disponivel, limparPulso, parar]);

  useEffect(() => parar, [parar]);
  return { disponivel, falando, nivel, falar, parar };
}
