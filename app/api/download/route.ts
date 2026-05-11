import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      artist?: string;
      album?: string;
      artworkUrl?: string;
    };

    const artist = body.artist?.trim();
    const album = body.album?.trim();
    const artworkUrl = body.artworkUrl?.trim();

    if (!artist || !album || !artworkUrl) {
      return NextResponse.json(
        { error: "artist, album and artworkUrl are required" },
        { status: 400 },
      );
    }

    const imageUrl = new URL(artworkUrl);
    if (imageUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Only HTTPS artwork URLs are supported" }, { status: 400 });
    }

    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Artwork download failed with ${response.status}` },
        { status: 502 },
      );
    }

    const outputDir = path.resolve(process.cwd(), "covers");
    await mkdir(outputDir, { recursive: true });

    const fileName = `${sanitizeFilePart(artist)} - ${sanitizeFilePart(album)}.jpg`;
    const targetPath = path.resolve(outputDir, fileName);

    if (!targetPath.startsWith(outputDir + path.sep)) {
      return NextResponse.json({ error: "Invalid output path" }, { status: 400 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(targetPath, buffer);

    return NextResponse.json({
      fileName,
      savedPath: targetPath,
      bytes: buffer.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown download error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeFilePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return sanitized || "Unknown";
}
