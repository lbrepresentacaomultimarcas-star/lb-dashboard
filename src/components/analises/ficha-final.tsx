"use client";

// FICHA FINAL DA OPERAÇÃO — a última etapa, dentro da Análise Final de Proposta.
//
// Fluxo: CRIAR → CONFERIR → CONFIRMAR → PDF. O PDF definitivo só sai depois da
// confirmação, de propósito: é o momento em que alguém olhou os dados e disse
// que estão certos.
//
// Os campos aqui são SÓ os que o CRM ainda não tinha. Nome, CPF, telefone,
// crédito, parcela e lance vêm da análise e aparecem como leitura — o
// consultor não redigita o que o sistema já sabe.

import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  Loader2,
  Lock,
  Pencil,
  Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { brlOuTraco, pctOuTraco, type Analise } from "@/lib/analises";
import {
  ESTADOS_BR,
  ESTADOS_CIVIS,
  FORMAS_PAGAMENTO,
  MEIOS_BANCARIOS,
  TIPOS_CHAVE_PIX,
  TIPOS_CONTA,
  rotuloChavePix,
  type MeioBancario,
  camposFaltando,
  fichasApi,
  podeCriarFicha,
  type Ficha,
} from "@/lib/fichas";
import { MODELO_FICHA_FINAL } from "@/lib/ficha/modelo";
import { baixarFicha, gerarFichaPdf, visualizarFicha } from "@/lib/ficha/pdf";
import { telefoneBonito } from "@/lib/telefone";

const soNum = (t: string) =>
  Number(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || undefined;
const dataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function C({
  rotulo, valor, onChange, ph, tipo = "text", span = "",
}: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  ph?: string; tipo?: string; span?: string;
}) {
  return (
    <div className={span}>
      <Label>{rotulo}</Label>
      <Input type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} placeholder={ph} />
    </div>
  );
}

