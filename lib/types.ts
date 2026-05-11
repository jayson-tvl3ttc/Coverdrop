export type AlbumInputRow = {
  id: string;
  artist: string;
  album: string;
  sourceLine?: number;
  rawInput?: string;
  spotifyAlbumUrl?: string;
  spotifyImageUrl?: string;
};

export type SearchCandidate = {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl: string;
  viewUrl?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
};

export type RowStatus =
  | "idle"
  | "searching"
  | "found"
  | "not-found"
  | "invalid"
  | "error"
  | "downloading"
  | "downloaded";

export type AlbumWorkRow = AlbumInputRow & {
  status: RowStatus;
  candidates: SearchCandidate[];
  selectedIndex: number;
  confirmed: boolean;
  message?: string;
  savedPath?: string;
};
