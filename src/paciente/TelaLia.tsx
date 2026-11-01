// Conversa com a Lia (mockups "Estou ouvindo…", "Respondendo…" e chat da página 1 do conceito).
// A paciente escolhe digitar ou falar. Toda ação de escrita aparece como "Entendi: …" com botões
// de confirmação, e cada resposta mostra o status real em texto.

import React, { useEffect, useRef, useState, type RefObject } from 'react';
import {
  CheckCircle2,
  Info,
  Mic,
  Send,
  Stethoscope,
  Volume2,
  ClipboardCheck,
  Forward,
  ExternalLink,
  Users,
} from 'lucide-react';
import type { InicioPaciente, Mensagem, StatusResultado } from '../types';
import { AvisoUrgencia } from './AvisoUrgencia';
import { OrbeLia, type EstadoOrbe } from './OrbeLia';
import { Cabecalho, type Tela } from './telas';
import { TelaVozLia } from './TelaVozLia';

const SELO: Record<StatusResultado, { rotulo: string; Icone: React.ElementType }> = {
  consultado: { rotulo: 'Information looked up', Icone: Info },
  registrado: { rotulo: 'Request logged', Icone: ClipboardCheck },
  encaminhado: { rotulo: 'Forwarded to the team', Icone: Forward },
  confirmado: { rotulo: 'Confirmed', Icone: CheckCircle2 },
};

const SUGESTOES = [
  'When is my next appointment?',
  "I'm very tired today and worried about work.",
  'I want to talk to my nurse.',
  "I can't go to my appointment.",
  'How should I prepare for my next test?',
];

interface TelaLiaProps {
  modoInicial?: 'voz' | 'texto';
  inicio: InicioPaciente;
  ocupado: boolean;
  onVoltar: () => void;
  enviar: (texto: string, origem: 'texto' | 'voz') => Promise<unknown>;
  responder: (token: string, aceitar: boolean) => Promise<unknown>;
  irPara: (t: Tela) => void;
  abrirDocumento: (id: string) => void;
  fala: { falando: boolean; disponivel: boolean; nivel: RefObject<number>; falar: (t: string) => void; parar: () => void };
  lerRespostas: boolean;
  gravacao: {
    iniciando: boolean;
    nivel: RefObject<number>;
    gravando: boolean;
    transcrevendo: boolean;
    erro: string | null;
    alternar: (aoTranscrever: (t: string) => void) => void;
    cancelar: () => void;
  };
}

