# Album Cover Batch Downloader

A local Next.js tool for batch searching and downloading album covers from the iTunes Search API.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
