import JSZip from "jszip";

export type CsvRows = (string | number | undefined)[][];

function toCsv(rows: CsvRows): string {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// A single file download works everywhere a click can trigger it. Use this whenever there's
// only one file to export.
export function downloadCsvFile(filename: string, rows: CsvRows) {
  triggerDownload(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" }), filename);
}

// Several files from one click do not reliably download — most browsers (Chrome included)
// block more than one automatic download per user gesture, showing a "this site is trying to
// download multiple files" prompt that blocks every file after the first until the user
// explicitly allows it, which silently looked like only the first file was ever exported.
// Bundling into one zip sidesteps that entirely: it's one download either way.
export async function downloadCsvZip(zipFilename: string, files: { filename: string; rows: CsvRows }[]) {
  const zip = new JSZip();
  for (const { filename, rows } of files) zip.file(filename, toCsv(rows));
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipFilename);
}
