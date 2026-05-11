# Album Cover Batch Downloader

A local Next.js tool for batch searching and downloading album covers from the iTunes Search API.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Spotify playlist import

Create a Spotify app and add this redirect URI:

```text
http://127.0.0.1:3000/api/spotify/callback
```

Then create `.env.local`:

```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Spotify playlist import only reads playlist metadata and album artwork metadata. It does not download Spotify audio content. Album cover downloads still use the existing rematch flow.

## CSV format

The first row must include:

```csv
artist,album
Radiohead,In Rainbows
Daft Punk,Discovery
```

Downloaded covers are saved to the local `covers` directory as:

```text
artist - album.jpg
```
