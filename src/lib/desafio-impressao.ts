/**
 * Impressão / PDF do Desafio LB em A4 horizontal, no layout do material
 * oficial (azul-marinho, branco e dourado), já preenchido com os números do
 * sistema. Gera um documento à parte para não depender do layout do app.
 */
import {
  FRASE_PADRAO,
  dataBR,
  marcasTermometro,
  metaColetivaDe,
  metaDiaria,
  metaUnica,
  periodoBR,
  rotuloDia,
  totaisDaEquipe,
  type Desafio,
  type FichaVendedor,
} from "./desafio";

const NAVY = "#0B1F3A";
const GOLD = "#C9A227";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:${NAVY};background:#fff}
.pg{width:297mm;height:210mm;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.top{background:${NAVY};color:#fff;padding:7mm 12mm 5mm;display:flex;align-items:center;gap:6mm;border-bottom:2.2mm solid ${GOLD}}
.logo{width:17mm;height:17mm;border-radius:50%;border:.6mm solid ${GOLD};color:${GOLD};display:grid;place-items:center;font-weight:800;font-size:20px;flex:none}
.marca{color:${GOLD};letter-spacing:4px;font-size:10px;font-weight:700}
.tit{font-size:26px;font-weight:800;line-height:1.1;margin:1mm 0}
.sub{font-size:12px;opacity:.85}
.obj{margin-left:auto;border:.4mm solid ${GOLD};border-radius:3mm;padding:3mm 6mm;text-align:center}
.obj small{display:block;color:${GOLD};letter-spacing:3px;font-size:9px;font-weight:700}
.obj b{font-size:16px}
.corpo{padding:5mm 12mm 0}
.linha{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3mm}
.h2{font-weight:800;letter-spacing:2px;font-size:13px}
.cinza{color:#5b6475;font-size:11px}
table{width:100%;border-collapse:collapse}
th{background:${NAVY};color:${GOLD};font-size:9.5px;letter-spacing:1.5px;padding:2.6mm 2mm;text-transform:uppercase}
td{padding:3.4mm 3mm;font-size:14px;border-bottom:.2mm solid #d9dde5}
tbody tr:nth-child(odd) td{background:#f3f5f9}
.num{text-align:right;font-variant-numeric:tabular-nums}
.c{text-align:center}
.nome{font-weight:800;font-size:15px;border-left:1.2mm solid ${GOLD}}
.tot td{background:${NAVY}!important;color:#fff;font-weight:800}
.tot .ouro{color:${GOLD}}
.st{font-weight:800;font-size:11px}
.ok{color:#15803d}.and{color:#b7791f}.zero{color:#6b7280}.x{color:#dc2626}
.cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin-top:4mm}
.card{border-radius:3mm;padding:3mm 5mm;border:.4mm solid ${GOLD}}
.card small{display:block;font-size:9.5px;letter-spacing:1.5px;font-weight:800}
.card b{font-size:22px}
.escuro{background:${NAVY};color:#fff}.escuro small{color:${GOLD}}
.creme{background:#f6ecd0}.branco{border-color:${NAVY}}
.termo{margin-top:4mm}
.barra{height:7mm;border:.4mm solid ${NAVY};border-radius:2mm;position:relative;overflow:hidden;margin-top:2mm}
.fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,${GOLD},#e8c95a)}
.marcas{display:flex;justify-content:space-between;font-size:9.5px;font-weight:700;margin-top:1mm}
.rod{position:absolute;left:12mm;right:12mm;bottom:5mm;border-top:.3mm solid ${GOLD};padding-top:2mm;display:flex;justify-content:space-between;font-size:9.5px;color:#5b6475}
.rod b{color:${NAVY}}
.resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-bottom:4mm}
.resumo div{border-radius:2.5mm;padding:2.5mm 4mm;background:#f6ecd0}
.resumo div:first-child{background:${NAVY};color:#fff}
.resumo small{display:block;font-size:8.5px;letter-spacing:1.5px;font-weight:800;color:#8a6d12}
.resumo div:first-child small{color:${GOLD}}
.resumo b{font-size:17px}
.grade{display:grid;grid-template-columns:1fr 64mm;gap:5mm}
.ficha td{padding:2.3mm 2.5mm;font-size:13px}
.ficha th{padding:2mm}
.lado .card{margin-bottom:3mm}
.regra{background:#f3f5f9;border-radius:2.5mm;padding:3mm 5mm;font-size:11.5px}
.regra small{display:block;font-size:9.5px;letter-spacing:1.5px;font-weight:800;margin-bottom:1mm}
.ass{margin-top:7mm;border-top:.3mm solid ${NAVY};text-align:center;font-size:9.5px;color:#5b6475;padding-top:1mm}
.res{font-weight:900;font-size:15px}
`;

/** "R$ 1.000.000,00 até 07/12" */
export function objetivoDe(d: Desafio): string {
  return `${brl(metaColetivaDe(d))} até ${dataBR(d.fim).slice(0, 5)}`;
}

function topo(d: Desafio, titulo: string, sub: string) {
  return `<div class="top"><div class="logo">LB</div><div><div class="marca">LB REPRESENTAÇÕES</div>
  <div class="tit">${esc(titulo)}</div><div class="sub">${esc(sub)}</div></div>
  <div class="obj"><small>OBJETIVO</small><b>${esc(objetivoDe(d))}</b></div></div>`;
}

function rodape(d: Desafio, pagina: number, total: number) {
  return `<div class="rod"><span>${esc(d.titulo)} • Período: ${periodoBR(d)}</span>
  <b>${esc(d.frase || FRASE_PADRAO)}</b><span>Página ${pagina} de ${total}</span></div>`;
}

const classeStatus = (s: string) => (s.startsWith("META") ? "ok" : s === "EM ANDAMENTO" ? "and" : "zero");

function paginaPainel(d: Desafio, fichas: FichaVendedor[], pagina: number, total: number, geradoEm: string) {
  const meta = metaColetivaDe(d);
  const t = totaisDaEquipe(fichas, meta);
  const unica = metaUnica(d);
  const linhas = fichas
    .map(
      (f) => `<tr><td class="c"><b>${f.posicao}º</b></td><td class="nome">${esc(f.nome)}</td>
      <td class="num">${brl(f.meta)}</td><td class="num"><b>${brl(f.total)}</b></td>
      <td class="num">${brl(f.falta)}</td><td class="num">${pct(f.pct)}</td>
      <td class="c st ${classeStatus(f.status)}">${f.status}</td></tr>`,
    )
    .join("");
  const largura = Math.min(100, t.pct);
  const n = d.participantes.length;
  const compacto = n > 7 ? ' style="font-size:11px"' : "";
  return `<section class="pg">${topo(d, d.titulo, `Resumo geral da equipe • Período: ${periodoBR(d)}`)}
  <div class="corpo"><div class="linha"><span class="h2">RESUMO GERAL DA EQUIPE</span>
  <span class="cinza">Meta coletiva: ${brl(meta)} • ${n} vendedor${n === 1 ? "" : "es"}${unica ? ` • ${brl(unica)} cada` : ""} • posição em ${esc(geradoEm)}</span></div>
  <table${compacto}><thead><tr><th>Pos.</th><th>Vendedor</th><th>Meta individual</th><th>Produção realizada</th><th>Falta para a meta</th><th>% da meta</th><th>Status</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr class="tot"><td></td><td class="ouro">TOTAL DA EQUIPE</td><td class="num">${brl(meta)}</td>
  <td class="num">${brl(t.total)}</td><td class="num">${brl(t.falta)}</td><td class="num">${pct(t.pct)}</td><td></td></tr></tfoot></table>
  <div class="cards"><div class="card escuro"><small>TOTAL PRODUZIDO PELA EQUIPE</small><b>${brl(t.total)}</b></div>
  <div class="card creme"><small>FALTA PARA CHEGAR A ${esc(brl(meta))}</small><b>${brl(t.falta)}</b></div>
  <div class="card branco"><small>% DA META ATINGIDA</small><b>${pct(t.pct)}</b></div></div>
  <div class="termo"><span class="h2">TERMÔMETRO DA EQUIPE</span>
  <div class="barra"><div class="fill" style="width:${largura}%"></div></div>
  <div class="marcas">${marcasTermometro(meta)
    .map((m, i) => (i === 10 ? `<span style="color:${GOLD}">${m}</span>` : `<span>${m}</span>`))
    .join("")}</div></div>
  </div>${rodape(d, pagina, total)}</section>`;
}

function paginaFicha(d: Desafio, f: FichaVendedor, pagina: number, total: number) {
  const diaria = metaDiaria(f.meta, d);
  const nDias = f.dias.length;
  // linhas mais baixas quando o desafio tem muitos dias, para caber na folha
  const estiloLinha =
    nDias <= 14 ? "" : nDias <= 22 ? "padding:1.2mm 2.5mm;font-size:11px" : "padding:.5mm 2mm;font-size:9px";
  const linhas = f.dias
    .map((dia) => {
      const r = rotuloDia(dia.chave);
      const fds = r.semana === "Sábado" || r.semana === "Domingo";
      const marca =
        dia.resultado === "vendeu" ? `<span class="res ok">✓</span>` : dia.resultado === "nao_vendeu" ? `<span class="res x">X</span>` : "";
      const td = estiloLinha ? `<td style="${estiloLinha}"` : "<td";
      return `<tr>${td} class="c"><b>${r.data}</b></td>${td}${fds ? ' style="color:#6b7280"' : ""}>${r.semana}</td>
      ${td} class="num">${brl(diaria)}</td>${td} class="num"><b>${dia.valor ? brl(dia.valor) : "—"}</b></td>
      ${td} class="num">${dia.futuro ? "—" : brl(dia.acumulado)}</td>${td} class="num">${dia.futuro ? "—" : brl(dia.falta)}</td>${td} class="c">${marca}</td></tr>`;
    })
    .join("");
  const [, mi, di] = d.inicio.split("-");
  return `<section class="pg"${nDias > 31 ? ' style="height:auto"' : ""}>${topo(d, f.nome.toUpperCase(), `Controle individual • ${d.titulo}`)}
  <div class="corpo"><div class="resumo"><div><small>META INDIVIDUAL</small><b>${brl(f.meta)}</b></div>
  <div><small>PERÍODO</small><b>${di}/${mi} a ${dataBR(d.fim)}</b></div><div><small>META DIÁRIA DE REFERÊNCIA</small><b>${brl(diaria)}</b></div>
  <div><small>POSIÇÃO NO DESAFIO</small><b>${f.posicao}º lugar · ${nDias} dias</b></div></div>
  <div class="grade"><table class="ficha"><thead><tr><th>Data</th><th>Dia</th><th>Meta diária</th><th>Vendido no dia</th><th>Acumulado</th><th>Falta</th><th>Resultado</th></tr></thead>
  <tbody>${linhas}</tbody><tfoot><tr class="tot"><td class="ouro">TOTAL</td><td></td><td class="num">${brl(f.meta)}</td>
  <td class="num">${brl(f.total)}</td><td></td><td class="num">${brl(f.falta)}</td><td></td></tr></tfoot></table>
  <div class="lado"><div class="card escuro"><small>TOTAL VENDIDO</small><b>${brl(f.total)}</b></div>
  <div class="card creme"><small>FALTA PARA A META</small><b>${brl(f.falta)}</b></div>
  <div class="card branco"><small>% DA META</small><b>${pct(f.pct)}</b></div>
  <div class="regra"><small>REGRA DE MARCAÇÃO</small><span class="ok"><b>✓</b></span> Vendeu no dia<br><span class="x"><b>X</b></span> Não vendeu no dia<br><span class="zero">Em branco: dia ainda em aberto</span></div>
  <div class="ass">Assinatura do vendedor</div></div></div>
  </div>${rodape(d, pagina, total)}</section>`;
}

/** Monta o documento: painel e/ou fichas, na ordem pedida. */
export function htmlDesafio(
  d: Desafio,
  opcoes: { painel: boolean; fichas: FichaVendedor[]; todas: FichaVendedor[] },
): string {
  const geradoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const total = (opcoes.painel ? 1 : 0) + opcoes.fichas.length;
  const paginas: string[] = [];
  if (opcoes.painel) paginas.push(paginaPainel(d, opcoes.todas, 1, total, geradoEm));
  for (const f of opcoes.fichas) paginas.push(paginaFicha(d, f, paginas.length + 1, total));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.titulo)}</title>
  <style>${CSS}</style></head><body>${paginas.join("")}</body></html>`;
}


/** Abre a janela de impressão (o navegador oferece "Salvar como PDF"). Devolve false se o pop-up foi bloqueado. */
export function imprimirDesafio(html: string): boolean {
  const w = window.open("", "_blank", "width=1200,height=850");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* o usuário imprime pelo menu se algo bloquear */
    }
  }, 400);
  return true;
}
