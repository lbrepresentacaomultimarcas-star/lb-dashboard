"use client";

/**
 * Helpers de exportação.
 * jspdf, jspdf-autotable e xlsx são pesados (~700KB juntos) — carregamos
 * sob demanda via dynamic import, só quando o usuário clica em exportar.
 */

export type Row = (string | number)[];

export function exportCsv(filename: string, rows: Row[]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

export async function exportXlsx(filename: string, sheets: Record<string, Row[]>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export async function exportPdf(opts: {
  filename: string;
  titulo: string;
  subtitulo?: string;
  head: string[];
  body: Row[];
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(opts.titulo, 14, 18);
  if (opts.subtitulo) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(opts.subtitulo, 14, 25);
  }
  autoTable(doc, {
    startY: opts.subtitulo ? 30 : 24,
    head: [opts.head],
    body: opts.body.map((r) => r.map((c) => String(c))),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });
  doc.save(opts.filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportBackupJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, filename);
}
