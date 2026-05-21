# Coverdrop - Album Cover Batch Downloader

A local Next.js tool for searching album covers in bulk, reviewing matches, and downloading selected artwork to disk.

Coverdrop is designed for local use only. It does not require login, a database, deployment, or any hosted storage, except when you choose to import a Spotify playlist via Spotify OAuth.

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## What it does

- Use Text Search as the primary workflow.
- Import albums from CSV files as a secondary method.
- Import albums from Spotify playlists via Spotify Web API OAuth as a secondary method.
- Convert CSV and Spotify imports into an `artist + album` list.
- Treat every non-empty text import line as a free-text album search query.
- Automatically search for cover matches after text search or import.
- Show the original input, cover image, album name, artist name, release date, and match status.
- Mark searches with no usable album results as `Not Found`.
- Manually choose the best match when multiple album results are returned.
- Select all found matches with `Select All Found`.
- Download with `Download Selected` or `Download All Found`.

Cover downloads are matched through the existing cover search flow, currently using the iTunes Search API. Spotify import only reads playlist and album metadata. It does not download Spotify audio content.

## Text Search

Paste one album search query per line. Empty lines are ignored.

Examples:

```text
Radiohead OK Computer
Radiohead - OK Computer
Daft Punk Discovery
```

Text import does not require `artist + album` formatting or delimiters. Each line is sent to the search API as a full query, with light normalization for common separators. `Not Found` is only shown when the search API returns zero usable album results.

Text Search is the default focus when the page opens.

## Other import methods

CSV and Spotify imports are available under `Other import methods` in the UI.

### CSV import

The first row must include `artist` and `album`:

```csv
artist,album
Radiohead,In Rainbows
Daft Punk,Discovery
```

After upload, Coverdrop automatically starts searching for cover matches.

### Spotify playlist import

Create a Spotify app and add this redirect URI:

```text
http://127.0.0.1:3000/api/spotify/callback
```

Then create `.env.local`:

```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Spotify import reads:

- `track.album.name`
- `track.artists[0].name`
- `track.album.images`
- `track.album.external_urls.spotify`

Albums are deduped by `artist + album`, converted into the same import list, then searched automatically. If Spotify returns `403`, the app shows a message that the playlist is not owned by you or collaborative with you.

## Download output

Use `Download Selected` for manually selected matches, or `Download All Found` to download every row with a found album match.

Downloaded covers are saved to the local `covers` directory as:

```text
artist - album.jpg
```
