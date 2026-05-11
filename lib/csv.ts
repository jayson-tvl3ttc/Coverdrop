import type { AlbumInputRow } from "./types";

type CsvParseResult = {
  rows: AlbumInputRow[];
  errors: string[];
};

export type TextImportParseResult = {
  rows: AlbumInputRow[];
  invalidRows: AlbumInputRow[];
};

const TEXT_DELIMITERS = [" - ", ",", "/", "|"];

export function parseAlbumCsv(input: string): CsvParseResult {
  const table = parseCsv(input);
  const errors: string[] = [];

  if (table.length === 0) {
    return { rows: [], errors: ["CSV file is empty."] };
  }

  const headers = table[0].map((header) => header.trim().toLowerCase());
  const artistIndex = headers.indexOf("artist");
  const albumIndex = headers.indexOf("album");

  if (artistIndex === -1 || albumIndex === -1) {
    return {
      rows: [],
      errors: ["CSV header must include artist and album fields."],
    };
  }

  const rows: AlbumInputRow[] = [];

  table.slice(1).forEach((columns, index) => {
    const artist = (columns[artistIndex] ?? "").trim();
    const album = (columns[albumIndex] ?? "").trim();

    if (!artist || !album) {
      errors.push(`Line ${index + 2} is missing artist or album and was skipped.`);
      return;
    }

    rows.push({
      id: crypto.randomUUID(),
      artist,
      album,
      sourceLine: index + 2,
    });
  });

  return { rows, errors };
}

export function parseAlbumTextImport(input: string): TextImportParseResult {
  const rows: AlbumInputRow[] = [];
  const invalidRows: AlbumInputRow[] = [];

  input.split(/\r?\n/).forEach((line, index) => {
    const rawInput = line.trim();
    const sourceLine = index + 1;

    if (!rawInput) {
      return;
    }

    const parsed = parseAlbumTextLine(rawInput);
    if (!parsed) {
      invalidRows.push({
        id: crypto.randomUUID(),
        artist: rawInput,
        album: "",
        sourceLine,
        rawInput,
      });
      return;
    }

    rows.push({
      id: crypto.randomUUID(),
      artist: parsed.artist,
      album: parsed.album,
      sourceLine,
      rawInput,
    });
  });

  return { rows, invalidRows };
}

function parseAlbumTextLine(line: string): Pick<AlbumInputRow, "artist" | "album"> | null {
  for (const delimiter of TEXT_DELIMITERS) {
    const delimiterIndex = line.indexOf(delimiter);
    if (delimiterIndex === -1) {
      continue;
    }

    const artist = line.slice(0, delimiterIndex).trim();
    const album = line.slice(delimiterIndex + delimiter.length).trim();

    if (artist && album) {
      return { artist, album };
    }
  }

  return null;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}
