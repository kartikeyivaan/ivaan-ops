import * as XLSX from "xlsx";

export type ExportColumn<T extends Record<string, unknown>> = {
  key: keyof T;
  header: string;
};

export function buildExcelBuffer<T extends Record<string, unknown>>(
  rows: T[],
  sheetName: string,
  columns: ExportColumn<T>[],
): Buffer {
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.header, row[column.key] ?? ""])),
  );
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  return Buffer.from(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  );
}

export function exportFilename(reportKey: string, extension: "xlsx" | "pdf"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${reportKey}-${stamp}.${extension}`;
}
