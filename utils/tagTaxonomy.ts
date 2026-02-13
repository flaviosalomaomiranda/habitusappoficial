import { inferSemanticTags } from "./semanticTags";

export const DEFAULT_OFFICIAL_TAGS: string[] = [
  "#fitness",
  "#saude",
  "#cardio",
  "#lazer",
  "#entretenimento",
  "#cinema",
  "#alimentacao",
  "#sono",
  "#educacao",
  "#organizacao",
];

export const normalizeTag = (tag: string): string => {
  const clean = (tag || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!clean) return "";
  return clean.startsWith("#") ? clean : `#${clean}`;
};

export const normalizeTags = (tags?: string[]): string[] =>
  Array.from(new Set((tags || []).map(normalizeTag).filter(Boolean)));

export const inferAndNormalizeTags = (...inputs: Array<string | undefined | null>): string[] =>
  normalizeTags(inferSemanticTags(...inputs));

export const canonicalizeTag = (tag: string, synonyms?: Record<string, string>): string => {
  const normalized = normalizeTag(tag);
  if (!normalized) return "";
  const mapped = synonyms?.[normalized];
  return mapped ? normalizeTag(mapped) : normalized;
};

export const canonicalizeTags = (tags: string[] | undefined, synonyms?: Record<string, string>): string[] =>
  Array.from(new Set((tags || []).map((tag) => canonicalizeTag(tag, synonyms)).filter(Boolean)));

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "para", "por", "com", "sem",
  "a", "o", "as", "os", "um", "uma", "ao", "aos", "que", "se", "mais", "menos", "muito", "pouco",
]);

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const extractFreeTextTags = (text?: string, limit = 4): string[] => {
  if (!text) return [];
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const words = normalized
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const out: string[] = [];
  for (let i = 0; i < words.length && out.length < limit; i += 1) {
    out.push(normalizeTag(words[i]));
    if (i < words.length - 1 && out.length < limit) {
      const bi = `${words[i]}_${words[i + 1]}`;
      if (bi.length <= 30 && !STOPWORDS.has(words[i + 1])) out.push(normalizeTag(bi));
    }
  }
  return normalizeTags(out).slice(0, limit);
};
