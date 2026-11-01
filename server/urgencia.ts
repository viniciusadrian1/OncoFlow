// Detector de possível urgência. Roda ANTES de qualquer outra interpretação da mensagem.
// A lista de termos vem da configuração do serviço; aqui só existe a mecânica de comparação.
// O resultado nunca é exibido como fato: para a equipe é uma "hipótese do sistema" a revisar,
// e para o paciente é o aviso de urgência aprovado pelo hospital.

import { CONFIG_SERVICO } from './configServico';
import { normalizar } from './util';

// Negações simples imediatamente antes do termo ("no fever", "sem febre").
// O texto já vem normalizado, então "don't" chega como "don t".
// Expressões como "não consigo respirar" pertencem à lista do serviço como um termo
// completo; o "não" dentro desse termo não nega o relato de dificuldade.
const NEGACOES = ['no', 'not', 'without', 'don t have', 'didn t have', 'don t feel', 'haven t had', 'never had', 'free of', 'nao', 'sem', 'nao tenho', 'nao sinto', 'nao estou com', 'nao estou sentindo', 'nem'];

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectarUrgencia(texto: string): { termo: string } | undefined {
  const t = normalizar(texto);
  for (const termo of CONFIG_SERVICO.termosUrgencia) {
    const regex = new RegExp(`(^|\\s)${escaparRegex(normalizar(termo))}(?=\\s|$)`, 'g');
    let achado: RegExpExecArray | null;
    while ((achado = regex.exec(t))) {
      const antes = t.slice(Math.max(0, achado.index - 30), achado.index).trim();
      const negado = NEGACOES.some((neg) => new RegExp(`(^|\\s)${neg}(\\s+\\w+)?$`).test(antes));
      if (!negado) return { termo };
    }
  }
  return undefined;
}

/** Conservative text mechanics for automatic reporting in the fictional demo.
 * This is a current first-person assertion gate, not a severity classifier or a diagnosis.
 * Ordinary symptom mentions still reach the conversational path without creating records.
 */
export function detectarRelatoAfirmativo(texto: string): { termo: string } | undefined {
  // Keep punctuation on the preceding clause: a bare "Febre?" remains a question,
  // while the statement after it gets a fresh subject/negation/history scope.
  const sentences = texto.split(/(?<=[.!?;\n])|\b(?:mas|porém|porem|but|however)\b/iu);
  const currentSubject = String.raw`(?:(?:agora|hoje|atualmente|now|today|currently)\s+)?(?:(?:eu\s+)?(?:estou|tô|to|tou|tenho|sinto|ando|continuo|sigo|apresento|não consigo|nao consigo|não paro|nao paro)|i(?:\s+(?:am|have|feel|keep)|['’](?:m|ve)))\b`;
  const commaBoundary = new RegExp(String.raw`,\s*(?=(?:(?:e|and)\s+)?${currentSubject})`, 'iu');
  const conjunctionBoundary = new RegExp(String.raw`\b(?:e|and)\s+(?=${currentSubject})`, 'iu');
  const hypotheticalPrefix = /(^|\s)(se|caso|talvez|hipoteticamente|imagine|if|unless|suppose|hypothetically|maybe|might|would)(\s|$)/;
  const clauses = sentences.flatMap(sentence => sentence.split(commaBoundary)).flatMap(clause =>
    // "If I have fever and I am vomiting" is still a conditional question. In an
    // ordinary statement, a new current subject starts its own assertion instead.
    hypotheticalPrefix.test(normalizar(clause)) ? [clause] : clause.split(conjunctionBoundary),
  );
  for (const raw of clauses) {
    const clause = normalizar(raw);
    if (!clause) continue;
    for (const termo of CONFIG_SERVICO.termosUrgencia) {
      const normalizedTerm = normalizar(termo);
      const matches = new RegExp(`(^|\\s)${escaparRegex(normalizedTerm)}(?=\\s|$)`, 'g');
      let match: RegExpExecArray | null;
      while ((match = matches.exec(clause))) {
        const before = clause.slice(0, match.index).trim();
        const after = clause.slice(match.index + match[0].length).trim();
        const hypothetical = /(^|\s)(se|caso|talvez|hipoteticamente|imagine|if|unless|suppose|hypothetically|maybe|might|would)(\s|$)/.test(before);
        const educational = /(^|\s)(duvida sobre|medo de|pergunta sobre|question about|afraid of|learn about)(\s|$)/.test(before);
        const historical = /(^|\s)(ontem|antigamente|tive|tinha|estava|estive|semana passada|mes passado|ano passado|yesterday|last week|last month|previously|used to|i had|i was)(\s|$)/.test(before);
        const thirdParty = /(^|\s)(minha (mae|irma|filha|amiga|esposa|avo|vizinha)|meu (pai|irmao|filho|amigo|marido|avo|vizinho)|ela|ele|my (mother|father|child|daughter|son|wife|husband|friend)|she|he|they|someone|another patient)(\s|$)/.test(before);
        if (hypothetical || educational || historical || thirdParty) continue;
        const negated = /(^|\s)(nao|sem|nem|no|not|without|don t|didn t|haven t)(?:\s+(?:have|had|a|any|am|m|estou|tenho|sinto|to|com|sentindo|tendo|nenhum|nenhuma|mais|very|high|much|ainda)){0,6}$/.test(before);
        if (negated) continue;
        const current = /(^|\s)(?:(?:eu\s+)?(?:estou|to|tou|tenho|sinto|ando|continuo|sigo|apresento)(?:\s+(?:com|sentindo|tendo|apresentando|ainda|agora|hoje|muita?|forte|intensa?|persistentes?|episodios|de)){0,6}|i\s+(?:am|m|have|feel|keep|have been|am having|ve been|ve got)(?:\s+(?:a|the|very|still|currently|having|experiencing|feeling|persistent|severe|high)){0,5})$/.test(before);
        const inherentFirstPerson = /^(?:nao (?:consigo|paro|aguento)|can t)/.test(normalizedTerm) && /^(?:eu|i)?$/.test(before);
        const bareCurrent = !raw.includes('?') && /^(?:muita?|forte|intensa?|persistentes?|alta)?$/.test(before) && /^(?:(?:alta|forte|intensa?|persistentes?|agora|hoje|now|today|e|and|com|with|vomitos|vomitando|fever|vomiting)\s*)*$/.test(after);
        if (current || inherentFirstPerson || bareCurrent) return { termo };
      }
    }
  }
  return undefined;
}
