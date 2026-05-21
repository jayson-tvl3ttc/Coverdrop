"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { parseAlbumCsv, parseAlbumTextImport } from "@/lib/csv";
import type { AlbumInputRow, AlbumWorkRow, SearchCandidate } from "@/lib/types";

type SearchApiResponse = {
  candidates?: SearchCandidate[];
  error?: string;
};

type DownloadApiResponse = {
  fileName?: string;
  savedPath?: string;
  error?: string;
};

type SpotifyImportApiResponse = {
  rows?: Array<{
    artist: string;
    album: string;
    spotifyAlbumUrl?: string;
    spotifyImageUrl?: string;
  }>;
  totalTracks?: number;
  uniqueAlbums?: number;
  loginUrl?: string;
  error?: string;
};

export default function Home() {
  const [rows, setRows] = useState<AlbumWorkRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [textImportValue, setTextImportValue] = useState("");
  const [textImportStats, setTextImportStats] = useState<{
    success: number;
  } | null>(null);
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState("");
  const [spotifyMessage, setSpotifyMessage] = useState<string | null>(null);
  const [spotifyStats, setSpotifyStats] = useState<{
    totalTracks: number;
    uniqueAlbums: number;
  } | null>(null);
  const [isImportingSpotify, setIsImportingSpotify] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const confirmedCount = useMemo(
    () => rows.filter((row) => row.confirmed && row.status === "found").length,
    [rows],
  );
  const foundCount = useMemo(
    () => rows.filter((row) => row.status === "found").length,
    [rows],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedPlaylistUrl = params.get("spotifyPlaylistUrl");
    const spotifyStatus = params.get("spotify");
    const spotifyError = params.get("spotifyError");

    if (returnedPlaylistUrl) {
      setSpotifyPlaylistUrl(returnedPlaylistUrl);
    }

    if (spotifyStatus === "connected") {
      setSpotifyMessage("Spotify connected. Click Import Playlist to load albums.");
    }

    if (spotifyError) {
      const messages: Record<string, string> = {
        missing_client_id: "Set SPOTIFY_CLIENT_ID in .env.local before using Spotify import.",
        invalid_playlist_url: "Invalid Spotify playlist URL.",
        auth_failed: "Spotify authorization failed.",
        token_failed: "Spotify token exchange failed.",
      };
      setSpotifyMessage(messages[spotifyError] ?? "Spotify import failed.");
    }
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseAlbumCsv(text);
    setCsvErrors(parsed.errors);
    setTextImportStats(null);
    await importRowsAndSearch(toWorkRows(parsed.rows));
  }

  async function handleTextImport() {
    const parsed = parseAlbumTextImport(textImportValue);
    setCsvErrors([]);
    setTextImportStats({
      success: parsed.rows.length,
    });
    await importRowsAndSearch(toWorkRows(parsed.rows));
  }

  async function importRowsAndSearch(nextRows: AlbumWorkRow[]) {
    setRows(nextRows);
    await searchRows(nextRows);
  }

  async function handleSpotifyImport() {
    const playlistUrl = spotifyPlaylistUrl.trim();
    if (!playlistUrl || isImportingSpotify) return;

    setIsImportingSpotify(true);
    setSpotifyMessage("Importing Spotify playlist...");
    setSpotifyStats(null);

    try {
      const response = await fetch(
        `/api/spotify/playlist?playlistUrl=${encodeURIComponent(playlistUrl)}`,
      );
      const data = (await response.json()) as SpotifyImportApiResponse;

      if (response.status === 401 && data.loginUrl) {
        window.location.href = data.loginUrl;
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Spotify import failed");
      }

      const importedRows: AlbumInputRow[] = (data.rows ?? []).map((row) => ({
        id: crypto.randomUUID(),
        artist: row.artist.trim(),
        album: row.album.trim(),
        rawInput: `${row.artist} - ${row.album}`,
        spotifyAlbumUrl: row.spotifyAlbumUrl,
        spotifyImageUrl: row.spotifyImageUrl,
      }));

      setCsvErrors([]);
      setTextImportStats(null);
      await importRowsAndSearch(toWorkRows(importedRows));
      setSpotifyStats({
        totalTracks: data.totalTracks ?? 0,
        uniqueAlbums: data.uniqueAlbums ?? importedRows.length,
      });
      setSpotifyMessage(
        `Imported ${data.uniqueAlbums ?? importedRows.length} unique albums and started cover search.`,
      );
    } catch (error) {
      setSpotifyMessage(error instanceof Error ? error.message : "Spotify import failed");
    } finally {
      setIsImportingSpotify(false);
    }
  }

  async function searchRows(nextRows: AlbumWorkRow[]) {
    const targets = nextRows.filter((row) => row.status !== "invalid");
    if (targets.length === 0 || isSearching) return;

    setIsSearching(true);
    for (const row of targets) {
      await searchOne(row);
    }
    setIsSearching(false);
  }

  async function searchOne(row: AlbumWorkRow) {
    if (row.status === "invalid") return;

    updateRow(row.id, { status: "searching", message: undefined });

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          row.query
            ? { query: row.query }
            : { artist: row.artist, album: row.album },
        ),
      });
      const data = (await response.json()) as SearchApiResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed");
      }

      const candidates = data.candidates ?? [];
      updateRow(row.id, {
        candidates,
        selectedIndex: 0,
        confirmed: false,
        status: candidates.length > 0 ? "found" : "not-found",
        message: candidates.length > 0 ? undefined : "Not Found",
      });
    } catch (error) {
      updateRow(row.id, {
        status: "error",
        message: error instanceof Error ? error.message : "Search failed",
      });
    }
  }

  async function downloadConfirmed() {
    if (confirmedCount === 0 || isDownloading) return;

    setIsDownloading(true);
    const targets = rows.filter((row) => row.confirmed && row.status === "found");
    for (const row of targets) {
      await downloadOne(row.id);
    }
    setIsDownloading(false);
  }

  async function downloadOne(rowId: string) {
    const row = rowsRef(rowId);
    const candidate = row?.candidates[row.selectedIndex];
    if (!row || !candidate) return;

    updateRow(rowId, { status: "downloading", message: undefined });

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: candidate.artistName || row.artist,
          album: candidate.collectionName || row.album || row.rawInput,
          artworkUrl: candidate.artworkUrl,
        }),
      });
      const data = (await response.json()) as DownloadApiResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Download failed");
      }

      updateRow(rowId, {
        status: "downloaded",
        savedPath: data.savedPath,
        message: data.fileName ? `Saved: ${data.fileName}` : "Saved",
      });
    } catch (error) {
      updateRow(rowId, {
        status: "error",
        message: error instanceof Error ? error.message : "Download failed",
      });
    }
  }

  function updateRow(rowId: string, patch: Partial<AlbumWorkRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function confirmAllFound() {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.status === "found" ? { ...row, confirmed: true } : row,
      ),
    );
  }

  function rowsRef(rowId: string) {
    return rows.find((row) => row.id === rowId);
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <header className="border-b border-stone-300 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">
              Coverdrop - Album Cover Batch Downloader
            </h1>
            <p className="mt-1 text-sm text-stone-600">A local Next.js tool for batch searching and downloading album covers</p>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(340px,1fr)_minmax(320px,1fr)]">
          <div className="rounded-md border border-stone-300 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-ink">CSV Import</div>
            <p className="mt-1 text-xs text-stone-500">Header fields: artist, album</p>
            <label className="mt-4 inline-flex cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-moss">
              Upload CSV
              <input
                accept=".csv,text/csv"
                className="sr-only"
                disabled={isSearching}
                type="file"
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div className="rounded-md border border-stone-300 bg-white p-4 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-ink">Text Import</div>
                <p className="mt-1 text-xs text-stone-500">One free-text album query per line</p>
              </div>
              {textImportStats ? (
                <div className="text-xs font-medium text-stone-600">
                  Parsed {textImportStats.success}
                </div>
              ) : null}
            </div>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-moss"
              onChange={(event) => setTextImportValue(event.target.value)}
              placeholder={"Radiohead OK Computer\nRadiohead - In Rainbows\nDaft Punk Discovery"}
              value={textImportValue}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-500">Empty lines are ignored.</span>
              <button
                className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={!textImportValue.trim() || isSearching}
                onClick={handleTextImport}
                type="button"
              >
                {isSearching ? "Searching..." : "Import"}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-stone-300 bg-white p-4 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-ink">Spotify Playlist Import</div>
                <p className="mt-1 text-xs text-stone-500">OAuth import, albums only</p>
              </div>
              {spotifyStats ? (
                <div className="text-xs font-medium text-stone-600">
                  Tracks {spotifyStats.totalTracks} / Albums {spotifyStats.uniqueAlbums}
                </div>
              ) : null}
            </div>
            <input
              className="mt-3 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-moss"
              onChange={(event) => setSpotifyPlaylistUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
              type="url"
              value={spotifyPlaylistUrl}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="truncate text-xs text-stone-500">
                Covers are rematched via iTunes.
              </span>
              <button
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={!spotifyPlaylistUrl.trim() || isImportingSpotify || isSearching}
                onClick={handleSpotifyImport}
                type="button"
              >
                {isImportingSpotify ? "Importing..." : isSearching ? "Searching..." : "Import"}
              </button>
            </div>
            {spotifyMessage ? (
              <div className="mt-3 rounded border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
                {spotifyMessage}
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col justify-between gap-3 rounded-md border border-stone-300 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center">
          <div className="text-sm text-stone-600">
            {rows.length} rows loaded / {foundCount} found / {confirmedCount} confirmed
            {isSearching ? " / searching..." : ""}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
              disabled={foundCount === 0}
              onClick={confirmAllFound}
              type="button"
            >
              Select All
            </button>
            <button
              className="rounded-md bg-clay px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={confirmedCount === 0 || isDownloading}
              onClick={downloadConfirmed}
              type="button"
            >
              {isDownloading ? "Downloading..." : `Download ${confirmedCount}`}
            </button>
          </div>
        </section>

        {csvErrors.length > 0 ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {csvErrors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </section>
        ) : null}

        <section className="overflow-x-auto rounded-md border border-stone-300 bg-white shadow-sm">
          <div className="grid min-w-[820px] grid-cols-[64px_minmax(180px,1.2fr)_minmax(220px,1.6fr)_130px_110px] items-center gap-4 border-b border-stone-200 bg-stone-100 px-4 py-3 text-xs font-semibold uppercase text-stone-600">
            <span>Cover</span>
            <span>Input</span>
            <span>Match</span>
            <span>Status</span>
            <span>Confirm</span>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-stone-500">
              Upload CSV, paste text, or import a Spotify playlist to begin.
            </div>
          ) : (
            rows.map((row) => <ResultRow key={row.id} row={row} updateRow={updateRow} />)
          )}
        </section>
      </div>
    </main>
  );
}

