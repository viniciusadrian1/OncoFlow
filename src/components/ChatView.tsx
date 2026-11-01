// Conversa do paciente vista pela equipe (base: ChatView do IRIS). A Lia atende por padrão; um
// profissional pode assumir e depois devolver. Marcadores internos (hipóteses do sistema) só
// aparecem aqui, nunca no app do paciente.

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  User,
  UserCheck,
  RotateCcw,
  Clock,
  Video,
  ExternalLink,
  AlertTriangle,
  HelpCircle,
  Stethoscope,
  FileText,
  Mic,
  Smartphone,
  Info,
} from 'lucide-react';
import type { Mensagem, PacientePro, StatusResultado, UsuarioEquipe } from '../types';
import type { AcoesPro } from '../api/pro';
import { BadgeSituacao } from './Pendencias';
import { OrbeMini } from './OrbeMini';

const SELO_STATUS: Record<StatusResultado, string> = {
  consultado: 'Information looked up',
  registrado: 'Request logged',
  encaminhado: 'Forwarded to the team',
  confirmado: 'Confirmed',
};

interface ChatViewProps {
  paciente: PacientePro;
  usuarioAtual: UsuarioEquipe;
  acoes: AcoesPro;
  minutosRetornoLia: number;
  onFechar?: () => void;
  onVerPlano?: () => void;
}

