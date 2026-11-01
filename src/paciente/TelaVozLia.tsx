import React, { useEffect, useState, type RefObject } from 'react';
import { ArrowLeft, Check, ExternalLink, MessageSquare, Mic, RotateCcw, Send, Square, Volume2, X } from 'lucide-react';
import type { AcaoMensagem, Mensagem, PropostaLia } from '../types';
import { LogoOncoFlow } from '../components/LogoOncoFlow';
import { OrbeLia, type EstadoOrbe } from './OrbeLia';
import { OndaVoz } from './OndaVoz';
import { AvisoUrgencia } from './AvisoUrgencia';
import type { AvisoUrgencia as Aviso } from '../types';

interface Props {
  nome: string;
  estado: EstadoOrbe;
  nivel?: RefObject<number>;
  iniciando: boolean;
  gravando: boolean;
  transcrevendo: boolean;
  ocupado: boolean;
  falando: boolean;
  vozDisponivel: boolean;
  erro: string | null;
  rascunho: string | null;
  resposta?: Mensagem;
  avisos: Mensagem[];
  proposta?: PropostaLia;
  atendente?: string;
  avisoUrgencia: Aviso;
  quemVe: string;
  onRascunho: (texto: string) => void;
  onGravar: () => void;
  onCancelar: () => void;
  onEnviar: () => void;
  onOuvir: () => void;
  onAcao: (acao: AcaoMensagem) => void;
  onPararFala: () => void;
  onConfirmar: (aceitar: boolean) => void;
  onTexto: () => void;
  onVoltar: () => void;
}