function toWorkRows(rows: AlbumInputRow[]): AlbumWorkRow[] {
  return rows.map((row) => ({
    ...row,
    status: "idle",
    candidates: [],
    selectedIndex: 0,
    confirmed: false,
  }));
}

function ResultRow({
  row,
  updateRow,
}: {
  row: AlbumWorkRow;
  updateRow: (rowId: string, patch: Partial<AlbumWorkRow>) => void;
}) {
  const selected = row.candidates[row.selectedIndex];

  return (
    <div className="grid min-w-[820px] grid-cols-[64px_minmax(180px,1.2fr)_minmax(220px,1.6fr)_130px_110px] items-center gap-4 border-b border-stone-200 px-4 py-3 last:border-b-0">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-stone-200 bg-stone-100">
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${selected.artistName} - ${selected.collectionName}`}
            className="h-full w-full object-cover"
            src={selected.artworkUrl}
          />
        ) : (
          <span className="text-xs text-stone-400">No art</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">
          {row.rawInput ?? row.album}
        </div>
        <div className="truncate text-sm text-stone-600">
          {row.rawInput ? "Free-text search" : row.artist}
        </div>
      </div>

      <div className="min-w-0">
        {row.candidates.length > 0 ? (
          <div className="flex flex-col gap-2">
            <select
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-moss"
              onChange={(event) =>
                updateRow(row.id, {
                  selectedIndex: Number(event.target.value),
                  confirmed: false,
                })
              }
              value={row.selectedIndex}
            >
              {row.candidates.map((candidate, index) => (
                <option key={candidate.collectionId} value={index}>
                  {candidate.artistName} - {candidate.collectionName}
                </option>
              ))}
            </select>
            <div className="truncate text-xs text-stone-500">
              {selected?.primaryGenreName ?? "Album"}
              {selected?.releaseDate ? ` / ${selected.releaseDate.slice(0, 4)}` : ""}
              {selected?.trackCount ? ` / ${selected.trackCount} tracks` : ""}
            </div>
          </div>
        ) : (
          <span className="text-sm text-stone-500">No match selected</span>
        )}
      </div>

      <div>
        <StatusBadge status={row.status} />
        {row.message ? <div className="mt-1 truncate text-xs text-stone-500">{row.message}</div> : null}
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input
          checked={row.confirmed}
          className="h-4 w-4 accent-moss"
          disabled={row.status !== "found"}
          onChange={(event) => updateRow(row.id, { confirmed: event.target.checked })}
          type="checkbox"
        />
        Confirm
      </label>
    </div>
  );
}

function StatusBadge({ status }: { status: AlbumWorkRow["status"] }) {
  const styles: Record<AlbumWorkRow["status"], string> = {
    idle: "bg-stone-100 text-stone-600",
    searching: "bg-blue-50 text-blue-700",
    found: "bg-emerald-50 text-emerald-700",
    "not-found": "bg-red-50 text-red-700",
    invalid: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
    downloading: "bg-blue-50 text-blue-700",
    downloaded: "bg-moss text-white",
  };

  const label: Record<AlbumWorkRow["status"], string> = {
    idle: "Idle",
    searching: "Searching",
    found: "Found",
    "not-found": "Not Found",
    invalid: "Invalid",
    error: "Error",
    downloading: "Downloading",
    downloaded: "Downloaded",
  };

  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${styles[status]}`}>
      {label[status]}
    </span>
  );
}
