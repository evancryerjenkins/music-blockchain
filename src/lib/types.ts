export interface MusicNode {
  id: string;
  parent_id: string | null;
  song_title: string;
  artist: string;
  genre: string | null;
  year: number | null;
  album_art: string | null;
  itunes_url: string | null;
  preview_url: string | null;
  depth: number;
  added_by: string | null;
  session_token: string | null;
  user_id: string | null;
  created_at: string;
  spotify_uri: string | null;
}

export interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  primaryGenreName: string;
  releaseDate: string;
  artworkUrl100: string;
  trackViewUrl: string;
  previewUrl: string | null;
}

export interface SimilarityReason {
  kind: 'word' | 'artist' | 'genre' | 'year' | 'cross';
  value: string;
  label: string;
}

export interface SimilarityResult {
  matches: boolean;
  reasons: SimilarityReason[];
}
