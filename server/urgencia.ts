// Detector de possível urgência. Roda ANTES de qualquer outra interpretação da mensagem.
// A lista de termos vem da configuração do serviço; aqui só existe a mecânica de comparação.
// O resultado nunca é exibido como fato: para a equipe é uma "hipótese do sistema" a revisar,
// e para o paciente é o aviso de urgência aprovado pelo hospital.

import { CONFIG_SERVICO } from './configServico';
import { normalizar } from './util';
import { findCurrentSymptomAssertion } from '../patient-app/shared/symptomAssertions';

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
  const termo = findCurrentSymptomAssertion(texto, CONFIG_SERVICO.termosUrgencia);
  return termo ? { termo } : undefined;
}
