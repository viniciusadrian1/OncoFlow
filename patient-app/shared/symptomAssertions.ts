/** Text assertion mechanics shared by the service and the no-delivery fallback.
 * The supplied terms select what to check; this never scores or diagnoses symptoms.
 */
function normalize(text: string, preserveCommas = false): string {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(preserveCommas ? /[^a-z0-9,\s]/g : /[^a-z0-9\s]/g, " ");
  return (preserveCommas ? normalized.replace(/,/g, " , ") : normalized)
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findCurrentSymptomAssertion(
  text: string,
  terms: readonly string[],
): string | undefined {
  const sentences = text.split(
    /(?<=[.!?;\n])|\b(?:mas|porém|porem|but|however)\b/iu,
  );
  const currentSubject = String.raw`(?:(?:agora|hoje|atualmente|now|today|currently)\s+)?(?:(?:eu\s+)?(?:estou|tô|to|tou|tenho|sinto|ando|continuo|sigo|apresento|não consigo|nao consigo|não paro|nao paro)|i(?:\s+(?:am|have|feel|keep)|['’](?:m|ve)))\b`;
  const commaBoundary = new RegExp(
    String.raw`,\s*(?=(?:(?:e|and)\s+)?${currentSubject})`,
    "iu",
  );
  const conjunctionBoundary = new RegExp(
    String.raw`\b(?:e|and)\s+(?=${currentSubject})`,
    "iu",
  );
  const hypotheticalPrefix =
    /(^|\s)(se|caso|talvez|hipoteticamente|imagine|if|unless|suppose|hypothetically|maybe|might|would)(\s|$)/;
  const clauses = sentences
    .flatMap((sentence) => sentence.split(commaBoundary))
    .flatMap((clause) =>
      hypotheticalPrefix.test(normalize(clause))
        ? [clause]
        : clause.split(conjunctionBoundary),
    );
  // A non-triggering symptom can precede an attention term in the same assertion:
  // "estou com náusea, febre e vômito". Only known symptom words may extend that
  // subject; education, another person and a denial cannot become list items.
  const listItems = [
    ...terms,
    "náusea",
    "náuseas",
    "enjoo",
    "enjoos",
    "nausea",
    "nauseous",
    "nauseated",
  ]
    .map((term) => normalize(term))
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  const listTail = new RegExp(
    `\\s+(?:${listItems})(?:\\s+(?:persistentes?|forte|intensa?|severe|persistent|agora|hoje|now|today))*(?:\\s+(?:e|and|com|with))?$`,
  );
  const denial =
    /(^|\s)(nao|sem|nem|no|not|without|don t|didn t|haven t)(?:\s+(?:have|had|a|any|am|m|estou|tenho|sinto|to|com|sentindo|tendo|nenhum|nenhuma|mais|very|high|much|ainda)){0,6}$/;
  const currentSubjectBeforeTerm =
    /(^|\s)(?:(?:eu\s+)?(?:estou|to|tou|tenho|sinto|ando|continuo|sigo|apresento)(?:\s+(?:com|sentindo|tendo|apresentando|ainda|agora|hoje|muita?|forte|intensa?|persistentes?|episodios|de)){0,6}|i\s+(?:am|m|have|feel|keep|have been|am having|ve been|ve got)(?:\s+(?:a|the|very|still|currently|having|experiencing|feeling|persistent|severe|high)){0,5})$/;
  for (const raw of clauses) {
    const clause = normalize(raw, true);
    if (!clause) continue;
    for (const term of terms) {
      const normalizedTerm = normalize(term);
      const matches = new RegExp(
        `(^|\\s)${escapeRegex(normalizedTerm)}(?=\\s|$)`,
        "g",
      );
      let match: RegExpExecArray | null;
      while ((match = matches.exec(clause))) {
        const before = normalize(clause.slice(0, match.index));
        const rawAfter = clause.slice(match.index + match[0].length);
        const after = normalize(rawAfter);
        // A postfix denial belongs to this item only until the next comma:
        // "febre não, vômitos sim" differs from "febre, não vômitos".
        const deniedAfter = /^(?:nao|no|not)(?:\s|$)/.test(normalize(rawAfter.split(",")[0]));
        const hypothetical = hypotheticalPrefix.test(before);
        const educational =
          /(^|\s)(duvida sobre|medo de|pergunta sobre|question about|afraid of|learn about)(\s|$)/.test(
            before,
          );
        const historical =
          /(^|\s)(ontem|antigamente|tive|tinha|estava|estive|semana passada|mes passado|ano passado|yesterday|last week|last month|previously|used to|i had|i was)(\s|$)/.test(
            before,
          );
        const thirdParty =
          /(^|\s)(minha (mae|irma|filha|amiga|esposa|avo|vizinha)|meu (pai|irmao|filho|amigo|marido|avo|vizinho)|ela|ele|my (mother|father|child|daughter|son|wife|husband|friend)|she|he|they|someone|another patient)(\s|$)/.test(
            before,
          );
        if (
          hypothetical ||
          educational ||
          historical ||
          thirdParty ||
          denial.test(before) ||
          deniedAfter
        )
          continue;
        let assertionPrefix = before;
        let previous: string;
        do {
          previous = assertionPrefix;
          assertionPrefix = assertionPrefix.replace(listTail, "").trim();
        } while (previous !== assertionPrefix);
        if (denial.test(assertionPrefix)) continue;
        const current = currentSubjectBeforeTerm.test(assertionPrefix);
        const inherentFirstPerson =
          /^(?:nao (?:consigo|paro|aguento)|can t)/.test(normalizedTerm) &&
          /^(?:(?:agora|hoje|atualmente|now|today|currently)\s*)?(?:eu|i)?$/.test(before);
        const bareCurrent =
          !raw.includes("?") &&
          /^(?:muita?|forte|intensa?|persistentes?|alta)?$/.test(before) &&
          /^(?:(?:alta|forte|intensa?|persistentes?|agora|hoje|now|today|e|and|com|with|vomitos|vomitando|fever|vomiting)\s*)*$/.test(
            after,
          );
        if (current || inherentFirstPerson || bareCurrent) return term;
      }
    }
  }
  return undefined;
}
