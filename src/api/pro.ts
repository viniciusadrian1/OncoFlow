// Cliente da API do OncoFlow Pro. O estado vem do servidor (compartilhado com o app do paciente)
// e é atualizado a cada 2 segundos; as ações chamam a API e recarregam o estado em seguida.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Desfecho, EstadoPro, UsuarioEquipe } from '../types';

export async function chamarApi<T>(caminho: string, usuarioId?: string, corpo?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
  const resposta = await fetch(caminho, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(usuarioId ? { 'x-demo-usuario': usuarioId } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: options?.signal,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.mensagem || dados.error?.message || "We couldn't finish that right now. Please try again in a moment.");
  }
  return dados as T;
}

export interface AcoesPro {
  assumir: (pacienteId: string) => Promise<void>;
  devolver: (pacienteId: string) => Promise<void>;
  enviar: (pacienteId: string, texto: string) => Promise<void>;
  atualizarPlano: (pacienteId: string, texto: string, atualizadoEm: string) => Promise<void>;
  videochamada: (pacienteId: string) => Promise<string | undefined>;
  assumirPendencia: (pendenciaId: string) => Promise<void>;
  concluirPendencia: (pendenciaId: string, desfecho: Desfecho) => Promise<void>;
  resetarDemo: () => Promise<void>;
}

export function useEstadoPro(usuario: UsuarioEquipe | null) {
  const [estado, setEstado] = useState<EstadoPro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef(0);
  const sessao = useRef(0);
  const carregando = useRef(false);
  const usuarioAtualId = useRef(usuario?.id);
  usuarioAtualId.current = usuario?.id;

  const atualizar = useCallback(async () => {
    if (!usuario || usuario.id !== usuarioAtualId.current) return;
    if (carregando.current) return;
    const geracao = sessao.current;
    carregando.current = true;
    try {
      const novo = await chamarApi<EstadoPro>('/api/pro/estado', usuario.id);
      if (geracao !== sessao.current) return;
      setErro(null);
      if (novo.versao !== versao.current) {
        versao.current = novo.versao;
        setEstado(novo);
      }
    } catch {
      if (geracao === sessao.current) setErro("We couldn't load right now. Trying again…");
    } finally {
      if (geracao === sessao.current) carregando.current = false;
    }
  }, [usuario]);

  useEffect(() => {
    versao.current = 0;
    carregando.current = false;
    setEstado(null);
    setErro(null);
    atualizar();
    const timer = setInterval(atualizar, 2000);
    return () => { sessao.current += 1; clearInterval(timer); };
  }, [atualizar]);

  const acao = useCallback(
    async (caminho: string, corpo: unknown = {}, propagarErro = false) => {
      if (!usuario || usuario.id !== usuarioAtualId.current) return;
      const geracao = sessao.current;
      try {
        await chamarApi(caminho, usuario.id, corpo);
        if (geracao !== sessao.current) return;
        setErro(null);
      } catch (e) {
        if (geracao !== sessao.current) return;
        setErro((e as Error).message);
        if (propagarErro) throw e;
      }
      await atualizar();
    },
    [usuario, atualizar]
  );

  const acoes: AcoesPro = {
    assumir: (id) => acao(`/api/pro/pacientes/${id}/assumir`),
    devolver: (id) => acao(`/api/pro/pacientes/${id}/devolver`),
    enviar: (id, texto) => acao(`/api/pro/pacientes/${id}/mensagens`, { texto }, true),
    atualizarPlano: (id, texto, atualizadoEm) => acao(`/api/pro/pacientes/${id}/plano`, { texto, atualizadoEm }),
    videochamada: async (id) => {
      if (!usuario || usuario.id !== usuarioAtualId.current) return undefined;
      const geracao = sessao.current;
      try {
        const { link } = await chamarApi<{ link: string }>(`/api/pro/pacientes/${id}/videochamada`, usuario.id, {});
        if (geracao !== sessao.current) return undefined;
        await atualizar();
        return link;
      } catch (e) {
        if (geracao === sessao.current) setErro((e as Error).message);
        return undefined;
      }
    },
    assumirPendencia: (id) => acao(`/api/pro/pendencias/${id}/assumir`, {}, true),
    concluirPendencia: (id, desfecho) => acao(`/api/pro/pendencias/${id}/concluir`, { desfecho }, true),
    resetarDemo: () => acao('/api/demo/reset'),
  };

  return { estado, erro, acoes };
}
