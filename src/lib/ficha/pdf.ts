"use client";

// GERADOR do PDF da ficha.
//
// Este arquivo NÃO conhece nenhum campo por nome. Ele recebe um ModeloFicha
// (seções, rótulos, larguras) e um dicionário `chave → texto`, e desenha.
// É isso que permite trocar o desenho da ficha depois sem reescrever o módulo:
// muda o modelo, este gerador continua igual.
//
// Fundo branco de propósito: ficha é documento para imprimir e assinar, não
// peça de rede social. Navy e dourado entram só como identidade.

import { AVISO_ANALISE_INTERNA, STATUS_ANALISE_INFO, type Analise } from "../analises";
import { settings } from "../settings";
import { dicionarioCompleto, type ModeloFicha } from "./modelo";
import type { Ficha } from "../fichas";

const NAVY: [number, number, number] = [11, 22, 38];
const GOLD: [number, number, number] = [176, 137, 36];
const CINZA: [number, number, number] = [110, 122, 140];
const LINHA: [number, number, number] = [214, 220, 230];
const PRETO: [number, number, number] = [22, 28, 38];

const M = 15; // margem
const L = 210; // largura A4
const UTIL = L - M * 2;

function carregarLogo(): Promise<{ url: string; ratio: number } | null> {
  return new Promise((resolve) => {
    const src = settings.get("logo_principal") ?? "/logo-lb.jpg";
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext("2d");
        if (!cx) return resolve(null);
        cx.drawImage(img, 0, 0);
        resolve({ url: c.toDataURL("image/png"), ratio: img.naturalWidth / img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type Doc = import("jspdf").jsPDF;

/** Quebra o texto e devolve as linhas — usado para saber a altura ANTES de desenhar. */
function linhasDe(doc: Doc, txt: string, largura: number): string[] {
  return doc.splitTextToSize(txt || "—", largura) as string[];
}

export async function gerarFichaPdf(
  analise: Analise,
  modelo: ModeloFicha,
  extras: Record<string, string> = {},
  ficha: Ficha | null = null,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const dic = dicionarioCompleto(analise, ficha, extras);
  const logo = modelo.cabecalho.mostrarLogo ? await carregarLogo() : null;

  let y = M;

  /* ------------------------------- cabeçalho ------------------------------ */
  let tx = M;
  if (logo) {
    const h = 16;
    const w = Math.min(30, h * logo.ratio);
    try {
      doc.addImage(logo.url, "PNG", M, y, w, h);
      tx = M + w + 5;
    } catch {
      /* logo é enfeite: se falhar, a ficha sai sem ela */
    }
  }
  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(17);
  doc.text(modelo.cabecalho.titulo, tx, y + 7);
  if (modelo.cabecalho.subtitulo) {
    doc.setTextColor(...CINZA).setFont("helvetica", "normal").setFontSize(9.5);
    doc.text(modelo.cabecalho.subtitulo, tx, y + 13);
  }

  // selo do resultado, à direita
  const info = STATUS_ANALISE_INFO[analise.status];
  // Aprovada, o selo mostra a FRASE escolhida na decisão — é ela que o cliente
  // e o administrativo leem, não o rótulo técnico do status.
  const selo = analise.status === "aprovado" && analise.mensagemAprovacao
    ? analise.mensagemAprovacao
    : info.curto;
  doc.setFont("helvetica", "bold").setFontSize(9);
  const selW = doc.getTextWidth(selo) + 10;
  const cor = analise.status === "aprovado" ? [16, 130, 90] : analise.status === "nao_aprovado" ? [175, 45, 45] : [170, 120, 10];
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.roundedRect(L - M - selW, y + 1, selW, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(selo, L - M - selW / 2, y + 6.4, { align: "center" });
  doc.setTextColor(...CINZA).setFont("helvetica", "normal").setFontSize(7.5);
  doc.text("ANÁLISE INTERNA", L - M, y + 13, { align: "right" });

  y += 18;
  doc.setDrawColor(...GOLD).setLineWidth(0.6);
  doc.line(M, y, L - M, y);
  y += 5;

  /* --------------------------------- seções -------------------------------- */
  const colW = UTIL / 4;

  for (const secao of modelo.secoes) {
    // quebra de página antes de começar uma seção que não caberia
    if (y > 250) {
      doc.addPage();
      y = M;
    }
    doc.setTextColor(...GOLD).setFont("helvetica", "bold").setFontSize(8.5);
    doc.text(secao.titulo.toUpperCase(), M, y);
    y += 3;

    let col = 0;
    let alturaDaLinha = 0;

    for (const campo of secao.campos) {
      const larg = campo.largura ?? 1;
      // campo não cabe no que resta da linha: começa outra
      if (col + larg > 4) {
        y += alturaDaLinha;
        col = 0;
        alturaDaLinha = 0;
      }

      const x = M + col * colW;
      const w = colW * larg - 3;
      const valor = dic[campo.chave] ?? "—";

      doc.setFontSize(6.8).setFont("helvetica", "normal").setTextColor(...CINZA);
      doc.text(campo.rotulo.toUpperCase(), x, y + 3.5);

      doc.setFontSize(campo.alto ? 8.5 : 10).setFont("helvetica", campo.alto ? "normal" : "bold").setTextColor(...PRETO);
      const linhas = linhasDe(doc, valor, w);
      // teto de linhas: observação comprida não pode empurrar a ficha para
      // uma segunda página — ficha é documento de uma folha.
      const mostradas = campo.alto ? linhas.slice(0, 5) : linhas.slice(0, 2);
      mostradas.forEach((l, i) => doc.text(l, x, y + 7.6 + i * (campo.alto ? 3.8 : 4.2)));

      // 8,2 de cabeça (rótulo + respiro) + as linhas do valor. Enxuto de
      // propósito: a ficha da operação tem 5 seções e precisa caber numa folha.
      const alturaCampo = 8.2 + mostradas.length * (campo.alto ? 3.8 : 4.2);
      alturaDaLinha = Math.max(alturaDaLinha, alturaCampo);

      doc.setDrawColor(...LINHA).setLineWidth(0.2);
      doc.line(x, y + alturaCampo - 2.5, x + w, y + alturaCampo - 2.5);

      col += larg;
      if (col >= 4) {
        y += alturaDaLinha;
        col = 0;
        alturaDaLinha = 0;
      }
      if (y > 265) {
        doc.addPage();
        y = M;
        col = 0;
        alturaDaLinha = 0;
      }
    }
    if (col > 0) y += alturaDaLinha;
    y += 2.5;
  }

  /* --------------------------------- rodapé -------------------------------- */
  // Mede o rodapé inteiro antes de posicionar: assim ele encosta no pé da
  // página quando sobra espaço, e só vira folha quando de fato não cabe.
  const aviso0 = modelo.rodape.aviso || AVISO_ANALISE_INTERNA;
  doc.setFontSize(7.2).setFont("helvetica", "italic");
  const nLinhasAviso = (doc.splitTextToSize(aviso0, UTIL - 8) as string[]).length;
  const alturaRodape =
    (modelo.rodape.assinaturas.length > 0 ? 16 : 0) + (nLinhasAviso * 3.6 + 6) + 4 + 7;
  const pe = 297 - 12 - alturaRodape;

  if (y > pe) {
    doc.addPage();
    y = M;
  }
  y = Math.max(y, pe);

  if (modelo.rodape.assinaturas.length > 0) {
    const largAss = UTIL / modelo.rodape.assinaturas.length;
    modelo.rodape.assinaturas.forEach((rot, i) => {
      const x = M + i * largAss;
      doc.setDrawColor(...CINZA).setLineWidth(0.3);
      doc.line(x + 4, y + 8, x + largAss - 8, y + 8);
      doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...CINZA);
      doc.text(rot, x + (largAss - 4) / 2, y + 11.5, { align: "center" });
    });
    y += 16;
  }

  // aviso legal — nunca sai da ficha, mesmo que o modelo esqueça de pedir
  const aviso = modelo.rodape.aviso || AVISO_ANALISE_INTERNA;
  doc.setFillColor(246, 247, 250);
  const linhasAviso = doc.splitTextToSize(aviso, UTIL - 8) as string[];
  const hAviso = linhasAviso.length * 3.6 + 6;
  doc.roundedRect(M, y, UTIL, hAviso, 1.5, 1.5, "F");
  doc.setFontSize(7.2).setFont("helvetica", "italic").setTextColor(...CINZA);
  linhasAviso.forEach((l, i) => doc.text(l, M + 4, y + 5 + i * 3.6));
  y += hAviso + 5;

  doc.setDrawColor(...LINHA).setLineWidth(0.3);
  doc.line(M, y, L - M, y);
  doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...CINZA);
  const esquerda = modelo.rodape.mostrarConsultor ? `Consultor: ${dic.consultor}` : "";
  doc.text(`LB Representações · ${esquerda}`, M, y + 4.5);
  if (modelo.rodape.mostrarData) {
    doc.text(`Emitida em ${dic.emitido_em}`, L - M, y + 4.5, { align: "right" });
  }

  // numeração, quando passa de uma página
  const total = doc.getNumberOfPages();
  if (total > 1) {
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(7).setTextColor(...CINZA);
      doc.text(`${p}/${total}`, L / 2, 291, { align: "center" });
    }
  }

  return doc.output("blob");
}

/** Abre o PDF numa aba para conferência antes de baixar/imprimir. */
export async function visualizarFicha(a: Analise, m: ModeloFicha, extras?: Record<string, string>, f?: Ficha | null) {
  const blob = await gerarFichaPdf(a, m, extras, f ?? null);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // o navegador precisa da URL viva enquanto carrega a aba
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function baixarFicha(a: Analise, m: ModeloFicha, extras?: Record<string, string>, f?: Ficha | null) {
  const blob = await gerarFichaPdf(a, m, extras, f ?? null);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ficha-${a.nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
