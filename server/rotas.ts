// Rotas da API. Prefixos separados por experiência: /api/pro (equipe) e /api/paciente.
// Identificação SÓ DE DEMO: a equipe envia `x-demo-usuario` e o paciente envia
// `Authorization: Bearer demo-maria`. Em produção isso vira autenticação de verdade, com acesso
// por perfil, instituição, equipe e finalidade (skill oncoflow-seguranca-lgpd).

import express, { type NextFunction, type Request, type Response } from 'express';
import type { Desfecho, OpcaoCheckin, UsuarioEquipe } from '../src/types';
import {
  assumirConversa,
  assumirPendencia,
  atualizarPlano,
  concluirPendencia,
  devolverParaLia,
  ErroDominio,
  iniciarVideochamada,
  mensagemDoProfissional,
  pacienteDaSessao,
  registrarCheckin,
  resetar,
  usuarioPorId,
} from './estado';
import { mensagemDoPaciente, responderProposta } from './lia';
import { USUARIOS_EQUIPE } from './seed';
import { visaoPaciente, visaoPro } from './visoes';

const OPCOES_VALIDAS: OpcaoCheckin[] = ['bem', 'cansaco', 'dor', 'nausea', 'ansiedade', 'outro'];
const DESFECHOS_VALIDOS: Desfecho[] = ['sem_acao_necessaria', 'contato_realizado', 'encaminhado'];

type Handler = (req: Request, res: Response) => void;

// Converte ErroDominio em resposta JSON no formato {erro, mensagem}.
function rota(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      handler(req, res);
    } catch (erro) {
      if (erro instanceof ErroDominio) {
        res.status(erro.status).json({ erro: erro.codigo, mensagem: erro.message });
        return;
      }
      next(erro);
    }
  };
}

function usuarioDa(req: Request): UsuarioEquipe {
  return usuarioPorId(req.header('x-demo-usuario'));
}

function pacienteDa(req: Request) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  return pacienteDaSessao(token);
}

function textoDo(req: Request, campo = 'texto'): string {
  const valor = req.body?.[campo];
  if (typeof valor !== 'string') throw new ErroDominio(400, 'campo_invalido', `Field "${campo}" is required.`);
  return valor;
}

export function criarRotas(): express.Router {
  const r = express.Router();

  // Demo
  r.get('/api/demo/usuarios', (_req, res) => {
    res.json({ usuarios: USUARIOS_EQUIPE, sessaoPaciente: 'demo-maria' });
  });
  r.post(
    '/api/demo/reset',
    rota((_req, res) => {
      resetar();
      res.json({ ok: true });
    })
  );

  // OncoFlow Pro (equipe)
  r.get(
    '/api/pro/estado',
    rota((req, res) => {
      usuarioDa(req);
      res.json(visaoPro());
    })
  );
  r.post(
    '/api/pro/pacientes/:id/assumir',
    rota((req, res) => {
      assumirConversa(req.params.id, usuarioDa(req));
      res.json({ ok: true });
    })
  );
  r.post(
    '/api/pro/pacientes/:id/devolver',
    rota((req, res) => {
      devolverParaLia(req.params.id, usuarioDa(req), 'manual');
      res.json({ ok: true });
    })
  );
  r.post(
    '/api/pro/pacientes/:id/mensagens',
    rota((req, res) => {
      mensagemDoProfissional(req.params.id, usuarioDa(req), textoDo(req));
      res.json({ ok: true });
    })
  );
  r.post(
    '/api/pro/pacientes/:id/plano',
    rota((req, res) => {
      atualizarPlano(req.params.id, usuarioDa(req), textoDo(req), textoDo(req, 'atualizadoEm'));
      res.json({ ok: true });
    })
  );
  r.post(
    '/api/pro/pacientes/:id/videochamada',
    rota((req, res) => {
      res.json({ link: iniciarVideochamada(req.params.id, usuarioDa(req)) });
    })
  );
  r.post(
    '/api/pro/pendencias/:id/assumir',
    rota((req, res) => {
      assumirPendencia(req.params.id, usuarioDa(req));
      res.json({ ok: true });
    })
  );
  r.post(
    '/api/pro/pendencias/:id/concluir',
    rota((req, res) => {
      const desfecho = req.body?.desfecho as Desfecho;
      if (!DESFECHOS_VALIDOS.includes(desfecho)) {
        throw new ErroDominio(400, 'desfecho_invalido', 'Choose the review outcome.');
      }
      concluirPendencia(req.params.id, usuarioDa(req), desfecho);
      res.json({ ok: true });
    })
  );

  // OncoFlow Paciente (o paciente vem da sessão, nunca da URL)
  r.get(
    '/api/paciente/inicio',
    rota((req, res) => {
      res.json(visaoPaciente(pacienteDa(req)));
    })
  );
  r.post(
    '/api/paciente/conversa',
    rota((req, res) => {
      const paciente = pacienteDa(req);
      const origem = req.body?.origem === 'voz' ? 'voz' : 'texto';
      mensagemDoPaciente(paciente.id, textoDo(req), origem);
      res.json(visaoPaciente(paciente));
    })
  );
  r.post(
    '/api/paciente/conversa/confirmar',
    rota((req, res) => {
      const paciente = pacienteDa(req);
      responderProposta(paciente.id, textoDo(req, 'token'), req.body?.aceitar === true);
      res.json(visaoPaciente(paciente));
    })
  );
  r.post(
    '/api/paciente/checkin',
    rota((req, res) => {
      const paciente = pacienteDa(req);
      const opcoes = Array.isArray(req.body?.opcoes)
        ? (req.body.opcoes as unknown[]).filter((o): o is OpcaoCheckin => OPCOES_VALIDAS.includes(o as OpcaoCheckin))
        : [];
      const texto = typeof req.body?.texto === 'string' ? req.body.texto : undefined;
      const origem = req.body?.origem === 'voz' ? 'voz' : 'visual';
      const { urgencia } = registrarCheckin(paciente, opcoes, texto, origem);
      res.json({ urgencia, inicio: visaoPaciente(paciente) });
    })
  );

  return r;
}
