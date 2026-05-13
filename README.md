# Coverdrop - Album Cover Batch Downloader

A local Next.js tool for importing album lists, automatically matching cover art, confirming results in bulk, and downloading covers to disk.

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

- Import albums from CSV files.
- Import albums from pasted plain text.
- Import albums from Spotify playlists via Spotify Web API OAuth.
- Convert imports into an `artist + album` list.
- Automatically search for cover matches after import.
- Show album name, artist name, match status, and cover preview.
- Mark missing matches as `Not Found`.
- Mark unparseable text rows as `Invalid`.
- Select all found matches for batch confirmation.
- Download confirmed covers to the local `covers` directory.

Cover downloads are matched through the existing cover search flow, currently using the iTunes Search API. Spotify import only reads playlist and album metadata. It does not download Spotify audio content.

## CSV import

The first row must include `artist` and `album`:

```csv
artist,album
Radiohead,In Rainbows
Daft Punk,Discovery
```

After upload, Coverdrop automatically starts searching for cover matches.

## Text import

Paste one album per line. Empty lines are ignored.

Supported formats:

```text
artist - album
artist, album
artist / album
artist | album
```

Rows that cannot be parsed are kept in the results table and marked as `Invalid`.

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

Spotify import reads:

- `track.album.name`
- `track.artists[0].name`
- `track.album.images`
- `track.album.external_urls.spotify`

Albums are deduped by `artist + album`, converted into the same import list, then searched automatically. If Spotify returns `403`, the app shows a message that the playlist is not owned by you or collaborative with you.

## Download output

Downloaded covers are saved to the local `covers` directory as:

```text
artist - album.jpg
```
