import { normalizeTag, normalizeTags } from "./tagTaxonomy";

export const HEALTH_COMPLAINT_OPTIONS: string[] = [
  "Cansaço crônico",
  "Falta de energia",
  "Desânimo matinal",
  "Ansiedade",
  "Estresse elevado",
  "Irritabilidade",
  "Tristeza persistente",
  "Insônia",
  "Sono agitado",
  "Dificuldade para acordar",
  "Má digestão",
  "Inchaço abdominal",
  "Intestino preso",
  "Refluxo",
  "Dor na coluna",
  "Dor nos joelhos",
  "Tensão muscular",
  "Dor de cabeça frequente",
  "Dificuldade em perder peso",
  "Queda de cabelo",
  "Unhas fracas",
  "Inchaço nas pernas",
  "Falta de concentração",
  "Esquecimento",
  "Névoa mental",
];

export const NEURO_CONDITION_OPTIONS: string[] = [
  "TDAH",
  "Autismo (TEA)",
  "Dislexia",
  "Altas Habilidades/Superdotação",
  "Síndrome de Down",
  "Síndrome de Irlen",
  "Síndrome de Tourette",
  "Fibromialgia",
  "Diabetes",
  "Hipertensão",
  "Doenças Autoimunes",
  "Prefiro não informar",
  "Outras condições",
];

const COMPLAINT_TO_TAGS: Record<string, string[]> = {
  "Ansiedade": ["#saude_mental", "#ansiedade"],
  "Estresse elevado": ["#saude_mental", "#estresse"],
  "Irritabilidade": ["#saude_mental"],
  "Tristeza persistente": ["#saude_mental"],
  "Má digestão": ["#saude_digestiva"],
  "Refluxo": ["#saude_digestiva"],
  "Inchaço abdominal": ["#saude_digestiva"],
  "Intestino preso": ["#saude_digestiva"],
  "Dor na coluna": ["#musculoesqueletico", "#dor_cronica"],
  "Dor nos joelhos": ["#musculoesqueletico", "#dor_cronica"],
  "Tensão muscular": ["#musculoesqueletico"],
  "Dor de cabeça frequente": ["#dor_cronica"],
  "Cansaço crônico": ["#metabolismo", "#energia"],
  "Falta de energia": ["#metabolismo", "#energia"],
  "Desânimo matinal": ["#energia"],
  "Insônia": ["#higiene_do_sono", "#sono"],
  "Sono agitado": ["#higiene_do_sono", "#sono"],
  "Dificuldade para acordar": ["#higiene_do_sono", "#sono"],
  "Queda de cabelo": ["#nutricao_estetica"],
  "Unhas fracas": ["#nutricao_estetica"],
  "Dificuldade em perder peso": ["#metabolismo", "#controle_peso"],
  "Falta de concentração": ["#foco", "#cognicao"],
  "Esquecimento": ["#foco", "#cognicao"],
  "Névoa mental": ["#foco", "#cognicao"],
};

const CONDITION_TO_TAGS: Record<string, string[]> = {
  "TDAH": ["#tdah", "#neurodivergencia"],
  "Autismo (TEA)": ["#autismo", "#neurodivergencia"],
  "Dislexia": ["#dislexia", "#neurodivergencia"],
  "Altas Habilidades/Superdotação": ["#superdotacao", "#neurodivergencia"],
  "Síndrome de Down": ["#down", "#sindrome"],
  "Síndrome de Irlen": ["#irlen", "#sindrome"],
  "Síndrome de Tourette": ["#tourette", "#sindrome"],
  "Fibromialgia": ["#fibromialgia", "#dor_cronica"],
  "Diabetes": ["#diabetes", "#metabolismo"],
  "Hipertensão": ["#hipertensao", "#saude_cardiovascular"],
  "Doenças Autoimunes": ["#autoimune"],
};

const TAG_TO_SPECIALTIES: Record<string, string[]> = {
  "#saude_mental": ["Psicólogo", "Psiquiatra"],
  "#saude_digestiva": ["Nutricionista", "Gastroenterologista"],
  "#musculoesqueletico": ["Fisioterapeuta", "Ortopedista"],
  "#metabolismo": ["Endocrinologista", "Nutricionista"],
  "#higiene_do_sono": ["Especialista em Sono", "Psicólogo"],
  "#nutricao_estetica": ["Nutricionista", "Dermatologista"],
  "#tdah": ["Neuropediatra", "Psiquiatra", "Psicólogo TCC"],
  "#autismo": ["Terapeuta Ocupacional", "Psicólogo ABA", "Neurologista"],
  "#down": ["Fonoaudiólogo", "Fisioterapeuta", "Geneticista"],
  "#dislexia": ["Psicopedagogo", "Fonoaudiólogo"],
  "#fibromialgia": ["Reumatologista", "Fisioterapeuta"],
  "#diabetes": ["Endocrinologista", "Nutricionista Clínico"],
};

export const deriveSemanticTagsFromProfile = (params: {
  healthComplaints?: string[];
  neuroConditions?: string[];
  extraTags?: string[];
}) => {
  const tags = new Set<string>();
  const addTags = (list?: string[]) => {
    (list || []).forEach((t) => {
      const normalized = normalizeTag(t);
      if (normalized) tags.add(normalized);
    });
  };

  (params.healthComplaints || []).forEach((item) => addTags(COMPLAINT_TO_TAGS[item]));
  (params.neuroConditions || []).forEach((item) => addTags(CONDITION_TO_TAGS[item]));
  addTags(params.extraTags);

  const semanticTags = normalizeTags(Array.from(tags));
  const specialties = new Set<string>();
  semanticTags.forEach((tag) => {
    (TAG_TO_SPECIALTIES[tag] || []).forEach((s) => specialties.add(s));
  });

  return {
    semanticTags,
    recommendedProfessionalSpecialties: Array.from(specialties),
  };
};
