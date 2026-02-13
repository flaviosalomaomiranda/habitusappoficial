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
