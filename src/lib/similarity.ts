import { SimilarityResult, SimilarityReason } from './types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'be', 'as', 'my', 'me',
  'i', 'it', 'its', 'you', 'we', 'he', 'she', 'they', 'not', 'no', 'so',
]);

function getSignificantWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function wordOverlap(t1: string, t2: string): string | null {
  const s = new Set(getSignificantWords(t1));
  return getSignificantWords(t2).find(w => s.has(w)) ?? null;
}

export function checkSimilarity(
  parentTitle: string,
  parentArtist: string,
  parentGenre: string | null,
  parentYear: number | null,
  candidateTitle: string,
  candidateArtist: string,
  candidateGenre: string | null,
  candidateYear: number | null,
): SimilarityResult {
  const reasons: SimilarityReason[] = [];

  const sharedTitle = wordOverlap(parentTitle, candidateTitle);
  if (sharedTitle)
    reasons.push({ kind: 'word', value: sharedTitle, label: `Shares the word "${sharedTitle}" in title` });

  const sharedArtist = wordOverlap(parentArtist, candidateArtist);
  if (sharedArtist)
    reasons.push({ kind: 'artist', value: sharedArtist, label: `Same or related artist ("${sharedArtist}")` });

  if (parentGenre && candidateGenre) {
    const g1 = parentGenre.toLowerCase();
    const g2 = candidateGenre.toLowerCase();
    if (g1 === g2 || g1.includes(g2) || g2.includes(g1))
      reasons.push({ kind: 'genre', value: candidateGenre, label: `Same genre (${candidateGenre})` });
  }

  if (parentYear && candidateYear && parentYear === candidateYear)
    reasons.push({ kind: 'year', value: String(candidateYear), label: `Released the same year (${candidateYear})` });

  return { matches: reasons.length > 0, reasons };
}
