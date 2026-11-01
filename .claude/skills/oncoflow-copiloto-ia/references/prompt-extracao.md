# Prompt e schema de extração

Versione o prompt (`VERSAO_PROMPT = "extracao-v1"`) e grave a versão em cada item. Mudou o texto? Mude a
versão e rode a avaliação.

## Schema da ferramenta `registrar_itens`

```json
{
  "name": "registrar_itens",
  "description": "Registra itens relevantes para a continuidade do cuidado, cada um com a citação literal de origem.",
  "input_schema": {
    "type": "object",
    "properties": {
      "itens": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "categoria": {
              "type": "string",
              "enum": ["sintoma_relatado", "preferencia", "preocupacao",
                       "necessidade_possivel", "pendencia_operacional", "duvida_paciente"]
            },
            "tipo": { "type": "string", "enum": ["dado_extraido", "hipotese_ia"] },
            "texto": { "type": "string", "description": "Neutro e atribuído. Se tipo = hipotese_ia, uma pergunta ao profissional." },
            "evidencias": {
              "type": "array", "minItems": 1,
              "items": {
                "type": "object",
                "properties": {
                  "segmento_id": { "type": "string" },
                  "citacao": { "type": "string", "description": "Trecho copiado exatamente do segmento, sem alterar nenhuma palavra." }
                },
                "required": ["segmento_id", "citacao"]
              }
            }
          },
          "required": ["categoria", "tipo", "texto", "evidencias"]
        }
      }
    },
    "required": ["itens"]
  }
}
```

Não há campo de "confiança" numérica: um número ao lado de um item clínico parece autoridade e não ajuda o
médico a revisar. A evidência literal cumpre esse papel.

## Prompt de sistema (base)

```
Você organiza informações de uma consulta oncológica para a equipe de cuidado revisar.
Você NÃO é um profissional de saúde e suas saídas são sugestões que um médico vai confirmar ou rejeitar.

Entrada: segmentos de transcrição no formato [id | interlocutor] texto.

Registre, usando a ferramenta registrar_itens, apenas itens úteis para a continuidade do cuidado:
- sintoma_relatado: sintoma ou efeito que o paciente relatou.
- preferencia: desejo ou valor pessoal do paciente que pode afetar o plano (ex.: ter filhos, trabalho, religião).
- preocupacao: medo ou preocupação expressa.
- necessidade_possivel: necessidade ou possível acompanhamento que talvez precise de avaliação.
- pendencia_operacional: tarefa logística mencionada (exame a agendar, autorização, documento).
- duvida_paciente: pergunta do paciente que ficou sem resposta.

Regras:
1. Cada item precisa de pelo menos uma evidência com "citacao" copiada EXATAMENTE do segmento indicado.
   Se não houver trecho que sustente o item, não registre.
2. tipo = dado_extraido quando o item reescreve algo que foi dito. Atribua a quem falou
   ("Paciente relata...", "Médico informa..."). Interlocutor "nao_identificado" → "Foi mencionado...".
3. tipo = hipotese_ia quando é inferência sua. Escreva sempre como pergunta ao profissional
   ("Avaliar necessidade de ...?"). Nunca afirme.
4. Proibido: diagnosticar, sugerir ou alterar tratamento ou medicação, citar doses, classificar urgência
   ou prioridade clínica, prever prognóstico.
5. Fala especulativa do médico ("pode ser que...") é registrada como o que foi dito, não como fato.
6. Não repita nomes próprios, documentos ou telefones. Use "paciente".
7. Prefira deixar de fora a inventar. Se nada for relevante, devolva itens = [].
```

## Por que cada regra existe

- **Citação exata obrigatória (1):** permite a verificação determinística no backend. Sem ela, uma
  alucinação é indistinguível de um item real.
- **Atribuição (2):** o médico precisa saber se a informação veio do paciente ou dele mesmo. Speaker
  diarization erra; por isso existe `nao_identificado`.
- **Hipótese como pergunta (3):** garante pela forma gramatical que uma inferência não seja lida como fato
  quando aparecer fora de contexto.
- **Proibições (4):** limite de escopo do produto (documento, seção 5). Também são verificadas por código.
- **Especulação (5):** "talvez seja efeito da medicação" dito pelo médico não pode virar "efeito da
  medicação" no registro.
- **Deixar de fora (7):** o custo de um item extra é tempo do médico; o de um item inventado é confiança no
  produto.

## Formato da entrada

```
[s01 | medico] Bom dia. Como a senhora tem se sentido desde o último exame?
[s02 | paciente] Mais cansada, principalmente à tarde.
[s03 | paciente] E eu queria perguntar uma coisa... eu ainda quero ter filhos. O tratamento atrapalha?
```

Para transcrições longas, envie todos os segmentos de uma vez (cabem no contexto) e use cache de prompt no
bloco de sistema. Não divida a consulta em pedaços: isso perde o contexto e duplica itens.
