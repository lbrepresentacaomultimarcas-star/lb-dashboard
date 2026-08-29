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

/* Paleta do formulário da administradora, tirada do papel. */
const AZUL: [number, number, number] = [31, 78, 121];
const AZUL_FORTE: [number, number, number] = [37, 99, 175];
const CAB_FUNDO: [number, number, number] = [219, 233, 245];
const BORDA: [number, number, number] = [150, 160, 175];

function carregarImagem(src: string): Promise<{ url: string; ratio: number } | null> {
  return new Promise((resolve) => {
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

const carregarLogo = () => carregarImagem(settings.get("logo_principal") ?? "/logo-lb.jpg");
const carregarLogoParceira = () => carregarImagem(settings.get("logo_parceira") ?? "/logo-multimarcas.jpg");

type Doc = import("jspdf").jsPDF;

/** Quebra o texto e devolve as linhas — usado para saber a altura ANTES de desenhar. */
function linhasDe(doc: Doc, txt: string, largura: number): string[] {
  return doc.splitTextToSize(txt || "—", largura) as string[];
}


/* ------------------------- estilo TABELA (formulário) ---------------------- */

/**
 * Reproduz o formulário de papel da administradora: uma tabela de linhas com
 * borda, "Rótulo: valor" na mesma linha.
 *
 * Continua sem conhecer campo por nome — lê `modelo.tabela` e desenha. Trocar
 * a ordem das linhas, acrescentar campo ou mudar o título é mexer no modelo.
 */
async function desenharTabela(doc: Doc, modelo: ModeloFicha, dic: Record<string, string>) {
  const linhas = modelo.tabela?.linhas ?? [];
  let y = 12;

  // faixa superior: o papel tem uma curva azul; aqui vira uma barra limpa —
  // imitação malfeita de curva fica pior do que uma barra bem feita.
  doc.setFillColor(...AZUL_FORTE);
  doc.rect(0, 0, L, 4, "F");

  const logo = modelo.cabecalho.logoParceira ? await carregarLogoParceira() : null;
  if (logo) {
    const h = 13;
    const w = Math.min(46, h * logo.ratio);
    try {
      doc.addImage(logo.url, "PNG", L - M - w, y, w, h);
    } catch {
      /* logo é enfeite */
    }
  }

  y += 20;
  doc.setTextColor(...AZUL).setFont("helvetica", "bold").setFontSize(15);
  doc.text(modelo.cabecalho.titulo, L / 2, y, { align: "center" });
  if (modelo.cabecalho.subtitulo) {
    doc.text(modelo.cabecalho.subtitulo, L / 2, y + 6.5, { align: "center" });
    y += 6.5;
  }
  y += 7;

  // faixa do título da tabela
  const H = 7.6;
  doc.setFillColor(...CAB_FUNDO);
  doc.setDrawColor(...BORDA).setLineWidth(0.25);
  doc.rect(M, y, UTIL, H, "FD");
  doc.setTextColor(...AZUL).setFont("helvetica", "bold").setFontSize(9.5);
  doc.text(modelo.tabela?.titulo ?? "", L / 2, y + H / 2 + 1.4, { align: "center" });
  y += H;

  for (const linha of linhas) {
    const alt = Math.max(...linha.celulas.map((c) => c.altura ?? 1));
    const h = H * alt;
    if (y + h > 275) {
      doc.addPage();
      y = M;
    }
    const pesos = linha.celulas.map((c) => c.peso ?? 1 / linha.celulas.length);
    let x = M;
    linha.celulas.forEach((cel, i) => {
      const w = UTIL * pesos[i];
      doc.setDrawColor(...BORDA).setLineWidth(0.25);
      doc.rect(x, y, w, h, "S");

      doc.setTextColor(...AZUL).setFont("helvetica", "bold").setFontSize(7.6);
      const larguraRotulo = doc.getTextWidth(cel.rotulo);
      doc.text(cel.rotulo, x + 2.5, y + 5);

      /*
       * O valor entra ao lado do rótulo, como quem preenche à mão. Mas o
       * rótulo do endereço é longo e sobra pouco espaço: nesse caso o valor
       * desce para a linha de baixo e usa a caixa inteira. Cortar endereço
       * numa ficha que vai para o administrativo é o tipo de erro que este
       * módulo existe para acabar.
       */
      const valor = cel.chave ? (dic[cel.chave] ?? "") : "";
      if (valor && valor !== "—") {
        doc.setTextColor(20, 26, 36).setFont("helvetica", "normal").setFontSize(8.4);
        const aoLado = w - larguraRotulo - 7;
        const cabeAoLado = doc.getTextWidth(valor) <= aoLado;
        if (cabeAoLado) {
          doc.text(valor, x + larguraRotulo + 4.5, y + 5);
        } else {
          const cabem = Math.max(1, Math.floor((h - 7) / 3.8));
          const linhasV = (doc.splitTextToSize(valor, w - 5) as string[]).slice(0, cabem);
          linhasV.forEach((l, i) => doc.text(l, x + 2.5, y + 9 + i * 3.8));
        }
      }

      // segundo rótulo na mesma caixa ("Grupo: ___ Crédito: ___")
      if (cel.extra) {
        const meio = x + w * 0.5;
        doc.setTextColor(...AZUL).setFont("helvetica", "bold").setFontSize(7.6);
        doc.text(cel.extra.rotulo, meio, y + 5);
        const v2 = cel.extra.chave ? (dic[cel.extra.chave] ?? "") : "";
        if (v2 && v2 !== "—") {
          const lr2 = doc.getTextWidth(cel.extra.rotulo);
          doc.setTextColor(20, 26, 36).setFont("helvetica", "normal").setFontSize(8.4);
          const cabe2 = (doc.splitTextToSize(v2, Math.max(w * 0.5 - lr2 - 5, 12)) as string[])[0];
          doc.text(cabe2, meio + lr2 + 2.5, y + 5);
        }
      }
      x += w;
    });
    y += h;
  }

  /* rodapé institucional */
  y = Math.max(y + 10, 262);
  const inst = modelo.rodape.institucional ?? [];
  if (inst.length) {
    doc.setFont("helvetica", "bold").setFontSize(7.4).setTextColor(...AZUL);
    doc.text(inst[0], L / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(...CINZA);
    inst.slice(1).forEach((l, i) => doc.text(l, L / 2, y + 3.6 + i * 3.2, { align: "center" }));
    y += 3.6 + (inst.length - 1) * 3.2;
  }
  if (modelo.rodape.mostrarData) {
    doc.setFontSize(6.8).setTextColor(...CINZA);
    doc.text(`Emitida pelo LB CRM em ${dic.emitido_em}`, L / 2, y + 5, { align: "center" });
  }
  doc.setFillColor(...AZUL_FORTE);
  doc.rect(0, 291, L, 6, "F");
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

  // O formulário da administradora é uma tabela; o relatório de análise é uma
  // grade. Cada um tem seu desenho, e os dois leem o MESMO dicionário.
  if (modelo.estilo === "tabela") {
    await desenharTabela(doc, modelo, dic);
    return doc.output("blob");
  }

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
