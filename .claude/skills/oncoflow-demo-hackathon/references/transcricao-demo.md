# Transcrição fictícia da demo — `mama-fertilidade`

Consulta inteiramente fictícia, escrita para a demo e para o caso de avaliação de mesmo nome
(`oncoflow-copiloto-ia/references/casos-avaliacao.md`). Não contém orientação clínica real; o médico não
decide conduta na transcrição, para a demo não parecer recomendação médica.

| id | interlocutor | texto |
|---|---|---|
| s01 | medico | Bom dia, Maria. Como você tem se sentido desde a última vez que conversamos? |
| s02 | paciente | Bom dia, doutora. Ando mais cansada, principalmente no fim da tarde. |
| s03 | medico | Entendi. Esse cansaço atrapalha suas atividades do dia a dia? |
| s04 | paciente | Um pouco. Ainda estou trabalhando, mas chego em casa sem energia. |
| s05 | medico | Hoje eu queria explicar as próximas etapas e ouvir suas dúvidas. |
| s06 | paciente | Tenho uma dúvida que está me tirando o sono. Eu e meu marido queremos ter filhos. |
| s07 | paciente | Tenho medo de o tratamento afetar minha fertilidade. |
| s08 | medico | É muito importante você ter trazido isso. Vamos considerar esse ponto no planejamento. |
| s09 | medico | Antes de começar o tratamento, você vai precisar fazer alguns exames pré-tratamento. |
| s10 | paciente | Esses exames precisam de autorização do convênio? |
| s11 | medico | Alguns sim. A equipe de navegação vai te ajudar com isso. |
| s12 | paciente | Outra coisa: eu moro longe. Se der para fazer os exames no mesmo dia, me ajuda muito. |
| s13 | medico | Vamos ver o que é possível. Alguma outra preocupação? |
| s14 | paciente | Só o trabalho mesmo. Não sei se vou conseguir manter o emprego durante o tratamento. |
| s15 | medico | Podemos te apresentar o apoio psicossocial do serviço, se você quiser. |
| s16 | paciente | Quero sim, obrigada. |

## Extração esperada (gravada em `fixtures/extracoes/mama-fertilidade.json`)

| categoria | tipo | texto | evidência |
|---|---|---|---|
| sintoma_relatado | dado_extraido | Paciente relata cansaço maior, principalmente no fim da tarde. | s02 "Ando mais cansada, principalmente no fim da tarde." |
| preferencia | dado_extraido | Paciente relata desejo de ter filhos com o parceiro. | s06 "Eu e meu marido queremos ter filhos." |
| preocupacao | dado_extraido | Paciente relata medo de o tratamento afetar a fertilidade. | s07 "Tenho medo de o tratamento afetar minha fertilidade." |
| necessidade_possivel | **hipotese_ia** (opcional) | Avaliar necessidade de acompanhamento relacionado à fertilidade? | s06, s07 |
| pendencia_operacional | dado_extraido | Médica informa necessidade de exames pré-tratamento; alguns precisam de autorização do convênio. | s09, s11 "Alguns sim." |
| preferencia | dado_extraido | Paciente mora longe e prefere concentrar os exames no mesmo dia. | s12 "Se der para fazer os exames no mesmo dia, me ajuda muito." |
| preocupacao | dado_extraido | Paciente relata preocupação em manter o emprego durante o tratamento. | s14 "Não sei se vou conseguir manter o emprego durante o tratamento." |
| necessidade_possivel | dado_extraido | Paciente aceitou ser apresentada ao apoio psicossocial do serviço. | s15, s16 "Quero sim, obrigada." |

Na demo, aprove ao vivo **a preocupação com a fertilidade (relato, s07)**, marcando "Gerar tarefa para a
navegação", como no exemplo do documento: a IA destaca a preocupação como relato, sem inferir decisão
clínica, e a profissional confirma a necessidade de acompanhamento. A hipótese é opcional e não entra no
roteiro. A preferência por concentrar exames (s12) é um bom segundo exemplo se sobrar tempo: ela liga direto
ao indicador "coordenação de visitas".
