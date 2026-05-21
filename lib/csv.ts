import type { AlbumInputRow } from "./types";

type CsvParseResult = {
  rows: AlbumInputRow[];
  errors: string[];
};

export type TextImportParseResult = {
  rows: AlbumInputRow[];
  invalidRows: AlbumInputRow[];
};

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

  input.split(/\r?\n/).forEach((line, index) => {
    const rawInput = line.trim();
    const sourceLine = index + 1;

    if (!rawInput) {
      return;
    }

    rows.push({
      id: crypto.randomUUID(),
      artist: "",
      album: "",
      query: normalizeTextQuery(rawInput),
      sourceLine,
      rawInput,
    });
  });

  return { rows, invalidRows: [] };
}

function normalizeTextQuery(input: string): string {
  return input.replace(/\s+[-,/|]\s+/g, " ").replace(/\s+/g, " ").trim();
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