export const TelaLia: React.FC<TelaLiaProps> = ({
  inicio,
  ocupado,
  onVoltar,
  enviar,
  responder,
  irPara,
  abrirDocumento,
  fala,
  lerRespostas,
  gravacao,
  modoInicial = 'texto',
}) => {
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'voz' | 'texto'>(modoInicial);
  const [rascunhoVoz, setRascunhoVoz] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const vistas = useRef(inicio.conversa.length);
  const respostaPorVoz = useRef(false);
  const nome = inicio.assistenteNome;

  const falaRef = useRef(fala);
  falaRef.current = fala;

  // Lê em voz alta as respostas novas da Lia quando a pergunta foi falada (ou se a paciente pediu).
  useEffect(() => {
    const novas = inicio.conversa.slice(vistas.current);
    vistas.current = inicio.conversa.length;
    const daLia = novas.filter((m) => m.autor === 'lia' || m.autor === 'profissional');
    if (daLia.length === 0) return;
    setConcluido(true);
    if (respostaPorVoz.current || lerRespostas) {
      respostaPorVoz.current = false;
      falaRef.current.falar(daLia.map((m) => m.texto).join(' '));
    }
  }, [inicio.conversa, lerRespostas]);

  useEffect(() => {
    if (!concluido) return;
    const timer = setTimeout(() => setConcluido(false), 1500);
    return () => clearTimeout(timer);
  }, [concluido]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [inicio.conversa.length, inicio.proposta?.token]);

  const estadoOrbe: EstadoOrbe = gravacao.gravando
    ? 'ouvindo'
    : gravacao.iniciando || gravacao.transcrevendo || ocupado
    ? 'processando'
    : fala.falando
    ? 'falando'
    : concluido
    ? 'concluido'
    : 'espera';

  const mandar = async (conteudo: string, origem: 'texto' | 'voz') => {
    const limpo = conteudo.trim();
    if (!limpo) return;
    fala.parar();
    respostaPorVoz.current = origem === 'voz';
    setTexto('');
    await enviar(limpo, origem);
  };

  const falarComLia = () => {
    fala.parar();
    if (modo !== 'voz') { setModo('voz'); return; }
    setRascunhoVoz(null);
    setConcluido(false);
    gravacao.alternar((transcrito) => setRascunhoVoz(transcrito));
  };

  const proposta = inicio.proposta && new Date(inicio.proposta.expiraEm).getTime() > Date.now() ? inicio.proposta : undefined;
  const ultimaResposta = [...inicio.conversa].reverse().find((m) => m.autor === 'lia' || m.autor === 'profissional');
  const paraTexto = () => {
    respostaPorVoz.current = false;
    gravacao.cancelar();
    fala.parar();
    if (rascunhoVoz !== null) setTexto(rascunhoVoz);
    setRascunhoVoz(null);
    setModo('texto');
  };

  if (modo === 'voz') return <TelaVozLia nome={nome} estado={estadoOrbe}
    nivel={gravacao.gravando ? gravacao.nivel : fala.nivel}
    iniciando={gravacao.iniciando} gravando={gravacao.gravando} transcrevendo={gravacao.transcrevendo}
    ocupado={ocupado} falando={fala.falando} vozDisponivel={fala.disponivel} erro={gravacao.erro}
    rascunho={rascunhoVoz} resposta={inicio.conversa.some((m) => m.autor === 'paciente') ? ultimaResposta : undefined} proposta={proposta}
    avisos={inicio.conversa.filter((m) => m.tipoSistema === 'urgencia' || m.tipoSistema === 'videochamada')}
    atendente={inicio.modoConversa === 'profissional' ? inicio.atendente : undefined}
    avisoUrgencia={inicio.avisoUrgencia} quemVe={inicio.quemVe}
    onRascunho={setRascunhoVoz} onGravar={falarComLia}
    onCancelar={() => { gravacao.cancelar(); setRascunhoVoz(null); }}
    onEnviar={() => {
      if (!rascunhoVoz?.trim()) return;
      const transcrito = rascunhoVoz;
      setRascunhoVoz(null);
      void mandar(transcrito, 'voz');
    }}
    onOuvir={() => { if (ultimaResposta) fala.falar(ultimaResposta.texto); }}
    onAcao={(acao) => acao.tipo === 'abrir_documento' ? abrirDocumento(acao.alvo) : irPara(acao.alvo as Tela)}
    onPararFala={fala.parar}
    onConfirmar={(aceitar) => {
      if (!proposta) return;
      fala.parar();
      respostaPorVoz.current = true;
      void responder(proposta.token, aceitar);
    }}
    onTexto={paraTexto} onVoltar={onVoltar} />;

  const renderMensagem = (m: Mensagem) => {
    if (m.tipoSistema === 'urgencia') {
      return (
        <div key={m.id}>
          <AvisoUrgencia aviso={inicio.avisoUrgencia} destaque />
        </div>
      );
    }
    if (m.sistema) {
      return (
        <div key={m.id} className="flex justify-center">
          <span className="text-sm text-tinta-suave bg-gelo rounded-full px-3 py-1 text-center">
            {m.texto}
            {m.link && (
              <a href={m.link} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-verde underline">
                Join call <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
            )}
          </span>
        </div>
      );
    }
    if (m.autor === 'paciente') {
      return (
        <div key={m.id} className="flex flex-col items-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-azul text-white px-4 py-2.5">{m.texto}</div>
          <span className="text-xs text-tinta-suave mt-1">
            {m.origem === 'voz' ? 'Spoken · ' : ''}
            {m.horario}
          </span>
        </div>
      );
    }
    const profissional = m.autor === 'profissional';
    const selo = m.status ? SELO[m.status] : undefined;
    return (
      <div key={m.id} className="flex gap-2 items-start">
        {profissional ? (
          <span className="w-8 h-8 rounded-full bg-verde text-white flex items-center justify-center shrink-0">
            <Stethoscope className="w-4 h-4" aria-hidden />
          </span>
        ) : (
          <span className="shrink-0 mt-1">
            <OrbeLia estado="espera" tamanho={28} />
          </span>
        )}
        <div className="max-w-[85%] space-y-1.5">
          <span className="text-xs font-semibold text-tinta-suave">{profissional ? m.nomeAutor : nome}</span>
          <div className={`rounded-2xl rounded-tl-md px-4 py-2.5 ${profissional ? 'bg-verde text-white' : 'bg-white border border-linha text-azul'}`}>
            {m.texto}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selo && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-azul bg-gelo border border-linha rounded-full px-2 py-0.5">
                <selo.Icone className="w-3.5 h-3.5 text-verde" aria-hidden />
                {selo.rotulo}
              </span>
            )}
            {fala.disponivel && (
              <button
                type="button"
                onClick={() => fala.falar(m.texto)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-azul min-h-8 px-2 rounded-full border border-linha bg-white cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden />
                Listen
              </button>
            )}
            <span className="text-xs text-tinta-suave">{m.horario}</span>
          </div>
          {m.acoes && m.acoes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {m.acoes.map((a) => (
                <button
                  key={a.rotulo}
                  type="button"
                  onClick={() => (a.tipo === 'abrir_documento' ? abrirDocumento(a.alvo) : irPara(a.alvo as Tela))}
                  className="text-left min-h-11 px-3 rounded-xl border border-linha bg-white text-azul font-semibold cursor-pointer"
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-[100dvh] pb-4">
      <Cabecalho titulo={`${nome} · OncoFlow Assistant`} onVoltar={onVoltar} direita={<OrbeLia estado={estadoOrbe} tamanho={36} />} />
      <p aria-live="polite" className="sr-only">
        {estadoOrbe === 'processando' ? 'Looking up your information' : ''}
      </p>

      <div className="space-y-2 mb-3">
        {inicio.modoConversa === 'profissional' && inicio.atendente && (
          <div className="rounded-xl bg-verde text-white px-4 py-2.5 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 shrink-0" aria-hidden />
            You are talking with {inicio.atendente}.
          </div>
        )}
        <AvisoUrgencia aviso={inicio.avisoUrgencia} />
        <details className="rounded-xl bg-white border border-linha">
          <summary className="flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-azul cursor-pointer">
            <Users className="w-4 h-4 text-verde" aria-hidden />
            Who sees this conversation
          </summary>
          <p className="px-3.5 pb-3 text-sm text-azul">{inicio.quemVe}</p>
        </details>
      </div>

      <div className="flex-1 space-y-4 py-2" aria-live="polite">
        {inicio.conversa.map(renderMensagem)}
        {ocupado && (
          <div className="flex items-center gap-2 text-tinta-suave">
            <OrbeLia estado="processando" tamanho={28} />
            Replying…
          </div>
        )}
        {proposta && (
          <div className="rounded-2xl border-2 border-verde bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-verde uppercase tracking-wide">Before we continue</p>
            <p className="text-azul">
              <strong>Here's what I understood:</strong> {proposta.resumo}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => responder(proposta.token, true)}
                className="min-h-12 rounded-xl bg-azul text-white font-bold cursor-pointer disabled:opacity-50"
              >
                {proposta.rotuloConfirmar}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => responder(proposta.token, false)}
                className="min-h-12 rounded-xl border-2 border-azul text-azul font-bold cursor-pointer disabled:opacity-50"
              >
                {proposta.rotuloRecusar}
              </button>
            </div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {gravacao.erro && (
        <p role="status" className="rounded-xl bg-atencao-fundo border border-atencao-borda text-atencao px-3 py-2 text-sm mb-2">
          {gravacao.erro}
        </p>
      )}

      {!proposta && !ocupado && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" aria-label="Suggestions">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => mandar(s, 'texto')}
              className="shrink-0 min-h-10 px-3 rounded-full border border-linha bg-white text-sm text-azul cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mandar(texto, 'texto');
        }}
        className="sticky bottom-0 bg-fundo pt-2 pb-[env(safe-area-inset-bottom)] flex items-center gap-2"
      >
        <button
          type="button"
          onClick={falarComLia}
          aria-label="Talk to Lia"
          className="w-14 h-14 rounded-full bg-verde text-white flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Mic className="w-6 h-6" aria-hidden />
        </button>
        <label htmlFor="texto-lia" className="sr-only">
          Message to {nome}
        </label>
        <input
          id="texto-lia"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Type or speak here…"
          className="flex-1 min-w-0 min-h-14 rounded-2xl border border-linha bg-white px-4 text-azul"
        />
        <button
          type="submit"
          disabled={!texto.trim() || ocupado}
          aria-label="Send"
          className="w-14 h-14 rounded-2xl bg-azul text-white flex items-center justify-center shrink-0 disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-6 h-6" aria-hidden />
        </button>
      </form>
    </div>
  );
};
