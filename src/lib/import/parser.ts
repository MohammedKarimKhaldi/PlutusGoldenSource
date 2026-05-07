import readXlsxFile from "read-excel-file/browser";
import { DOMParser } from "@xmldom/xmldom";

import { parseEmailList, splitCategories } from "./normalization";

export type RawContactRow = {
  rowNumber: number;
  sourceRecordId: string;
  record: string | null;
  emailAddresses: string | null;
  phoneNumbers: string | null;
  linkedinUrl: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyDescription: string | null;
  country: string | null;
  duplicateCompanyName: string | null;
  personCategories: string | null;
  connectionStrength: string | null;
  companyCategories: string | null;
  duplicateRecordId: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
};

export type WorkbookParseResult = {
  sheetName: string;
  header: string[];
  rows: RawContactRow[];
  duplicateHeaderMap: Record<string, number[]>;
};

function headerDuplicates(header: string[]): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  header.forEach((name, index) => {
    const key = name || `Column ${index + 1}`;
    map[key] = [...(map[key] ?? []), index];
  });

  return Object.fromEntries(Object.entries(map).filter(([, indexes]) => indexes.length > 1));
}

function stringifyCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? value.toISOString() : String(value).trim();
  return text || null;
}

export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<WorkbookParseResult> {
  if (!globalThis.DOMParser) {
    globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
  }

  const input: ArrayBuffer = Buffer.isBuffer(buffer) ? (Uint8Array.from(buffer).buffer as ArrayBuffer) : buffer;
  const sheets = await readXlsxFile(input);
  const sheet = sheets[0];
  if (!sheet) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const sheetName = sheet.sheet;
  const rows = sheet.data;
  const headerRow = rows[0] ?? [];
  const header = Array.from({ length: Math.max(15, headerRow.length) }, (_, index) => stringifyCell(headerRow[index]) ?? "");
  const parsedRows: RawContactRow[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rowNumber = index + 1;
    const values = Array.from({ length: header.length }, (_, columnIndex) => stringifyCell(row[columnIndex]));
    if (values.every((value) => value === null)) continue;

    const rawByHeader: Record<string, unknown> = {};
    header.forEach((name, columnIndex) => {
      const key = `${columnIndex + 1}:${name || "Unnamed"}`;
      rawByHeader[key] = values[columnIndex] ?? null;
    });

    parsedRows.push({
      rowNumber,
      sourceRecordId: values[0] ?? `row-${rowNumber}`,
      record: values[1],
      emailAddresses: values[2],
      phoneNumbers: values[3],
      linkedinUrl: values[4],
      jobTitle: values[5],
      companyName: values[6],
      companyDescription: values[7],
      country: values[8],
      duplicateCompanyName: values[9],
      personCategories: values[10],
      connectionStrength: values[11],
      companyCategories: values[12],
      duplicateRecordId: values[13],
      createdAt: values[14],
      raw: rawByHeader,
    });
  }

  return {
    sheetName,
    header,
    rows: parsedRows,
    duplicateHeaderMap: headerDuplicates(header),
  };
}

export function summarizeParsedWorkbook(result: WorkbookParseResult) {
  const rowsWithMultipleEmails = result.rows.filter((row) => parseEmailList(row.emailAddresses).length > 1).length;
  const rowsWithCompanyCategories = result.rows.filter((row) => splitCategories(row.companyCategories).length > 0).length;

  return {
    sheetName: result.sheetName,
    header: result.header,
    duplicateHeaderMap: result.duplicateHeaderMap,
    rowCount: result.rows.length,
    rowsWithMultipleEmails,
    rowsWithCompanyCategories,
  };
}
