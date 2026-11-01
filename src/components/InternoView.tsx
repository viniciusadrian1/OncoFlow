// Aba "Interno" (base: InternoView do IRIS): lista de conversas e o chat do paciente escolhido.

import React, { useState } from 'react';
import { MessageSquare, Search, Clock, Inbox, UserCheck } from 'lucide-react';
import type { PacientePro, UsuarioEquipe } from '../types';
import type { AcoesPro } from '../api/pro';
import { ChatView } from './ChatView';
import { PlanoTerapeuticoModal } from './PlanoTerapeuticoModal';
import { infoSituacao } from './Pendencias';
import { OrbeMini } from './OrbeMini';

interface InternoViewProps {
  pacientes: PacientePro[];
  usuarioAtual: UsuarioEquipe;
  acoes: AcoesPro;
  minutosRetornoLia: number;
  pacienteSelecionadoId?: string;
  onSelecionarPaciente: (pacienteId: string) => void;
}

export const InternoView: React.FC<InternoViewProps> = ({
  pacientes,
  usuarioAtual,
  acoes,
  minutosRetornoLia,
  pacienteSelecionadoId,
  onSelecionarPaciente,
}) => {
  const [busca, setBusca] = useState('');
  const [planoAberto, setPlanoAberto] = useState(false);

  const termo = busca.trim().toLowerCase();
  const pacientesFiltrados = pacientes.filter(
    (p) =>
      !termo ||
      p.nome.toLowerCase().includes(termo) ||
      p.diagnosticoResumido.toLowerCase().includes(termo) ||
      p.mensagens.some((m) => m.texto.toLowerCase().includes(termo))
  );
  const pacienteAtivo = pacientes.find((p) => p.id === pacienteSelecionadoId);

  return (
    <div>
      <div className="bg-white rounded-xl border border-linha overflow-hidden grid grid-cols-1 xl:grid-cols-12 min-h-[620px]">
        <div className="xl:col-span-4 border-b xl:border-b-0 xl:border-r border-linha flex flex-col bg-fundo">
          <div className="p-4 border-b border-linha bg-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-verde" aria-hidden />
                <h2 className="text-sm font-bold text-azul">Conversations</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gelo text-azul border border-linha">
                {pacientes.length} patients
              </span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-tinta-suave" aria-hidden />
              <label htmlFor="input-busca-interno" className="sr-only">
                Search conversations
              </label>
              <input
                type="text"
                id="input-busca-interno"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Search conversation, diagnosis or word…"
                className="w-full pl-9 pr-3 py-2 text-xs border border-linha rounded-lg focus:outline-none focus:ring-2 focus:ring-verde text-azul bg-fundo"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px] xl:max-h-none divide-y divide-linha">
            {pacientesFiltrados.length === 0 ? (
              <div className="p-8 text-center text-xs text-tinta-suave">No conversations found.</div>
            ) : (
              pacientesFiltrados.map((p) => {
                const selecionado = p.id === pacienteSelecionadoId;
                const ultima = [...p.mensagens].reverse().find((m) => !m.sistema || m.tipoSistema === 'urgencia');
                const info = infoSituacao(p.situacao);
                return (
                  <button
                    key={p.id}
                    type="button"
                    id={`conversa-item-${p.id}`}
                    onClick={() => onSelecionarPaciente(p.id)}
                    aria-current={selecionado}
                    className={`w-full text-left p-3.5 sm:p-4 flex items-start gap-3 hover:bg-gelo/40 cursor-pointer ${
                      selecionado ? 'bg-gelo border-l-4 border-l-verde' : 'bg-white'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-xl bg-gelo text-azul font-bold text-xs flex items-center justify-center border border-linha shrink-0">
                      {p.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-xs sm:text-sm text-azul truncate">{p.nome}</span>
                        <span className="text-[10px] text-tinta-suave shrink-0 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" aria-hidden />
                          {ultima?.horario ?? p.ultimaInteracao}
                        </span>
                      </div>
                      <p className="text-xs text-azul truncate">
                        {ultima ? (
                          <>
                            <span className="font-semibold text-tinta-suave">
                              {ultima.autor === 'lia'
                                ? 'Lia: '
                                : ultima.autor === 'profissional'
                                ? `${ultima.nomeAutor.replace(/^(Dra?\.|Nurse)\s*/, '').split(' ')[0]}: `
                                : 'Patient: '}
                            </span>
                            {ultima.texto}
                          </>
                        ) : (
                          'No messages yet'
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${info.classes}`}>
                          <info.Icone className="w-2.5 h-2.5" aria-hidden />
                          {info.rotulo}
                        </span>
                        {p.modoConversa === 'lia' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-azul bg-gelo px-2 py-0.5 rounded-md border border-linha">
                            <OrbeMini className="w-2.5 h-2.5" />
                            Lia
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white bg-verde px-2 py-0.5 rounded-md">
                            <UserCheck className="w-2.5 h-2.5" aria-hidden />
                            {p.profissionalResponsavel}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="xl:col-span-8 flex flex-col bg-white">
          {pacienteAtivo ? (
            <div className="h-full p-2 sm:p-3 flex flex-col">
              <ChatView
                paciente={pacienteAtivo}
                usuarioAtual={usuarioAtual}
                acoes={acoes}
                minutosRetornoLia={minutosRetornoLia}
                onVerPlano={() => setPlanoAberto(true)}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-fundo">
              <div className="w-16 h-16 rounded-2xl bg-gelo flex items-center justify-center mb-4 border border-linha">
                <Inbox className="w-8 h-8 text-azul" aria-hidden />
              </div>
              <h3 className="text-base font-bold text-azul">Choose a conversation</h3>
              <p className="text-xs text-tinta-suave max-w-sm mt-1">
                See what the patient talked about with Lia, or take over the conversation.
              </p>
            </div>
          )}
        </div>
      </div>

      {planoAberto && pacienteAtivo && (
        <PlanoTerapeuticoModal paciente={pacienteAtivo} onFechar={() => setPlanoAberto(false)} />
      )}
    </div>
  );
};
