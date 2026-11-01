import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { criarApi } from './server/api';
import { pacienteDaSessao, verificarInatividade, ErroDominio } from './server/estado';

dotenv.config();

async function startServer() {
  const { app, persist } = criarApi();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // Inicialização centralizada do SDK @google/genai no servidor (usado só para transcrever áudio)
  let aiClient: GoogleGenAI | null = null;
  const getAiClient = (): GoogleGenAI => {
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || '',
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
    return aiClient;
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'OncoFlow',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // Transcrição do áudio do paciente (fala para a Lia ou check-in por voz). Vem do IRIS.
  // O áudio não é guardado: só a transcrição volta para o app, que mostra "Entendi: ..." antes
  // de qualquer ação.
  app.post('/api/transcrever-audio', async (req, res) => {
    try {
      pacienteDaSessao(req.header('authorization')?.replace(/^Bearer\s+/i, ''));
    } catch (err) {
      const erro = err as ErroDominio;
      return res.status(erro.status ?? 401).json({ error: erro.message, sucesso: false });
    }

    const { audioBase64, mimeType } = req.body ?? {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required', sucesso: false });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Transcription unavailable: Gemini key not configured', sucesso: false });
    }

    const ai = getAiClient();
    const cleanMimeType = (mimeType || 'audio/webm').split(';')[0];
    const contents = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: cleanMimeType, data: audioBase64 } },
          {
            text: 'Transcribe the following audio in US English. Return only the transcribed text, with no extra comments, no formatting and no quotes.',
          },
        ],
      },
    ];

    try {
      let response;
      try {
        // Modelo especializado em transcrição de áudio estático
        response = await ai.models.generateContent({ model: 'gemini-3.5-transcribe', contents });
      } catch {
        // Fallback para modelo multimodal padrão se o modelo de transcrição não estiver disponível
        response = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents });
      }
      const transcricao = (response.text || '').trim().replace(/^["']|["']$/g, '');
      return res.json({ transcricao, sucesso: true });
    } catch (apiErr: any) {
      console.error('Gemini audio transcription failed:', apiErr?.message);
      return res.status(502).json({ error: 'Failed to transcribe audio', sucesso: false });
    }
  });

  // Herdado do IRIS: depois de N minutos sem atividade do profissional, a Lia volta a atender.
  setInterval(() => { verificarInatividade(); persist(); }, 30_000).unref();

  // The built mobile experience can be served alongside Pro on the private demo network.
  // This path is server configuration, never supplied by a patient request.
  const patientWebPath = path.resolve(process.env.ONCOFLOW_PATIENT_WEB_DIR || '../oncoflow-patient/dist');
  app.use('/app', express.static(patientWebPath));
  app.get(['/app', '/app/*'], (_req, res) => res.sendFile(path.join(patientWebPath, 'index.html')));

  // Vite middleware for development vs Static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OncoFlow listening on port ${PORT}`);
  });
}

startServer();
