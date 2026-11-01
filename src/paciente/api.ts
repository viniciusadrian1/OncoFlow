// Cliente da API do OncoFlow Paciente. Na demo a sessão é fixa (Maria); em produção o paciente
// vem do token de autenticação, nunca da URL.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InicioPaciente, OpcaoCheckin } from '../types';

const SESSAO_DEMO = 'demo-maria';

async function chamar<T>(caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(caminho, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SESSAO_DEMO}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.mensagem || "We couldn't finish that right now. Please try again in a moment.");
  return dados as T;
}

export function usePaciente() {
  const [inicio, setInicio] = useState<InicioPaciente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const versao = useRef(0);

  const aplicar = useCallback((novo: InicioPaciente) => {
    versao.current = novo.versao;
    setInicio(novo);
  }, []);

  const atualizar = useCallback(async () => {
    try {
      const novo = await chamar<InicioPaciente>('/api/paciente/inicio');
      setErro(null);
      if (novo.versao !== versao.current) aplicar(novo);
    } catch {
      setErro('No connection right now. Trying again…');
    }
  }, [aplicar]);

  useEffect(() => {
    atualizar();
    const timer = setInterval(atualizar, 2000);
    return () => clearInterval(timer);
  }, [atualizar]);

  const comOcupado = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setOcupado(true);
      try {
        const resultado = await fn();
        setErro(null);
        return resultado;
      } catch (e) {
        setErro((e as Error).message);
        return null;
      } finally {
        setOcupado(false);
      }
    },
    []
  );

  const enviar = useCallback(
    (texto: string, origem: 'texto' | 'voz') =>
      comOcupado(async () => aplicar(await chamar<InicioPaciente>('/api/paciente/conversa', { texto, origem }))),
    [aplicar, comOcupado]
  );

  const responder = useCallback(
    (token: string, aceitar: boolean) =>
      comOcupado(async () => aplicar(await chamar<InicioPaciente>('/api/paciente/conversa/confirmar', { token, aceitar }))),
    [aplicar, comOcupado]
  );

  const checkin = useCallback(
    (opcoes: OpcaoCheckin[], texto: string, origem: 'visual' | 'voz') =>
      comOcupado(async () => {
        const r = await chamar<{ urgencia: boolean; inicio: InicioPaciente }>('/api/paciente/checkin', {
          opcoes,
          texto,
          origem,
        });
        aplicar(r.inicio);
        return r.urgencia;
      }),
    [aplicar, comOcupado]
  );

  return { inicio, erro, ocupado, enviar, responder, checkin };
}

export async function transcrever(audioBase64: string, mimeType: string): Promise<string | null> {
  try {
    const r = await chamar<{ transcricao: string; sucesso: boolean }>('/api/transcrever-audio', { audioBase64, mimeType });
    return r.sucesso && r.transcricao ? r.transcricao : null;
  } catch {
    return null;
  }
}
