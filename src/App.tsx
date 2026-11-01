// OncoFlow Pro: experiência da equipe. O estado vem do servidor e é compartilhado com o
// OncoFlow Paciente em /paciente. As funções do painel do IRIS (pendências, conversa, assumir
// atendimento, plano terapêutico) ficam no detalhe do paciente e na página Comunicação.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { UsuarioEquipe } from './types';
import { chamarApi, useEstadoPro } from './api/pro';
import { LoginView } from './components/LoginView';
import { Sidebar, NavegacaoCompacta, type PaginaPro } from './components/Sidebar';
import { Topo } from './components/Topo';
import { Indicadores } from './components/Indicadores';
import { ListaPacientes } from './components/ListaPacientes';
import { DetalhePaciente } from './components/DetalhePaciente';
import { PaginaPendencias } from './components/PaginaPendencias';
import { InternoView } from './components/InternoView';

const CHAVE_USUARIO = 'oncoflow-pro-usuario';
const INSTITUICAO = 'Fictional Oncology Center';

function lerUsuarioSalvo(): string | null {
  try {
    return localStorage.getItem(CHAVE_USUARIO);
  } catch {
    return null;
  }
}

function salvarUsuario(id: string | null): void {
  try {
    if (id) localStorage.setItem(CHAVE_USUARIO, id);
    else localStorage.removeItem(CHAVE_USUARIO);
  } catch {
    // Sem armazenamento local, o login só não sobrevive a um recarregamento.
  }
}

export default function App() {
  const [usuarios, setUsuarios] = useState<UsuarioEquipe[]>([]);
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioEquipe | null>(null);
  const [pagina, setPagina] = useState<PaginaPro>('inicio');
  const [pacienteSelecionadoId, setPacienteSelecionadoId] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [somenteSinais, setSomenteSinais] = useState(false);

  useEffect(() => {
    chamarApi<{ usuarios: UsuarioEquipe[] }>('/api/demo/usuarios')
      .then(({ usuarios: lista }) => {
        setUsuarios(lista);
        const salvo = lista.find((u) => u.id === lerUsuarioSalvo());
        if (salvo) setUsuarioLogado(salvo);
      })
      .catch(() => setUsuarios([]));
  }, []);

  const { estado, erro, acoes } = useEstadoPro(usuarioLogado);
  const pacientes = estado?.pacientes ?? [];

  useEffect(() => {
    if (!pacienteSelecionadoId && pacientes[0]) setPacienteSelecionadoId(pacientes[0].id);
  }, [pacientes, pacienteSelecionadoId]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pacientes;
    return pacientes.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        p.diagnosticoResumido.toLowerCase().includes(termo) ||
        p.esquemaResumido.toLowerCase().includes(termo)
    );
  }, [pacientes, busca]);

  const totalPendencias = pacientes.reduce((n, p) => n + p.pendencias.filter((pe) => pe.estado !== 'concluida').length, 0);
  const contatoAberto = pacientes.some((p) => p.pendencias.some((pe) => pe.tipo === 'contato_equipe' && pe.estado !== 'concluida'));
  const selecionado = filtrados.find((p) => p.id === pacienteSelecionadoId) ?? filtrados[0];

  const navegar = (p: PaginaPro) => {
    setPagina(p);
    window.scrollTo({ top: 0 });
  };

  const buscar = (texto: string) => {
    setBusca(texto);
    if (pagina === 'pendencias' || pagina === 'comunicacao') setPagina('pacientes');
  };

  const entrar = (usuario: UsuarioEquipe) => {
    salvarUsuario(usuario.id);
    setUsuarioLogado(usuario);
  };

  const sair = () => {
    salvarUsuario(null);
    setUsuarioLogado(null);
  };

  if (!usuarioLogado) {
    return <LoginView usuarios={usuarios} onLogin={entrar} />;
  }

  const listaEDetalhe = (limite?: number) => (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <div className="xl:col-span-5">
        <ListaPacientes
          pacientes={limite ? filtrados.slice(0, limite) : filtrados}
          selecionadoId={selecionado?.id}
          onSelecionar={setPacienteSelecionadoId}
          onVerTodos={limite ? () => navegar('pacientes') : undefined}
          titulo={limite ? 'Patients under follow-up' : `Patients (${filtrados.length})`}
        />
      </div>
      <div className="xl:col-span-7">
        {selecionado ? (
          <DetalhePaciente
            paciente={selecionado}
            usuarioAtual={usuarioLogado}
            acoes={acoes}
            minutosRetornoLia={estado!.minutosRetornoLia}
          />
        ) : (
          <p className="text-tinta-suave">Select a patient.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="pro-app min-h-screen bg-fundo text-azul md:flex">
      <Sidebar
        pagina={pagina}
        onNavegar={navegar}
        totalPendencias={totalPendencias}
        comunicacaoAtiva={contatoAberto}
        instituicao={INSTITUICAO}
      />
      <div className="flex-1 min-w-0">
        <NavegacaoCompacta pagina={pagina} onNavegar={navegar} />
        <main className="px-4 sm:px-8 xl:px-10 py-8 space-y-7 max-w-[1500px]">
          <Topo
            usuario={usuarioLogado}
            busca={busca}
            onBuscar={buscar}
            totalPendencias={totalPendencias}
            onAbrirPendencias={() => navegar('pendencias')}
            onResetarDemo={acoes.resetarDemo}
            onLogout={sair}
          />

          {erro && (
            <div role="alert" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-atencao-fundo border border-atencao-borda text-atencao text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
              {erro}
            </div>
          )}

          {!estado ? (
            <p className="text-tinta-suave">Loading patients…</p>
          ) : pagina === 'inicio' ? (
            <>
              <Indicadores
                pacientes={pacientes}
                onAbrir={(destino) => {
                  if (destino === 'pacientes') navegar('pacientes');
                  else {
                    setSomenteSinais(destino === 'sinais');
                    navegar('pendencias');
                  }
                }}
              />
              {listaEDetalhe(5)}
            </>
          ) : pagina === 'pacientes' ? (
            listaEDetalhe()
          ) : pagina === 'pendencias' ? (
            <PaginaPendencias estado={estado} acoes={acoes} somenteSinais={somenteSinais} onAlternarFiltro={setSomenteSinais} />
          ) : (
            <div>
              <InternoView
                pacientes={pacientes}
                usuarioAtual={usuarioLogado}
                acoes={acoes}
                minutosRetornoLia={estado.minutosRetornoLia}
                pacienteSelecionadoId={pacienteSelecionadoId}
                onSelecionarPaciente={setPacienteSelecionadoId}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
