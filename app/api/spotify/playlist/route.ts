import { NextRequest, NextResponse } from "next/server";
import {
  fetchSpotifyPlaylistAlbums,
  parseSpotifyPlaylistId,
  SpotifyApiError,
} from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = getOrigin(request, requestUrl);
  const playlistUrl = requestUrl.searchParams.get("playlistUrl")?.trim() ?? "";
  const playlistId = parseSpotifyPlaylistId(playlistUrl);
  const accessToken = request.cookies.get("spotify_access_token")?.value;

  if (!playlistId) {
    return NextResponse.json({ error: "Invalid Spotify playlist URL." }, { status: 400 });
  }

  if (!accessToken) {
    const loginUrl = new URL("/api/spotify/login", origin);
    loginUrl.searchParams.set("playlistUrl", playlistUrl);
    return NextResponse.json(
      {
        error: "Spotify login required.",
        loginUrl: loginUrl.toString(),
      },
      { status: 401 },
    );
  }

  try {
    const result = await fetchSpotifyPlaylistAlbums(playlistId, accessToken);
    return NextResponse.json({
      rows: result.rows,
      totalTracks: result.totalItems,
      uniqueAlbums: result.rows.length,
    });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      const loginUrl = new URL("/api/spotify/login", origin);
      loginUrl.searchParams.set("playlistUrl", playlistUrl);
      return NextResponse.json(
        {
          error: error.message,
          loginUrl: error.status === 401 ? loginUrl.toString() : undefined,
        },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown Spotify import error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getOrigin(request: Request, requestUrl: URL): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  const host = request.headers.get("host") ?? requestUrl.host;
  return `${requestUrl.protocol}//${host}`;
}