function Opcoes({
  rotulo, opcoes, valor, onChange, span = "",
}: {
  rotulo: string; opcoes: readonly string[]; valor: string; onChange: (v: string) => void; span?: string;
}) {
  return (
    <div className={span}>
      <Label>{rotulo}</Label>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(valor === o ? "" : o)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              valor === o
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Ler({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{rotulo}</p>
      <p className="break-words text-sm font-semibold text-[var(--color-text)]">{valor || "—"}</p>
    </div>
  );
}

export function FichaFinal({
  analise,
  ficha,
  onMudou,
  autorNome,
}: {
  analise: Analise;
  ficha: Ficha | null;
  onMudou: () => Promise<void> | void;
  autorNome?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Ficha | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const liberada = podeCriarFicha(analise);
  const f = editando ? rascunho : ficha;
  const set = (k: keyof Ficha, v: unknown) => setRascunho((r) => (r ? { ...r, [k]: v } : r));

  /* --------------------------- proposta ainda aberta ------------------------ */
  if (!liberada) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center">
        <Lock className="mx-auto h-6 w-6 text-[var(--color-muted)]" />
        <p className="mt-2 text-sm font-semibold">Ficha bloqueada</p>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          A ficha final é a última etapa: ela abre depois que a proposta for aprovada.
        </p>
      </div>
    );
  }

  /* ------------------------------ ainda não existe -------------------------- */
  if (!ficha) {
    return (
      <div className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-5 text-center">
        <FileSignature className="mx-auto h-6 w-6 text-[var(--color-success)]" />
        <p className="mt-2 text-sm font-semibold">Proposta concluída — pronta para a ficha</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-text-dim)]">
          O sistema traz o que já sabe do cliente e da operação. Você só completa o que falta.
        </p>
        <Button
          className="mt-3"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            try {
              const nova = await fichasApi.criar(analise, autorNome);
              setRascunho(nova);
              setEditando(true);
              await onMudou();
            } catch (e) {
              notify.error("Não consegui criar a ficha", e instanceof Error ? e.message : undefined);
            } finally {
              setOcupado(false);
            }
          }}
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
          Criar ficha
        </Button>
      </div>
    );
  }

  const faltando = camposFaltando(analise, f);
  const confirmada = ficha.status === "confirmada" && !editando;

  async function salvarEConferir() {
    if (!rascunho) return;
    setOcupado(true);
    try {
      await fichasApi.salvar(rascunho, rascunho, autorNome);
      setEditando(false);
      await onMudou();
    } catch (e) {
      notify.error("Não consegui salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    setOcupado(true);
    try {
      await fichasApi.confirmar(ficha!, autorNome);
      notify.success("Ficha confirmada", "Agora dá para gerar o PDF.");
      await onMudou();
    } catch (e) {
      notify.error("Não consegui confirmar", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  const extras = { consultor: analise.criadoPorNome ?? autorNome ?? "—" };

  async function pdf(acao: "ver" | "baixar" | "imprimir") {
    setOcupado(true);
    try {
      if (acao === "ver") await visualizarFicha(analise, MODELO_FICHA_FINAL, extras, ficha);
      else if (acao === "baixar") await baixarFicha(analise, MODELO_FICHA_FINAL, extras, ficha);
      else {
        // imprime sem sair da tela: iframe com o blob e print() nele
        const blob = await gerarFichaPdf(analise, MODELO_FICHA_FINAL, extras, ficha);
        const url = URL.createObjectURL(blob);
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.right = "0";
        frame.style.bottom = "0";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "0";
        frame.src = url;
        frame.onload = () => {
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            window.open(url, "_blank"); // bloqueou: abre para o usuário imprimir
          }
        };
        document.body.appendChild(frame);
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      }
      await fichasApi.registrarPdf(ficha!, autorNome);
      await onMudou();
    } catch (e) {
      notify.error("Não consegui gerar o PDF", e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  /* --------------------------------- CONFERIR ------------------------------- */
  if (!editando) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: confirmada ? "var(--color-success)" : "var(--color-warn)",
              color: "#08111f",
            }}
          >
            {confirmada ? "Ficha confirmada" : "Conferir ficha"}
          </span>
          {confirmada && ficha.confirmadaEm && (
            <span className="text-[11px] text-[var(--color-text-dim)]">
              por {ficha.confirmadaPorNome ?? "—"} · {dataHora(ficha.confirmadaEm)}
            </span>
          )}
        </div>

        {faltando.length > 0 && (
          <div className="rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-3 py-2 text-xs text-[var(--color-text-dim)]">
            <span className="font-semibold text-[var(--color-warn)]">Faltam:</span> {faltando.join(", ")}
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Consorciado</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Ler rotulo="Nome" valor={analise.nome} />
            <Ler rotulo="CPF" valor={analise.cpf} />
            <Ler rotulo="RG / órgão" valor={[ficha.rg, ficha.orgaoEmissor].filter(Boolean).join(" · ")} />
            <Ler rotulo="Telefone" valor={analise.telefone ? telefoneBonito(analise.telefone) : ""} />
            <Ler rotulo="E-mail" valor={analise.email} />
            <Ler rotulo="Naturalidade" valor={ficha.naturalidade} />
            <Ler rotulo="Estado civil" valor={ficha.estadoCivil} />
            <Ler rotulo="Vendedor" valor={analise.criadoPorNome} />
            <Ler rotulo="Nome da mãe" valor={ficha.nomeMae} />
            <Ler rotulo="Nome do pai" valor={ficha.nomePai} />
          </div>

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Cônjuge</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ficha.temConjuge ? (
              <>
                <Ler rotulo="Nome" valor={ficha.conjugeNome} />
                <Ler rotulo="CPF" valor={ficha.conjugeCpf} />
                <Ler rotulo="Nascimento" valor={ficha.conjugeNascimento} />
              </>
            ) : (
              <Ler rotulo="Cônjuge" valor="Não possui" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Ler rotulo="Checagem" valor={ficha.checagem} />
          </div>

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Endereço</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Ler rotulo="CEP" valor={ficha.cep} />
            <Ler rotulo="Endereço" valor={[ficha.endereco, ficha.numero].filter(Boolean).join(", ")} />
            <Ler rotulo="Bairro" valor={ficha.bairro} />
            <Ler rotulo="Cidade / UF" valor={[ficha.cidade, ficha.estado].filter(Boolean).join(" / ")} />
          </div>

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Bancários</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ficha.bancoMeio === "pix" ? (
              <>
                <Ler rotulo="Recebimento" valor="PIX" />
                <Ler rotulo="Tipo de chave" valor={rotuloChavePix(ficha.pixTipo)} />
                <Ler rotulo="Chave Pix" valor={ficha.pixChave} />
              </>
            ) : (
              <>
                <Ler rotulo="Tipo de conta" valor={ficha.bancoTipoConta} />
                <Ler rotulo="Banco" valor={ficha.bancoNome} />
                <Ler rotulo="Agência" valor={ficha.bancoAgencia} />
                <Ler rotulo="Conta" valor={ficha.bancoConta} />
              </>
            )}
          </div>

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Operação</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Ler rotulo="Contrato" valor={ficha.contrato} />
            <Ler rotulo="Grupo" valor={ficha.grupo} />
            <Ler rotulo="Cota" valor={ficha.cota} />
            <Ler rotulo="Bem" valor={analise.objetivo} />
            <Ler rotulo="Crédito" valor={brlOuTraco(analise.credito)} />
            <Ler rotulo="Parcela" valor={brlOuTraco(analise.parcela)} />
            <Ler rotulo="Lance" valor={analise.comLance ? brlOuTraco(analise.lanceValor) : "Sem lance"} />
            <Ler rotulo="% do lance" valor={analise.comLance ? pctOuTraco(analise.lancePct) : "—"} />
            <Ler rotulo="Forma de pagamento" valor={ficha.formaPagamento} />
            <Ler rotulo="Entrada" valor={brlOuTraco(ficha.valorEntrada)} />
            <Ler rotulo="Mês de participação" valor={ficha.mesParticipacao} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={ocupado}
            onClick={() => {
              setRascunho(ficha);
              setEditando(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Editar
          </Button>

          {!confirmada ? (
            <Button disabled={ocupado} onClick={() => void confirmar()}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar ficha
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={ocupado} onClick={() => void pdf("ver")}>
                <Eye className="h-4 w-4" /> Visualizar PDF
              </Button>
              <Button disabled={ocupado} onClick={() => void pdf("baixar")}>
                <Download className="h-4 w-4" /> Gerar ficha em PDF
              </Button>
              <Button variant="secondary" disabled={ocupado} onClick={() => void pdf("imprimir")}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </>
          )}
        </div>

        {!confirmada && (
          <p className="text-[11px] text-[var(--color-muted)]">
            O PDF definitivo só sai depois da confirmação — é o momento em que alguém olhou e disse que está certo.
          </p>
        )}
        {confirmada && ficha.pdfGeracoes > 0 && (
          <p className="text-[11px] text-[var(--color-muted)]">
            PDF gerado {ficha.pdfGeracoes}× · último em {dataHora(ficha.pdfGeradoEm)}
          </p>
        )}
      </div>
    );
  }

  /* --------------------------------- EDITAR --------------------------------- */
  if (!f) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <p className="text-[11px] text-[var(--color-text-dim)]">
          <span className="font-semibold text-[var(--color-text)]">Já preenchido pelo sistema:</span>{" "}
          {analise.nome}
          {analise.cpf ? ` · CPF ${analise.cpf}` : ""}
          {analise.telefone ? ` · ${telefoneBonito(analise.telefone)}` : ""}
          {analise.credito ? ` · crédito ${brlOuTraco(analise.credito)}` : ""}
        </p>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Consorciado</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <C rotulo="RG" valor={f.rg ?? ""} onChange={(v) => set("rg", v)} />
        <C rotulo="Órgão emissor" valor={f.orgaoEmissor ?? ""} onChange={(v) => set("orgaoEmissor", v)} ph="SSP/SE" />
        <C rotulo="Naturalidade" valor={f.naturalidade ?? ""} onChange={(v) => set("naturalidade", v)} />
        <C rotulo="Nacionalidade" valor={f.nacionalidade ?? ""} onChange={(v) => set("nacionalidade", v)} />
        <C rotulo="Nome da mãe" valor={f.nomeMae ?? ""} onChange={(v) => set("nomeMae", v)} span="sm:col-span-2" />
        <C rotulo="Nome do pai" valor={f.nomePai ?? ""} onChange={(v) => set("nomePai", v)} span="sm:col-span-2" />
      </div>
      <Opcoes rotulo="Estado civil" opcoes={ESTADOS_CIVIS} valor={f.estadoCivil ?? ""} onChange={(v) => set("estadoCivil", v)} />

      <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Cônjuge</p>
      <div className="flex flex-wrap gap-2">
        {[{ v: false, r: "Não possui" }, { v: true, r: "Possui cônjuge" }].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => set("temConjuge", o.v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              f.temConjuge === o.v
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)]"
            }`}
          >
            {o.r}
          </button>
        ))}
      </div>
      {f.temConjuge && (
        <div className="grid gap-3 sm:grid-cols-3">
          <C rotulo="Nome do cônjuge" valor={f.conjugeNome ?? ""} onChange={(v) => set("conjugeNome", v)} />
          <C rotulo="CPF" valor={f.conjugeCpf ?? ""} onChange={(v) => set("conjugeCpf", v)} />
          <C rotulo="Nascimento" tipo="date" valor={f.conjugeNascimento ?? ""} onChange={(v) => set("conjugeNascimento", v)} />
        </div>
      )}

      {/* CHECAGEM: a linha do formulário que antes só existia no papel. */}
      <C
        rotulo="Checagem"
        valor={f.checagem ?? ""}
        onChange={(v) => set("checagem", v)}
        ph="Conferência de quem recebe a ficha"
      />

      <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Endereço</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <C rotulo="CEP" valor={f.cep ?? ""} onChange={(v) => set("cep", v)} ph="49000-000" />
        <C rotulo="Bairro" valor={f.bairro ?? ""} onChange={(v) => set("bairro", v)} />
        <C rotulo="Endereço" valor={f.endereco ?? ""} onChange={(v) => set("endereco", v)} span="sm:col-span-2" />
        <C rotulo="Número" valor={f.numero ?? ""} onChange={(v) => set("numero", v)} />
        <C rotulo="Complemento" valor={f.complemento ?? ""} onChange={(v) => set("complemento", v)} />
        <C rotulo="Cidade" valor={f.cidade ?? ""} onChange={(v) => set("cidade", v)} />
        <Opcoes rotulo="Estado" opcoes={ESTADOS_BR} valor={f.estado ?? ""} onChange={(v) => set("estado", v)} />
      </div>

      <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Dados bancários</p>
      {/* ONDE O CLIENTE RECEBE. Não confundir com a forma de pagamento da
          operação, logo abaixo — aquela é como ele PAGA, e não foi tocada. */}
      <div>
        <Label>Tipo de recebimento</Label>
        <div className="flex flex-wrap gap-1.5">
          {MEIOS_BANCARIOS.map((m) => (
            <button
              key={m.chave}
              type="button"
              onClick={() => set("bancoMeio", m.chave as MeioBancario)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                f.bancoMeio === m.chave
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      {f.bancoMeio === "pix" ? (
        <>
          <div>
            <Label>Tipo de chave Pix</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS_CHAVE_PIX.map((t) => (
                <button
                  key={t.chave}
                  type="button"
                  onClick={() => set("pixTipo", f.pixTipo === t.chave ? "" : t.chave)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    f.pixTipo === t.chave
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                      : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>
          <C
            rotulo="Chave Pix"
            valor={f.pixChave ?? ""}
            onChange={(v) => set("pixChave", v)}
            ph={
              f.pixTipo === "cpf" ? "000.000.000-00"
              : f.pixTipo === "cnpj" ? "00.000.000/0000-00"
              : f.pixTipo === "email" ? "cliente@exemplo.com"
              : f.pixTipo === "telefone" ? "(79) 90000-0000"
              : "chave aleatória"
            }
          />
        </>
      ) : (
        <>
          <Opcoes rotulo="Tipo de conta" opcoes={TIPOS_CONTA} valor={f.bancoTipoConta ?? ""} onChange={(v) => set("bancoTipoConta", v)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <C rotulo="Banco" valor={f.bancoNome ?? ""} onChange={(v) => set("bancoNome", v)} />
            <C rotulo="Agência" valor={f.bancoAgencia ?? ""} onChange={(v) => set("bancoAgencia", v)} />
            <C rotulo="Conta" valor={f.bancoConta ?? ""} onChange={(v) => set("bancoConta", v)} />
          </div>
        </>
      )}

      <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Operação</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <C rotulo="Contrato" valor={f.contrato ?? ""} onChange={(v) => set("contrato", v)} />
        <C rotulo="Grupo" valor={f.grupo ?? ""} onChange={(v) => set("grupo", v)} />
        <C rotulo="Cota" valor={f.cota ?? ""} onChange={(v) => set("cota", v)} />
        {/* O papel tem "Grupo: ___ Crédito: ___" na mesma caixa, mas não
            havia onde digitar: o PDF puxava da análise e saía em branco
            quando ela vinha sem valor. Fica ao lado do Grupo, como no papel. */}
        <C
          rotulo="Crédito"
          valor={f.credito != null ? String(f.credito) : ""}
          onChange={(v) => set("credito", soNum(v))}
          ph="Valor do crédito"
        />
        <C rotulo="Valor de entrada" valor={f.valorEntrada != null ? String(f.valorEntrada) : ""} onChange={(v) => set("valorEntrada", soNum(v))} />
        <C rotulo="Mês de participação" valor={f.mesParticipacao ?? ""} onChange={(v) => set("mesParticipacao", v)} ph="Setembro/2026" />
      </div>
      <Opcoes rotulo="Forma de pagamento" opcoes={FORMAS_PAGAMENTO} valor={f.formaPagamento ?? ""} onChange={(v) => set("formaPagamento", v)} />

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          disabled={ocupado}
          onClick={() => {
            setEditando(false);
            setRascunho(null);
          }}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar sem salvar
        </Button>
        <Button disabled={ocupado} onClick={() => void salvarEConferir()}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Salvar e conferir
        </Button>
      </div>
    </div>
  );
}
