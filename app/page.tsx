"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
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

    textAreaRef.current?.focus();
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

  function handleClearTextSearch() {
    setTextImportValue("");
    setTextImportStats(null);
    setCsvErrors([]);
    setRows([]);
    textAreaRef.current?.focus();
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

  async function downloadAllFound() {
    if (foundCount === 0 || isDownloading) return;

    setIsDownloading(true);
    const targets = rows.filter((row) => row.status === "found");
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
    <main className="min-h-screen bg-white text-neutral-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 sm:px-8 lg:py-12">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Coverdrop</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-neutral-950 sm:text-4xl">
              Album cover search
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
              Search and download album covers in bulk.
            </p>
          </div>
          <div className="text-sm text-neutral-500">
            {rows.length} rows / {foundCount} found / {confirmedCount} selected
            {isSearching ? " / searching" : ""}
          </div>
        </header>

        <section className="border-b border-neutral-200 pb-10">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Text Search</h2>
              <p className="mt-1 text-sm text-neutral-500">Paste one album search per line.</p>
            </div>
            {textImportStats ? (
              <div className="text-sm text-neutral-500">{textImportStats.success} queries imported</div>
            ) : null}
          </div>

          <textarea
            ref={textAreaRef}
            className="min-h-64 w-full resize-y rounded-none border border-neutral-300 bg-white px-5 py-4 text-base leading-7 text-neutral-950 outline-none transition focus:border-neutral-950"
            onChange={(event) => setTextImportValue(event.target.value)}
            placeholder={"Radiohead OK Computer\nOasis\nMy Bloody Valentine Loveless"}
            value={textImportValue}
          />

          <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-neutral-500">Free text is sent as a search query. Empty lines are ignored.</p>
            <div className="flex flex-wrap gap-3">
              <button
                className="border border-neutral-950 bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
                disabled={!textImportValue.trim() || isSearching}
                onClick={handleTextImport}
                type="button"
              >
                {isSearching ? "Searching..." : "Search Covers"}
              </button>
              <button
                className="border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:text-neutral-400"
                disabled={!textImportValue && rows.length === 0}
                onClick={handleClearTextSearch}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <details className="group border-b border-neutral-200 pb-8">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-neutral-950">
            <span>Other import methods</span>
            <span className="text-neutral-400 transition group-open:rotate-45">+</span>
          </summary>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="border border-neutral-200 p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-950">CSV Import</h3>
                  <p className="mt-1 text-sm text-neutral-500">Header fields: artist, album</p>
                </div>
                <label className="inline-flex cursor-pointer border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:border-neutral-950">
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
              {csvErrors.length > 0 ? (
                <div className="mt-4 border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  {csvErrors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="border border-neutral-200 p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-950">Spotify Import</h3>
                  <p className="mt-1 text-sm text-neutral-500">OAuth playlist metadata import</p>
                </div>
                {spotifyStats ? (
                  <div className="text-sm text-neutral-500">
                    {spotifyStats.totalTracks} tracks / {spotifyStats.uniqueAlbums} albums
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  className="min-w-0 flex-1 border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
                  onChange={(event) => setSpotifyPlaylistUrl(event.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  type="url"
                  value={spotifyPlaylistUrl}
                />
                <button
                  className="border border-neutral-950 bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
                  disabled={!spotifyPlaylistUrl.trim() || isImportingSpotify || isSearching}
                  onClick={handleSpotifyImport}
                  type="button"
                >
                  {isImportingSpotify ? "Importing..." : isSearching ? "Searching..." : "Import"}
                </button>
              </div>
              {spotifyMessage ? (
                <div className="mt-4 border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  {spotifyMessage}
                </div>
              ) : null}
            </section>
          </div>
        </details>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Results</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose the best match for each query before downloading.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:text-neutral-400"
                disabled={foundCount === 0}
                onClick={confirmAllFound}
                type="button"
              >
                Select All Found
              </button>
              <button
                className="border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:text-neutral-400"
                disabled={foundCount === 0 || isDownloading}
                onClick={downloadAllFound}
                type="button"
              >
                {isDownloading ? "Downloading..." : "Download All Found"}
              </button>
              <button
                className="border border-neutral-950 bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
                disabled={confirmedCount === 0 || isDownloading}
                onClick={downloadConfirmed}
                type="button"
              >
                {isDownloading ? "Downloading..." : "Download Selected"}
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="border border-dashed border-neutral-300 px-5 py-14 text-center text-sm text-neutral-500">
              Start with Text Search above, or open Other import methods.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 border border-neutral-200">
              {rows.map((row) => (
                <ResultRow key={row.id} row={row} updateRow={updateRow} />
              ))}
            </div>
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
    <div className="grid gap-5 p-4 md:grid-cols-[minmax(160px,1fr)_88px_minmax(260px,1.6fr)_120px] md:items-center md:p-5">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">Input</div>
        <div className="mt-2 break-words text-sm font-medium leading-6 text-neutral-950">
          {row.rawInput ?? row.album}
        </div>
        <div className="mt-1 text-sm text-neutral-500">
          {row.rawInput ? "Free-text search" : row.artist}
        </div>
      </div>

      <div className="flex h-24 w-24 items-center justify-center border border-neutral-200 bg-neutral-50 md:h-20 md:w-20">
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${selected.artistName} - ${selected.collectionName}`}
            className="h-full w-full object-cover"
            src={selected.artworkUrl}
          />
        ) : (
          <span className="text-xs text-neutral-400">No art</span>
        )}
      </div>

      <div className="min-w-0">
        {row.candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div>
              <div className="truncate text-base font-semibold text-neutral-950">
                {selected?.collectionName}
              </div>
              <div className="mt-1 truncate text-sm text-neutral-600">
                {selected?.artistName}
                {selected?.releaseDate ? ` / ${selected.releaseDate.slice(0, 4)}` : ""}
              </div>
            </div>
            <select
              className="w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
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
            <div className="truncate text-xs text-neutral-500">
              {selected?.primaryGenreName ?? "Album"}
              {selected?.releaseDate ? ` / ${selected.releaseDate.slice(0, 4)}` : ""}
              {selected?.trackCount ? ` / ${selected.trackCount} tracks` : ""}
            </div>
          </div>
        ) : (
          <span className="text-sm text-neutral-500">No album result</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 md:flex-col md:items-start">
        <div>
          <StatusBadge confirmed={row.confirmed} status={row.status} />
          {row.message ? <div className="mt-2 text-xs text-neutral-500">{row.message}</div> : null}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-950">
          <input
            checked={row.confirmed}
            className="h-4 w-4 accent-neutral-950"
            disabled={row.status !== "found"}
            onChange={(event) => updateRow(row.id, { confirmed: event.target.checked })}
            type="checkbox"
          />
          Select
        </label>
      </div>
    </div>
  );
}

function StatusBadge({
  confirmed,
  status,
}: {
  confirmed: boolean;
  status: AlbumWorkRow["status"];
}) {
  if (confirmed && status === "found") {
    return (
      <span className="inline-flex border border-neutral-950 bg-neutral-950 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] text-white">
        Selected
      </span>
    );
  }

  const styles: Record<AlbumWorkRow["status"], string> = {
    idle: "border-neutral-200 bg-white text-neutral-500",
    searching: "border-neutral-950 bg-white text-neutral-950",
    found: "border-neutral-950 bg-white text-neutral-950",
    "not-found": "border-neutral-300 bg-neutral-100 text-neutral-600",
    invalid: "border-neutral-300 bg-neutral-100 text-neutral-600",
    error: "border-neutral-950 bg-neutral-950 text-white",
    downloading: "border-neutral-950 bg-white text-neutral-950",
    downloaded: "border-neutral-950 bg-neutral-950 text-white",
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
    <span className={`inline-flex border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] ${styles[status]}`}>
      {label[status]}
    </span>
  );
}