export function TelaVozLia(props: Props) {
  const { nome, estado, nivel, iniciando, gravando, transcrevendo, ocupado, falando,
    vozDisponivel, erro, rascunho, resposta, avisos, proposta, atendente, avisoUrgencia, quemVe } = props;
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    setSegundos(0);
    if (!gravando) return;
    const comeco = Date.now();
    const timer = setInterval(() => setSegundos(Math.floor((Date.now() - comeco) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [gravando]);
  const revisando = rascunho !== null;
  const titulo = iniciando ? 'Getting the microphone ready…' : gravando ? "I'm listening…"
    : transcrevendo ? 'Understanding what you said…' : revisando ? 'Is this what you said?'
    : ocupado ? 'Looking up your information…' : falando ? 'Replying…'
    : resposta && estado === 'concluido' ? 'Done.' : 'Shall we talk?';
  const podeResponder = !iniciando && !gravando && !transcrevendo && !revisando && !ocupado;
  const tempo = String(Math.floor(segundos / 60)).padStart(2, '0') + ':' + String(segundos % 60).padStart(2, '0');

  return <section className="lia-voice-screen" aria-label="Voice conversation">
    <header className="lia-voice-header">
      <button type="button" className="lia-icon-button" onClick={props.onVoltar} aria-label="Back"><ArrowLeft size={23} aria-hidden /></button>
      <div className="lia-voice-brand"><LogoOncoFlow className="w-8 h-8" /><div><strong>{nome}</strong><span>OncoFlow Assistant</span></div></div>
      <button type="button" className="lia-icon-button" onClick={props.onTexto} aria-label="Chat by text" title="Chat by text"><MessageSquare size={21} aria-hidden /></button>
    </header>

    {atendente && <p className="lia-human-notice">You are now talking with {atendente}.</p>}
    <div className="space-y-3" aria-live="polite">
      {avisos.map((aviso) => aviso.tipoSistema === 'urgencia'
        ? <AvisoUrgencia key={aviso.id} aviso={avisoUrgencia} destaque />
        : <div key={aviso.id} className="lia-spoken-response">
            <p>{aviso.texto}</p>
            {aviso.link && <a href={aviso.link} target="_blank" rel="noopener noreferrer" className="lia-secondary-button mt-3">
              Join call <ExternalLink size={17} aria-hidden />
            </a>}
          </div>)}
    </div>
    <div className="lia-voice-title"><h1 aria-live="polite">{titulo}</h1><p>{gravando ? "Go ahead, I'm here to help." : transcrevendo ? 'Turning your speech into text.' : revisando ? 'You can correct the text before sending.' : 'Your choice: speak or type.'}</p></div>

    <div className={revisando ? 'lia-voice-visual is-reviewing' : 'lia-voice-visual'}>
      <OrbeLia estado={estado} tamanho={revisando ? 132 : 246} nivel={nivel} />
      {!revisando && <OndaVoz estado={estado} nivel={nivel} />}
      {gravando && <p className="lia-record-time"><span aria-hidden />Recording <time>{tempo}</time></p>}
    </div>

    {erro && <p className="lia-voice-error" role="alert">{erro}</p>}

    {revisando ? <div className="lia-voice-review">
      <label htmlFor="voz-texto-entendido">Review before sending</label>
      <textarea id="voz-texto-entendido" value={rascunho} onChange={(e) => props.onRascunho(e.target.value)} rows={4} />
      <button type="button" className="lia-primary-button" disabled={!rascunho.trim() || ocupado} onClick={props.onEnviar}><Send size={19} aria-hidden />Send message</button>
      <button type="button" className="lia-secondary-button" onClick={props.onGravar}><RotateCcw size={17} aria-hidden />Record again</button>
    </div> : <>
      {podeResponder && resposta && <div className="lia-spoken-response">
        <p>{resposta.texto}</p>
        {resposta.status && <span className="lia-response-status"><Check size={13} aria-hidden />{({ consultado: 'Information looked up', registrado: 'Request logged', encaminhado: 'Forwarded to the team', confirmado: 'Confirmed' })[resposta.status]}</span>}
        {resposta.acoes && <div className="lia-voice-actions">{resposta.acoes.map((acao) =>
          <button key={acao.rotulo} type="button" className="lia-secondary-button" onClick={() => props.onAcao(acao)}>{acao.rotulo}</button>
        )}</div>}
      </div>}
      {podeResponder && proposta && <div className="lia-voice-proposal">
        <p><strong>Before we continue</strong>{proposta.resumo}</p>
        <button type="button" className="lia-primary-button" onClick={() => props.onConfirmar(true)}>{proposta.rotuloConfirmar}</button>
        <button type="button" className="lia-secondary-button" onClick={() => props.onConfirmar(false)}>{proposta.rotuloRecusar}</button>
      </div>}
      <div className="lia-voice-controls">
        {gravando ? <>
          <button type="button" className="lia-stop-recording" onClick={props.onGravar} aria-label="Stop and transcribe"><Square size={25} fill="currentColor" aria-hidden /></button>
          <span>Stop and transcribe</span>
          <button type="button" className="lia-text-button" onClick={props.onCancelar}>Cancel without sending</button>
        </> : iniciando || transcrevendo ? <button type="button" className="lia-secondary-button" onClick={props.onCancelar}><X size={17} aria-hidden />Cancel</button>
          : ocupado ? <p className="lia-voice-wait" role="status">One moment…</p>
          : falando ? <button type="button" className="lia-secondary-button" onClick={props.onPararFala}><Square size={16} aria-hidden />Stop audio</button>
          : !proposta && <button type="button" className="lia-primary-button" onClick={props.onGravar}><Mic size={21} aria-hidden />Start speaking</button>}
        {podeResponder && !falando && resposta && vozDisponivel && <button type="button" className="lia-text-button" onClick={props.onOuvir}><Volume2 size={17} aria-hidden />Listen to reply</button>}
      </div>
    </>}

    <footer className="lia-voice-footer">
      <button type="button" className="lia-text-button" onClick={props.onTexto}><MessageSquare size={16} aria-hidden />I'd rather type</button>
      <p>The microphone only turns on when you start recording. The audio is sent for transcription.</p>
      <AvisoUrgencia aviso={avisoUrgencia} />
      <details><summary>Who sees this conversation</summary><p>{quemVe}</p></details>
    </footer>
  </section>;
}
