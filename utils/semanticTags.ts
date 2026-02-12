const TAG_RULES: Array<{ tag: string; terms: string[] }> = [
  { tag: "#fitness", terms: ["correr", "corrida", "academia", "musculacao", "treino", "exercicio", "natação", "natacao", "bike"] },
  { tag: "#saude", terms: ["saude", "medico", "consulta", "higiene", "dente", "dentista", "fio dental", "alimentacao"] },
  { tag: "#cardio", terms: ["correr", "corrida", "cardio", "esteira", "bike", "natação", "natacao"] },
  { tag: "#lazer", terms: ["lazer", "brincar", "passeio", "cinema", "jogo", "tv"] },
  { tag: "#entretenimento", terms: ["cinema", "filme", "series", "jogo", "streaming", "parque"] },
  { tag: "#cinema", terms: ["cinema", "filme", "pipoca"] },
  { tag: "#alimentacao", terms: ["comida", "alimentacao", "refeicao", "lanche", "nutricao"] },
  { tag: "#sono", terms: ["sono", "dormir", "cama", "descanso"] },
  { tag: "#educacao", terms: ["estudo", "escola", "lição", "licao", "leitura", "livro"] },
  { tag: "#organizacao", terms: ["arrumar", "organizar", "quarto", "casa", "guardar"] },
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const inferSemanticTags = (...inputs: Array<string | undefined | null>): string[] => {
  const joined = normalize(inputs.filter(Boolean).join(" "));
  const out = new Set<string>();
  TAG_RULES.forEach((rule) => {
    if (rule.terms.some((term) => joined.includes(normalize(term)))) {
      out.add(rule.tag);
    }
  });
  return Array.from(out);
};

export const bumpTagScores = (
  current: Record<string, number> | undefined,
  tags: string[] | undefined,
  amount = 1
): Record<string, number> => {
  const next = { ...(current || {}) };
  (tags || []).forEach((tag) => {
    next[tag] = Math.max(0, (next[tag] || 0) + amount);
  });
  return next;
};