const MarcadorSistema: React.FC<{ msg: Mensagem }> = ({ msg }) => {
  if (msg.tipoSistema === 'hipotese') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] font-semibold text-urgente bg-urgente-fundo border border-dashed border-urgente-borda px-3.5 py-1 rounded-full flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" aria-hidden />
          {msg.texto}
          <span className="font-normal text-tinta-suave">· team only</span>
        </span>
      </div>
    );
  }
  if (msg.tipoSistema === 'videochamada') {
    return (
      <div className="flex justify-center my-3">
        <div className="text-xs font-medium text-azul bg-gelo border border-linha px-4 py-2 rounded-xl flex flex-col sm:flex-row items-center gap-2.5">
          <span className="flex items-center gap-1.5">
            <Video className="w-4 h-4 text-verde" aria-hidden />
            {msg.texto}
          </span>
          {msg.link && (
            <a
              href={msg.link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 text-xs font-semibold text-white bg-verde hover:bg-verde-escuro rounded-lg inline-flex items-center gap-1"
            >
              Join call
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-center my-3">
      <span
        className={`text-[11px] font-medium px-3 py-1 rounded-full flex items-center gap-1.5 border ${
          msg.visivelPaciente ? 'text-tinta-suave bg-gelo border-linha' : 'text-tinta-suave bg-white border-dashed border-linha'
        }`}
      >
        <Info className="w-3 h-3 text-verde" aria-hidden />
        {msg.texto}
        {!msg.visivelPaciente && <span>· team only</span>}
      </span>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({
  paciente,
  usuarioAtual,
  acoes,
  minutosRetornoLia,
  onFechar,
  onVerPlano,
}) => {
  const [novoTexto, setNovoTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const bloqueioEnvio = useRef(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const comLia = paciente.modoConversa === 'lia';

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [paciente.mensagens.length]);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = novoTexto.trim();
    if (!texto || bloqueioEnvio.current) return;
    bloqueioEnvio.current = true;
    setEnviando(true); setErroEnvio('');
    try {
      await acoes.enviar(paciente.id, texto);
      setNovoTexto('');
    } catch (error) { setErroEnvio((error as Error).message); }
    finally { bloqueioEnvio.current = false; setEnviando(false); }
  };

  const handleVideochamada = async () => {
    const link = await acoes.videochamada(paciente.id);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div id={`chat-paciente-${paciente.id}`} className="conversation-panel flex flex-col h-full bg-fundo border border-linha overflow-hidden">
      <div className="bg-white border-b border-linha px-4 py-3 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gelo text-azul font-bold text-sm flex items-center justify-center border border-linha shrink-0">
              {paciente.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-azul tracking-tight">{paciente.nome}</h2>
                <span className="text-xs text-tinta-suave">({paciente.idade} y/o)</span>
                <BadgeSituacao situacao={paciente.situacao} />
              </div>
              <div className="flex items-center gap-2 text-xs text-tinta-suave mt-0.5">
                <span className="font-semibold text-azul bg-gelo px-1.5 rounded text-[11px] border border-linha">{paciente.cicloAtual}</span>
                <span aria-hidden>•</span>
                <span className="truncate max-w-[200px] sm:max-w-xs">{paciente.esquemaResumido}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {onVerPlano && (
              <button
                type="button"
                onClick={onVerPlano}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-azul bg-gelo hover:bg-linha border border-linha rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-verde" aria-hidden />
                See plan
              </button>
            )}
            <button
              type="button"
              id={`btn-iniciar-videochamada-${paciente.id}`}
              onClick={handleVideochamada}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-azul bg-gelo hover:bg-linha border border-linha rounded-lg cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-verde" aria-hidden />
              Video call
            </button>
            {comLia ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-gelo text-azul border border-linha">
                  <OrbeMini className="w-3.5 h-3.5" />
                  Lia is handling
                </span>
                <button
                  type="button"
                  id={`btn-assumir-${paciente.id}`}
                  onClick={() => acoes.assumir(paciente.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-verde hover:bg-verde-escuro rounded-lg cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" aria-hidden />
                  Take over conversation
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-gelo text-azul border border-linha">
                  <User className="w-3.5 h-3.5" aria-hidden />
                  <span className="truncate max-w-[140px]">{paciente.profissionalResponsavel}</span>
                </span>
                <button
                  type="button"
                  id={`btn-devolver-lia-${paciente.id}`}
                  onClick={() => acoes.devolver(paciente.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-azul bg-white hover:bg-gelo border border-linha rounded-lg cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-verde" aria-hidden />
                  Hand back to Lia
                </button>
              </>
            )}
            {onFechar && (
              <button
                type="button"
                onClick={onFechar}
                aria-label="Close conversation"
                className="text-xs px-2 py-1 text-tinta-suave hover:text-azul hover:bg-gelo rounded cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5 max-h-[520px] min-h-[300px]" aria-live="polite">
        <div className="text-center my-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-linha text-tinta-suave text-[11px] rounded-full">
            The patient knows the care team sees this conversation · Not an emergency channel
          </span>
        </div>

        {paciente.mensagens.map((msg) => {
          if (msg.sistema && msg.tipoSistema !== 'urgencia') return <MarcadorSistema key={msg.id} msg={msg} />;

          const isLia = msg.autor === 'lia';
          const isProfissional = msg.autor === 'profissional';
          const isPaciente = msg.autor === 'paciente';
          const isAviso = msg.tipoSistema === 'urgencia';

          return (
            <div key={msg.id} className={`flex flex-col ${isPaciente ? 'items-start' : 'items-end'}`}>
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-semibold text-tinta-suave">
                {isLia && (
                  <span className="flex items-center gap-1 text-azul">
                    <OrbeMini className="w-3 h-3" />
                    Lia (assistant)
                  </span>
                )}
                {isProfissional && (
                  <span className="flex items-center gap-1 text-verde">
                    <Stethoscope className="w-3 h-3" aria-hidden />
                    {msg.nomeAutor}
                  </span>
                )}
                {isPaciente && (
                  <span className="flex items-center gap-1 text-azul">
                    <User className="w-3 h-3 text-tinta-suave" aria-hidden />
                    {msg.nomeAutor} (patient)
                    {msg.origem === 'voz' && (
                      <span className="inline-flex items-center gap-0.5 font-normal text-tinta-suave">
                        <Mic className="w-3 h-3" aria-hidden /> by voice, transcribed
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  isAviso
                    ? 'bg-urgente-fundo text-azul border border-urgente-borda rounded-tr-sm'
                    : isLia
                    ? 'bg-gelo text-azul border border-linha rounded-tr-sm'
                    : isProfissional
                    ? 'bg-verde text-white rounded-tr-sm'
                    : 'bg-white text-azul border border-linha rounded-tl-sm'
                }`}
              >
                {isAviso && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-urgente mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                    Hospital urgency notice shown to the patient
                  </span>
                )}
                <p className="whitespace-pre-wrap">{msg.texto}</p>
                <div className={`text-[10px] mt-1 flex items-center justify-end gap-1.5 ${isProfissional ? 'text-white/85' : 'text-tinta-suave'}`}>
                  {msg.status && (
                    <span className="px-1.5 py-0.5 rounded bg-white border border-linha text-azul font-semibold">
                      {SELO_STATUS[msg.status]}
                    </span>
                  )}
                  <Clock className="w-2.5 h-2.5" aria-hidden />
                  <span>{msg.horario}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      <div className="px-4 py-2 bg-gelo/60 border-t border-linha flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[11px] text-tinta-suave flex items-center gap-1.5">
          {comLia ? (
            <>
              <OrbeMini className="w-3.5 h-3.5" />
              <span className="font-medium text-azul">Lia handles: informs, organizes and forwards. She does not advise on symptoms or medications.</span>
            </>
          ) : (
            <>
              <UserCheck className="w-3.5 h-3.5 text-verde" aria-hidden />
              <span className="font-medium text-azul">
                Handled by {paciente.profissionalResponsavel}. After {minutosRetornoLia} min without activity, Lia takes over again.
              </span>
            </>
          )}
        </div>
        <a href="/app/" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[11px] font-semibold text-verde hover:text-verde-escuro underline">
          <Smartphone className="w-3 h-3" aria-hidden />
          Open patient app (demo)
        </a>
      </div>

      {erroEnvio && <p role="alert" className="px-4 py-3 bg-urgente-fundo text-urgente text-sm">{erroEnvio}</p>}
      <form onSubmit={handleEnviar} className="p-3 bg-white border-t border-linha flex items-center gap-2">
        <label htmlFor={`input-msg-${paciente.id}`} className="sr-only">
          Message to {paciente.nome}
        </label>
        <input
          id={`input-msg-${paciente.id}`}
          type="text"
          maxLength={4000}
          value={novoTexto}
          disabled={enviando}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder={comLia ? 'Type a message (sending takes over the conversation)…' : 'Type your message to the patient…'}
          className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm border border-linha rounded-lg focus:outline-none focus:ring-2 focus:ring-verde text-azul bg-fundo"
        />
        <button
          type="submit"
          id={`btn-enviar-msg-${paciente.id}`}
          disabled={!novoTexto.trim() || enviando}
          aria-label="Send message"
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-verde hover:bg-verde-escuro disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" aria-hidden />
        </button>
      </form>
    </div>
  );
};
