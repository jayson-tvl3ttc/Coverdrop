import { NextRequest, NextResponse } from "next/server";

type SpotifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const requestUrl = new URL(request.url);
  const origin = getOrigin(request, requestUrl);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const expectedState = request.cookies.get("spotify_auth_state")?.value;
  const codeVerifier = request.cookies.get("spotify_code_verifier")?.value;
  const playlistUrl = request.cookies.get("spotify_playlist_url")?.value;

  if (!clientId || !code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return NextResponse.redirect(new URL("/?spotifyError=auth_failed", origin));
  }

  const redirectUri = `${origin}/api/spotify/callback`;
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  const tokenData = (await tokenResponse.json()) as SpotifyTokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.redirect(new URL("/?spotifyError=token_failed", origin));
  }

  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("spotify", "connected");
  if (playlistUrl) {
    redirectUrl.searchParams.set("spotifyPlaylistUrl", playlistUrl);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("spotify_access_token", tokenData.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: Math.max(60, (tokenData.expires_in ?? 3600) - 60),
  });
  response.cookies.set("spotify_auth_state", "", { path: "/", maxAge: 0 });
  response.cookies.set("spotify_code_verifier", "", { path: "/", maxAge: 0 });
  response.cookies.set("spotify_playlist_url", "", { path: "/", maxAge: 0 });

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
