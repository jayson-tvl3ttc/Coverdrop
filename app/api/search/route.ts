import { NextResponse } from "next/server";
import { searchITunesAlbums } from "@/lib/itunes";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      artist?: string;
      album?: string;
    };

    const artist = body.artist?.trim();
    const album = body.album?.trim();

    if (!artist || !album) {
      return NextResponse.json(
        { error: "artist and album are required" },
        { status: 400 },
      );
    }

    const candidates = await searchITunesAlbums(artist, album);
    return NextResponse.json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
