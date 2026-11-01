# Indicadores do OncoFlow (definições operacionais)

Os documentos do produto listam estes indicadores de sucesso, a definir com o Cancer Center e medir num piloto.
**Nunca exiba nem descreva um indicador como resultado já obtido.** Todo card mostra o período, o numerador,
o denominador e, no MVP, o selo "dados fictícios".

| Indicador | Definição operacional | Fonte |
|---|---|---|
| Tempo entre etapas da jornada | Mediana e P90 de `concluida_em(etapa N+1) − concluida_em(etapa N)` por linha de cuidado. Use mediana, nunca média: a distribuição é assimétrica. | `etapa_jornada` |
| Tarefas pendentes ou vencidas | Quantidade e proporção de tarefas abertas com `prazo < agora` sobre as abertas, e idade do atraso, por responsável. | `tarefa` |
| Tempo entre relato e revisão | Mediana de `revisado_em − checkin.enviado_em` (revisões) e de `atendida_em − criada_em` (solicitações de relato ou contato). | `revisao_checkin`, `solicitacao` |
| Check-ins revisados no prazo | `revisões com revisado_em ≤ prazo_resposta / revisões criadas` no período. | `revisao_checkin` |
| Compreensão dos próximos passos | Pergunta curta no app ("Você sabe qual é o seu próximo passo?" sim/em parte/não), de forma periódica e opcional. | questionário |
| Experiência e facilidade de uso, incluindo acessibilidade | Questionário curto (ex.: SUS adaptado) + uso de voz × visual + uso de fonte grande. No MVP, só o desenho. | questionário, telemetria sem conteúdo |
| Retrabalho e falhas de coordenação | Proxy: tarefas canceladas por duplicidade, solicitações de reagendamento por falta de preparo e exames repetidos registrados manualmente. Definição a fechar com o hospital. | `tarefa`, `solicitacao` |
| Qualidade da IA (interno) | Mediana de `validado_em − criado_em` dos itens extraídos e taxa de rejeição por categoria e motivo. | `item_extraido` |
| Coordenação de visitas (secundário) | Compromissos do mesmo paciente em dias diferentes, com menos de 7 dias de intervalo, que poderiam ser agrupados. | `compromisso` |

## SQL de referência

```sql
-- Tarefas vencidas por responsável (proporção sobre as abertas)
select coalesce(u.nome, t.responsavel_papel) as responsavel,
       count(*) filter (where t.prazo < now())                       as vencidas,
       count(*)                                                       as abertas,
       round(100.0 * count(*) filter (where t.prazo < now()) / count(*), 1) as pct_vencidas,
       max(now() - t.prazo) filter (where t.prazo < now())            as atraso_maximo
from tarefa t
left join usuario u on u.id = t.responsavel_usuario_id
where t.estado in ('aberta', 'em_andamento') and t.instituicao_id = :instituicao
group by 1
order by vencidas desc;

-- Tempo entre etapas consecutivas concluídas
with ordenadas as (
  select paciente_id, ordem, concluida_em,
         lag(concluida_em) over (partition by paciente_id order by ordem) as anterior
  from etapa_jornada
  where estado = 'concluida' and instituicao_id = :instituicao
)
select percentile_cont(0.5) within group (order by concluida_em - anterior) as mediana,
       percentile_cont(0.9) within group (order by concluida_em - anterior) as p90,
       count(*) as n_intervalos
from ordenadas
where anterior is not null;

-- Tempo entre relato (check-in) e revisão, e taxa no prazo
select percentile_cont(0.5) within group (order by r.revisado_em - c.enviado_em) as mediana_ate_revisao,
       count(*) filter (where r.revisado_em <= r.prazo_resposta)::float / nullif(count(*), 0) as taxa_no_prazo,
       count(*) as revisoes
from revisao_checkin r
join checkin c on c.id = r.checkin_id
where c.instituicao_id = :instituicao and c.enviado_em >= :inicio and c.enviado_em < :fim;
```

Com n pequeno (menos de 10 intervalos ou revisões), mostre o número absoluto e o aviso "amostra pequena" no
lugar do percentual.
