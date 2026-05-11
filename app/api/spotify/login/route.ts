import { NextResponse } from "next/server";
import { createCodeChallenge, createCodeVerifier, parseSpotifyPlaylistId } from "@/lib/spotify";

const SPOTIFY_SCOPES = ["playlist-read-private", "playlist-read-collaborative"];

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const requestUrl = new URL(request.url);
  const origin = getOrigin(request, requestUrl);
  const playlistUrl = requestUrl.searchParams.get("playlistUrl")?.trim() ?? "";

  if (!clientId) {
    return NextResponse.redirect(
      new URL("/?spotifyError=missing_client_id", origin),
    );
  }

  if (!parseSpotifyPlaylistId(playlistUrl)) {
    return NextResponse.redirect(
      new URL("/?spotifyError=invalid_playlist_url", origin),
    );
  }

  const state = crypto.randomUUID();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const redirectUri = `${origin}/api/spotify/callback`;

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 10 * 60,
  };

  response.cookies.set("spotify_auth_state", state, cookieOptions);
  response.cookies.set("spotify_code_verifier", codeVerifier, cookieOptions);
  response.cookies.set("spotify_playlist_url", playlistUrl, cookieOptions);

  return response;
}

function getOrigin(request: Request, requestUrl: URL): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  const host = request.headers.get("host") ?? requestUrl.host;
  return `${requestUrl.protocol}//${host}`;
}
