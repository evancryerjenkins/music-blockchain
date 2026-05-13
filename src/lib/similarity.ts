import { MusicNode, SimilarityResult } from './types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'be', 'as', 'my', 'me',
  'i', 'it', 'its', 'you', 'we', 'he', 'she', 'they', 'not', 'no', 'so',
]);

function getSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function hasWordOverlap(text1: string, text2: string): boolean {
  const words1 = new Set(getSignificantWords(text1));
  return getSignificantWords(text2).some(w => words1.has(w));
}

export function checkSimilarity(
  parent: MusicNode,
  candidateTitle: string,
  candidateArtist: string,
  candidateGenre: string | null,
  candidateYear: number | null
): SimilarityResult {
  const reasons: string[] = [];

  if (hasWordOverlap(parent.song_title, candidateTitle)) {
    reasons.push(`Shares a word in the title`);
  }

  if (hasWordOverlap(parent.artist, candidateArtist)) {
    reasons.push(`Same or related artist`);
  }

  if (parent.genre && candidateGenre) {
    const g1 = parent.genre.toLowerCase();
    const g2 = candidateGenre.toLowerCase();
    if (g1 === g2 || g1.includes(g2) || g2.includes(g1)) {
      reasons.push(`Same genre: ${candidateGenre}`);
    }
  }

  if (parent.year && candidateYear && parent.year === candidateYear) {
    reasons.push(`Released in the same year (${candidateYear})`);
  }

  return { matches: reasons.length > 0, reasons };
}
