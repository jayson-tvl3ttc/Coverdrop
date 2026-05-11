import { createHash, randomBytes } from "node:crypto";

export type SpotifyAlbumImportRow = {
  artist: string;
  album: string;
  spotifyAlbumUrl?: string;
  spotifyImageUrl?: string;
};

type SpotifyPlaylistItemsResponse = {
  items: SpotifyPlaylistItem[];
  next: string | null;
};

type SpotifyTrackObject = {
  type?: string;
  album?: {
    name?: string;
    images?: Array<{
      url: string;
      height: number | null;
      width: number | null;
    }>;
    external_urls?: {
      spotify?: string;
    };
  };
  artists?: Array<{
    name?: string;
  }>;
};

type SpotifyPlaylistItem = {
  item?: SpotifyTrackObject | null;
  track?: SpotifyTrackObject | null;
};

export function parseSpotifyPlaylistId(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  const uriMatch = value.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) {
    return uriMatch[1];
  }

  if (/^[A-Za-z0-9]{16,}$/.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex !== -1 && parts[playlistIndex + 1]) {
      return parts[playlistIndex + 1];
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchSpotifyPlaylistAlbums(
  playlistId: string,
  accessToken: string,
): Promise<{
  rows: SpotifyAlbumImportRow[];
  totalItems: number;
}> {
  const albums = new Map<string, SpotifyAlbumImportRow>();
  let totalItems = 0;
  let nextUrl: string | null = buildPlaylistItemsUrl(playlistId);

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (response.status === 403) {
      throw new SpotifyApiError(
        "This playlist is not owned by you or collaborative with you.",
        403,
      );
    }

    if (response.status === 401) {
      throw new SpotifyApiError("Spotify login expired. Please connect again.", 401);
    }

    if (!response.ok) {
      throw new SpotifyApiError(`Spotify API returned ${response.status}`, response.status);
    }

    const data = (await response.json()) as SpotifyPlaylistItemsResponse;
    totalItems += data.items.length;

    data.items.forEach((playlistItem) => {
      const track = getTrackFromPlaylistItem(playlistItem);
      const album = track?.album;
      const artist = track?.artists?.[0]?.name?.trim();
      const albumName = album?.name?.trim();

      if (!track || !artist || !album || !albumName) {
        return;
      }

      const key = normalizeAlbumKey(artist, albumName);
      if (albums.has(key)) {
        return;
      }

      albums.set(key, {
        artist,
        album: albumName,
        spotifyAlbumUrl: album.external_urls?.spotify,
        spotifyImageUrl: album.images?.[0]?.url,
      });
    });

    nextUrl = data.next;
  }

  return {
    rows: Array.from(albums.values()),
    totalItems,
  };
}

export function createCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function buildPlaylistItemsUrl(playlistId: string): string {
  const url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/items`);
  url.searchParams.set("limit", "50");
  url.searchParams.set(
    "fields",
    "items(track(type,album(name,images,external_urls),artists(name)),item(type,album(name,images,external_urls),artists(name))),next",
  );
  return url.toString();
}

function getTrackFromPlaylistItem(item: SpotifyPlaylistItem): SpotifyTrackObject | null {
  const track = item.track ?? item.item ?? null;
  if (!track || track.type === "episode") {
    return null;
  }

  return track;
}

function normalizeAlbumKey(artist: string, album: string): string {
  return `${normalize(artist)}::${normalize(album)}`;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class SpotifyApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
  }
}
