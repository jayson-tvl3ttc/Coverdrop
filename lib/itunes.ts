import type { SearchCandidate } from "./types";

type ITunesAlbumResult = {
  wrapperType?: string;
  collectionType?: string;
  artistName?: string;
  collectionName?: string;
  collectionId?: number;
  artworkUrl60?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
};

type ITunesSearchResponse = {
  resultCount: number;
  results: ITunesAlbumResult[];
};

export async function searchITunesAlbums(
  artist: string,
  album: string,
): Promise<SearchCandidate[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${artist} ${album}`);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "8");
  url.searchParams.set("country", "US");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`iTunes Search API returned ${response.status}`);
  }

  const data = (await response.json()) as ITunesSearchResponse;

  return data.results
    .filter((item) => item.collectionId && item.collectionName && item.artistName)
    .map((item) => ({
      collectionId: item.collectionId ?? 0,
      collectionName: item.collectionName ?? "",
      artistName: item.artistName ?? "",
      artworkUrl: upgradeArtworkUrl(item.artworkUrl100 ?? item.artworkUrl60 ?? ""),
      viewUrl: item.collectionViewUrl,
      releaseDate: item.releaseDate,
      primaryGenreName: item.primaryGenreName,
      trackCount: item.trackCount,
    }))
    .filter((candidate) => candidate.artworkUrl)
    .sort((left, right) => scoreCandidate(right, artist, album) - scoreCandidate(left, artist, album));
}

export function upgradeArtworkUrl(url: string): string {
  if (!url) {
    return "";
  }

  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, "/1000x1000bb.jpg");
}

function scoreCandidate(candidate: SearchCandidate, artist: string, album: string): number {
  const expectedArtist = normalize(artist);
  const expectedAlbum = normalize(album);
  const candidateArtist = normalize(candidate.artistName);
  const candidateAlbum = normalize(candidate.collectionName);
  let score = 0;

  if (candidateArtist === expectedArtist) score += 8;
  if (candidateAlbum === expectedAlbum) score += 10;
  if (candidateArtist.includes(expectedArtist) || expectedArtist.includes(candidateArtist)) score += 3;
  if (candidateAlbum.includes(expectedAlbum) || expectedAlbum.includes(candidateAlbum)) score += 4;

  return score;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
