"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";

import { brl, monthLabel } from "@/lib/utils";
import { PERCENTUAIS, type Situacao } from "@/lib/financeiro";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * FINANCEIRO ESTRATÉGICO — a tela do administrador.
 *
 * Só apresenta e envia. Toda conta sai de `lib/financeiro.ts` pela rota
 * `/api/financeiro`, que exige admin — a tela nunca recalcula percentual por
 * conta própria, senão um dia ela mostraria um número e o fechamento gravaria
 * outro.
 *
 * A linguagem é deliberadamente simples: "guardar para a empresa", "separar
 * para impostos", "quanto ainda posso gastar". Nada de "retido", "provisão"
 * ou "forecast".
 */

type Linha = {
  destino: "guardar" | "prolabore" | "impostos" | "operacao";
  rotulo: string;
  planejado: number;
  realizado: number;
  ehLimite: boolean;
  diferenca: number;
  situacao: Situacao;
  estado: string;
};

type Lancamento = {
  id: string;
  direcao: "entrada" | "saida";
  tipo: "fixo" | "variavel" | "recebimento";
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  operacao: boolean;
  status: "pendente" | "liquidado";
  situacao: "pendente" | "liquidado" | "atrasado";
  valor_pago: number | null;
};

type Fixo = {
  id: string;
  nome: string;
  valor: number;
  dia_vencimento: number;
  categoria: string;
  ativo: boolean;
};

type Dados = {
  chave: string;
  faturamento: number;
  faturamentoVendas: number;
  observacao: string | null;
  fechadoEm: string | null;
  plano: {
    faturamento: number;
    limites: Record<string, number>;
    linhas: Linha[];
    mantidoNaEmpresa: number;
    operacaoDisponivel: number;
    operacaoExcedente: number;
  };
  diagnostico: { situacao: Situacao; titulo: string; pontos: string[] };
  caixa: { disponivel: number; aReceber: number; aPagar: number; projetado: number };
  projecao: { chave: string; entradas: number; saidas: number; resultado: number; saldo: number }[];
  historico: {
    chave: string;
    faturamento: number;
    guardado: number;
    prolaboreUsado: number;
    impostoSeparado: number;
    mantidoNaEmpresa: number;
    operacaoGasta: number;
  }[];
  acumuladoMantido: number;
  acumuladoGuardado: number;
  fixos: Fixo[];
  lancamentos: Lancamento[];
  totais: { fixos: number; variaveis: number; pagos: number; pendentes: number; atrasados: number };
};

/* ------------------------------------------------------------- pecinhas */

const CORES: Record<Situacao, string> = {
  ok: "text-emerald-400",
  atencao: "text-amber-300",
  acima: "text-rose-400",
};
const PONTO: Record<Situacao, string> = {
  ok: "bg-emerald-400",
  atencao: "bg-amber-300",
  acima: "bg-rose-400",
};

function Bloco({
  titulo,
  sub,
  children,
  acao,
}: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50">{titulo}</h3>
          {sub && <p className="mt-0.5 text-xs text-white/45">{sub}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  cor,
  sub,
}: {
  rotulo: string;
  valor: number;
  cor?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{rotulo}</p>
      <p className={`mt-0.5 truncate text-base font-bold ${cor ?? "text-white"}`}>{brl(valor)}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

/** Campo de dinheiro que não come o separador enquanto se digita. */
function Moeda({
  id,
  label,
  valor,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  valor: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState(valor ? String(valor).replace(".", ",") : "");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0,00"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, "");
          setTexto(t);
          onChange(Number(t.replace(/\./g, "").replace(",", ".")) || 0);
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- tela */

export function FinanceiroEstrategico({ chaveInicial }: { chaveInicial: string }) {
  const [chave, setChave] = useState(chaveInicial);
  const [d, setD] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<Record<string, boolean>>({ plano: true, caixa: true });

  // rascunho dos campos do mês
  const [fat, setFat] = useState(0);
  const [guardado, setGuardado] = useState(0);
  const [prolabore, setProlabore] = useState(0);
  const [imposto, setImposto] = useState(0);
  const [obs, setObs] = useState("");

  const carregar = useCallback(async (ch: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/financeiro?chave=${encodeURIComponent(ch)}`);
      if (!r.ok) throw new Error(r.status === 403 ? "Só administradores" : "Falha ao consultar");
      const j = (await r.json()) as Dados;
      setD(j);
      setFat(j.faturamento);
      setGuardado(j.plano.linhas.find((l) => l.destino === "guardar")?.realizado ?? 0);
      setProlabore(j.plano.linhas.find((l) => l.destino === "prolabore")?.realizado ?? 0);
      setImposto(j.plano.linhas.find((l) => l.destino === "impostos")?.realizado ?? 0);
      setObs(j.observacao ?? "");
    } catch (e) {
      notify.error("Financeiro", e instanceof Error ? e.message : undefined);
      setD(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  // fora do corpo do efeito: React 19 proíbe setState síncrono em effect
  useEffect(() => {
    const t = setTimeout(() => void carregar(chave), 0);
    return () => clearTimeout(t);
  }, [carregar, chave]);

  async function enviar(corpo: Record<string, unknown>, aviso: string) {
    setSalvando(true);
    try {
      const r = await fetch("/api/financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, ...corpo }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Não consegui salvar");
      notify.success(aviso);
      await carregar(chave);
    } catch (e) {
      notify.error("Erro", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  const mesesLista = useMemo(() => {
    const set = new Set<string>([chaveInicial, chave, ...(d?.historico.map((h) => h.chave) ?? [])]);
    // 12 meses para trás, para o admin poder lançar mês anterior
    const [y, m] = chaveInicial.split("-").map(Number);
    for (let i = 1; i <= 12; i++) {
      const x = new Date(y, m - 1 - i, 1);
      set.add(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(set).sort().reverse();
  }, [chaveInicial, chave, d?.historico]);

  if (carregando && !d) {
    return <div className="rounded-2xl border border-white/10 p-6 text-sm text-white/50">Carregando o financeiro…</div>;
  }
  if (!d) return null;

  const fechado = !!d.fechadoEm;
  const toggle = (k: string) => setAberto((a) => ({ ...a, [k]: !a[k] }));

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">Controle do dinheiro</h2>
            <p className="text-xs text-white/50">
              Só o administrador vê esta área · ciclo de {monthLabel(chave)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white backdrop-blur"
          >
            {mesesLista.map((m) => (
              <option key={m} value={m} className="bg-[#0b0d16]">
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => void carregar(chave)} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------- diagnóstico */}
      <div
        className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${
          d.diagnostico.situacao === "ok"
            ? "border-emerald-500/30 bg-emerald-500/8"
            : d.diagnostico.situacao === "atencao"
              ? "border-amber-400/30 bg-amber-400/8"
              : "border-rose-500/30 bg-rose-500/8"
        }`}
      >
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${PONTO[d.diagnostico.situacao]}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${CORES[d.diagnostico.situacao]}`}>{d.diagnostico.titulo}</p>
          {d.diagnostico.pontos.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-white/70">
              {d.diagnostico.pontos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        {fechado && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70">
            <Lock className="h-3 w-3" /> mês fechado
          </span>
        )}
      </div>

      {/* --------------------------------------------- faturamento do mês */}
      <Bloco
        titulo="Quanto a empresa faturou neste mês"
        sub={`As vendas do CRM somam ${brl(d.faturamentoVendas)} neste ciclo — informe abaixo o valor que você considera realizado.`}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Moeda id="fat" label="Faturamento realizado" valor={fat} onChange={setFat} disabled={fechado} />
          <Moeda id="gua" label="Já guardei para a empresa" valor={guardado} onChange={setGuardado} disabled={fechado} />
          <Moeda id="pro" label="Já retirei de pró-labore" valor={prolabore} onChange={setProlabore} disabled={fechado} />
          <Moeda id="imp" label="Já separei para impostos" valor={imposto} onChange={setImposto} disabled={fechado} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="obs">Observação do mês (opcional)</Label>
            <Input
              id="obs"
              value={obs}
              disabled={fechado}
              placeholder="o que explica este mês"
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
          <Button
            disabled={salvando || fechado}
            onClick={() =>
              void enviar(
                { acao: "salvar-mes", faturamento: fat, guardado, prolaboreUsado: prolabore, impostoSeparado: imposto, observacao: obs },
                "Mês atualizado",
              )
            }
          >
            Salvar
          </Button>
        </div>
      </Bloco>

      {/* -------------------------------------------- planejado x realizado */}
      <Bloco
        titulo="Para onde vai o dinheiro"
        sub={`${PERCENTUAIS.guardar}% guardar · ${PERCENTUAIS.prolabore}% limite do pró-labore · ${PERCENTUAIS.impostos}% impostos · ${PERCENTUAIS.operacao}% operação`}
        acao={
          <button type="button" onClick={() => toggle("plano")} className="text-white/40">
            <ChevronDown className={`h-4 w-4 transition-transform ${aberto.plano ? "rotate-180" : ""}`} />
          </button>
        }
      >
        {aberto.plano && (
          <div className="space-y-2">
            {d.plano.linhas.map((l) => (
              <div
                key={l.destino}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[l.situacao]}`} />
                <span className="min-w-[150px] flex-1 text-sm font-medium text-white">{l.rotulo}</span>
                <span className="text-xs text-white/50">
                  {l.ehLimite ? "limite" : "meta"} <span className="font-semibold text-white/80">{brl(l.planejado)}</span>
                </span>
                <span className="text-xs text-white/50">
                  {l.ehLimite ? "usado" : "feito"} <span className="font-semibold text-white/80">{brl(l.realizado)}</span>
                </span>
                {l.diferenca > 0 && (
                  <span className={`text-xs font-semibold ${CORES[l.situacao]}`}>
                    {l.situacao === "acima" ? "passou em " : l.ehLimite ? "sobrou " : "falta "}
                    {brl(l.diferenca)}
                  </span>
                )}
                <span className={`text-xs font-bold ${CORES[l.situacao]}`}>{l.estado}</span>
              </div>
            ))}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Numero
                rotulo="Valor mantido na empresa"
                valor={d.plano.mantidoNaEmpresa}
                cor="text-emerald-400"
                sub="a parte do pró-labore que você não retirou"
              />
              <Numero
                rotulo="Ainda posso gastar na operação"
                valor={d.plano.operacaoDisponivel}
                cor={d.plano.operacaoExcedente > 0 ? "text-rose-400" : "text-white"}
                sub={d.plano.operacaoExcedente > 0 ? `passou em ${brl(d.plano.operacaoExcedente)}` : undefined}
              />
              <Numero
                rotulo="Mantido na empresa (acumulado)"
                valor={d.acumuladoMantido}
                sub={`lucro guardado até hoje: ${brl(d.acumuladoGuardado)}`}
              />
            </div>
          </div>
        )}
      </Bloco>

      {/* ------------------------------------------------------------ caixa */}
      <Bloco
        titulo="Caixa"
        sub="Dinheiro que já entrou fica separado do que ainda vai entrar — de propósito."
      >
        <div className="grid gap-2 sm:grid-cols-4">
          <Numero rotulo="Tenho hoje" valor={d.caixa.disponivel} cor="text-emerald-400" sub="já entrou, menos o que já saiu" />
          <Numero rotulo="Ainda vou receber" valor={d.caixa.aReceber} sub="previsto, ainda não entrou" />
          <Numero rotulo="Tenho para pagar" valor={d.caixa.aPagar} cor="text-amber-300" sub="compromissos em aberto" />
          <Numero
            rotulo="Previsão de caixa"
            valor={d.caixa.projetado}
            cor={d.caixa.projetado < 0 ? "text-rose-400" : "text-white"}
            sub="tenho + vou receber − vou pagar"
          />
        </div>
      </Bloco>

      {/* ------------------------------------------------------- projeção */}
      <Bloco titulo="Previsão dos próximos meses" sub="Parte do dinheiro que você tem hoje e vai somando o que está cadastrado.">
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="pb-2">Mês</th>
                <th className="pb-2 text-right">Vai entrar</th>
                <th className="pb-2 text-right">Vai sair</th>
                <th className="pb-2 text-right">Resultado</th>
                <th className="pb-2 text-right">Saldo previsto</th>
              </tr>
            </thead>
            <tbody>
              {d.projecao.map((p, i) => (
                <tr key={p.chave} className={`border-t border-white/5 ${i === 2 ? "border-t-white/20" : ""}`}>
                  <td className="py-2 text-white/80">
                    {monthLabel(p.chave)}
                    {i === 2 && <span className="ml-2 text-[10px] text-white/35">fim dos 3 meses</span>}
                    {i === 5 && <span className="ml-2 text-[10px] text-white/35">fim dos 6 meses</span>}
                  </td>
                  <td className="py-2 text-right text-white/70">{brl(p.entradas)}</td>
                  <td className="py-2 text-right text-white/70">{brl(p.saidas)}</td>
                  <td className={`py-2 text-right font-semibold ${p.resultado < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {brl(p.resultado)}
                  </td>
                  <td className={`py-2 text-right font-bold ${p.saldo < 0 ? "text-rose-400" : "text-white"}`}>
                    {brl(p.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      {/* --------------------------------------------------- gastos fixos */}
      <GastosFixos
        fixos={d.fixos}
        chave={chave}
        fechado={fechado}
        salvando={salvando}
        onEnviar={enviar}
      />

      {/* ----------------------------------------- lançamentos do mês */}
      <Lancamentos
        lista={d.lancamentos}
        totais={d.totais}
        fechado={fechado}
        salvando={salvando}
        onEnviar={enviar}
      />

      {/* ----------------------------------------------------- histórico */}
      {d.historico.length > 0 && (
        <Bloco titulo="Meses anteriores" sub="Para comparar como foi cada mês.">
          <div className="lb-scroll overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="pb-2">Mês</th>
                  <th className="pb-2 text-right">Faturamento</th>
                  <th className="pb-2 text-right">Guardado</th>
                  <th className="pb-2 text-right">Pró-labore</th>
                  <th className="pb-2 text-right">Mantido na empresa</th>
                  <th className="pb-2 text-right">Impostos</th>
                  <th className="pb-2 text-right">Operação</th>
                </tr>
              </thead>
              <tbody>
                {d.historico.map((h) => (
                  <tr key={h.chave} className="border-t border-white/5">
                    <td className="py-2 text-white/80">{monthLabel(h.chave)}</td>
                    <td className="py-2 text-right text-white/80">{brl(h.faturamento)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.guardado)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.prolaboreUsado)}</td>
                    <td className="py-2 text-right font-semibold text-emerald-400">{brl(h.mantidoNaEmpresa)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.impostoSeparado)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.operacaoGasta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      {/* -------------------------------------------------- fechar o mês */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {fechado ? "Este mês está fechado" : "Fechar o mês"}
          </p>
          <p className="text-xs text-white/50">
            {fechado
              ? "O histórico está guardado. Só o administrador pode reabrir para alterar."
              : "Depois de fechar, os lançamentos deste mês ficam travados. Só você pode reabrir."}
          </p>
        </div>
        <Button
          variant={fechado ? "ghost" : "primary"}
          disabled={salvando}
          onClick={() => {
            if (!fechado && !confirm(`Fechar o mês de ${monthLabel(chave)}? Os lançamentos ficam travados até você reabrir.`)) return;
            void enviar({ acao: fechado ? "reabrir" : "fechar" }, fechado ? "Mês reaberto" : "Mês fechado");
          }}
        >
          {fechado ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {fechado ? "Reabrir mês" : "Fechar mês"}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- gastos fixos */

const CATEGORIAS_FIXAS = ["Aluguel", "Contabilidade", "Advogado", "FGTS", "Salários", "Internet", "Sistemas", "Outros"];

function GastosFixos({
  fixos,
  chave,
  fechado,
  salvando,
  onEnviar,
}: {
  fixos: Fixo[];
  chave: string;
  fechado: boolean;
  salvando: boolean;
  onEnviar: (corpo: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [dia, setDia] = useState(10);
  const [cat, setCat] = useState(CATEGORIAS_FIXAS[0]);
  const ativos = fixos.filter((f) => f.ativo);
  const total = ativos.reduce((a, f) => a + f.valor, 0);

  return (
    <Bloco
      titulo="Gastos fixos"
      sub={`Cadastre uma vez e o compromisso nasce todo mês. ${ativos.length} ativo(s), somando ${brl(total)}.`}
      acao={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={salvando || fechado || ativos.length === 0}
            onClick={() => void onEnviar({ acao: "gerar-fixos" }, "Compromissos do mês gerados")}
          >
            <CalendarClock className="h-4 w-4" /> Gerar em {monthLabel(chave)}
          </Button>
          <Button variant="ghost" onClick={() => setNovo((v) => !v)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      {novo && (
        <div className="mb-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label htmlFor="fnome">Nome da despesa</Label>
            <Input id="fnome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Aluguel" />
          </div>
          <Moeda id="fvalor" label="Valor" valor={valor} onChange={setValor} />
          <div>
            <Label htmlFor="fdia">Dia do vencimento</Label>
            <Input id="fdia" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label htmlFor="fcat">Categoria</Label>
            <select
              id="fcat"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              {CATEGORIAS_FIXAS.map((c) => (
                <option key={c} value={c} className="bg-[#0b0d16]">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-5">
            <Button
              disabled={salvando || !nome.trim()}
              onClick={async () => {
                await onEnviar({ acao: "salvar-fixo", nome, valor, diaVencimento: dia, categoria: cat }, "Gasto fixo cadastrado");
                setNome("");
                setValor(0);
                setNovo(false);
              }}
            >
              Cadastrar
            </Button>
          </div>
        </div>
      )}

      {fixos.length === 0 ? (
        <p className="text-xs text-white/45">Nenhum gasto fixo cadastrado ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {fixos.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={`min-w-[140px] flex-1 truncate ${f.ativo ? "text-white" : "text-white/35 line-through"}`}>
                {f.nome}
              </span>
              <span className="text-xs text-white/45">{f.categoria}</span>
              <span className="text-xs text-white/45">dia {f.dia_vencimento}</span>
              <span className="font-semibold text-white/80">{brl(f.valor)}</span>
              <button
                type="button"
                disabled={salvando}
                onClick={() =>
                  void onEnviar(
                    { acao: "salvar-fixo", id: f.id, nome: f.nome, valor: f.valor, diaVencimento: f.dia_vencimento, categoria: f.categoria, ativo: !f.ativo },
                    f.ativo ? "Gasto fixo desativado" : "Gasto fixo reativado",
                  )
                }
                className="text-[11px] font-semibold text-white/50 hover:text-white"
              >
                {f.ativo ? "desativar" : "reativar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

/* ----------------------------------------------------------- lançamentos */

const CATEGORIAS_VAR = ["Meta Ads", "Google Ads", "Lista fria", "Passagens", "Premiações", "Material", "Eventos", "Outros"];

function Lancamentos({
  lista,
  totais,
  fechado,
  salvando,
  onEnviar,
}: {
  lista: Lancamento[];
  totais: { fixos: number; variaveis: number; pagos: number; pendentes: number; atrasados: number };
  fechado: boolean;
  salvando: boolean;
  onEnviar: (corpo: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  const [novo, setNovo] = useState(false);
  const [direcao, setDirecao] = useState<"saida" | "entrada">("saida");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState(0);
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState(CATEGORIAS_VAR[0]);
  const [operacao, setOperacao] = useState(true);

  const rotuloSit: Record<Lancamento["situacao"], string> = {
    pendente: "Pendente",
    liquidado: "Pago",
    atrasado: "Atrasado",
  };
  const corSit: Record<Lancamento["situacao"], string> = {
    pendente: "text-amber-300",
    liquidado: "text-emerald-400",
    atrasado: "text-rose-400",
  };

  return (
    <Bloco
      titulo="Gastos e recebimentos do mês"
      sub="Gastos que variam (anúncios, passagens, premiações) e dinheiro previsto para entrar."
      acao={
        <Button variant="ghost" onClick={() => setNovo((v) => !v)} disabled={fechado}>
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-5">
        <Numero rotulo="Gastos fixos" valor={totais.fixos} />
        <Numero rotulo="Gastos variáveis" valor={totais.variaveis} />
        <Numero rotulo="Já pago" valor={totais.pagos} cor="text-emerald-400" />
        <Numero rotulo="Pendente" valor={totais.pendentes} cor="text-amber-300" />
        <Numero rotulo="Atrasado" valor={totais.atrasados} cor={totais.atrasados > 0 ? "text-rose-400" : undefined} />
      </div>

      {novo && (
        <div className="mb-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-6">
          <div>
            <Label htmlFor="ldir">Tipo</Label>
            <select
              id="ldir"
              value={direcao}
              onChange={(e) => setDirecao(e.target.value as "saida" | "entrada")}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              <option value="saida" className="bg-[#0b0d16]">Vou pagar</option>
              <option value="entrada" className="bg-[#0b0d16]">Vou receber</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ldesc">Descrição</Label>
            <Input id="ldesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Meta Ads setembro" />
          </div>
          <Moeda id="lval" label="Valor" valor={valor} onChange={setValor} />
          <div>
            <Label htmlFor="lvenc">Vencimento</Label>
            <Input id="lvenc" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lcat">Categoria</Label>
            <select
              id="lcat"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              {CATEGORIAS_VAR.map((c) => (
                <option key={c} value={c} className="bg-[#0b0d16]">
                  {c}
                </option>
              ))}
            </select>
          </div>
          {direcao === "saida" && (
            <label className="flex items-center gap-2 text-xs text-white/70 sm:col-span-3">
              <input type="checkbox" checked={operacao} onChange={(e) => setOperacao(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Conta no limite de {PERCENTUAIS.operacao}% da operação
              <span className="text-white/35">(aluguel e salário, por exemplo, não contam)</span>
            </label>
          )}
          <div className="sm:col-span-3">
            <Button
              disabled={salvando || !desc.trim()}
              onClick={async () => {
                await onEnviar(
                  {
                    acao: "salvar-lancamento",
                    direcao,
                    tipo: direcao === "entrada" ? "recebimento" : "variavel",
                    descricao: desc,
                    valor,
                    vencimento: venc,
                    categoria: cat,
                    operacao: direcao === "saida" ? operacao : false,
                  },
                  "Lançamento registrado",
                );
                setDesc("");
                setValor(0);
                setNovo(false);
              }}
            >
              Registrar
            </Button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="text-xs text-white/45">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${l.direcao === "entrada" ? "bg-emerald-400" : "bg-white/30"}`} />
              <span className="min-w-[130px] flex-1 truncate text-white">{l.descricao}</span>
              <span className="text-xs text-white/40">{l.categoria}</span>
              {l.operacao && <span className="text-[10px] font-semibold text-[var(--color-brand)]">operação</span>}
              <span className="text-xs text-white/40">
                {l.vencimento.slice(8, 10)}/{l.vencimento.slice(5, 7)}
              </span>
              <span className={`font-semibold ${l.direcao === "entrada" ? "text-emerald-400" : "text-white/80"}`}>
                {l.direcao === "entrada" ? "+" : "−"}
                {brl(l.valor)}
              </span>
              <span className={`text-[11px] font-bold ${corSit[l.situacao]}`}>
                {l.direcao === "entrada" && l.situacao === "liquidado" ? "Recebido" : rotuloSit[l.situacao]}
              </span>
              {!fechado && (
                <>
                  {l.status === "pendente" ? (
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => void onEnviar({ acao: "liquidar", id: l.id }, l.direcao === "entrada" ? "Recebimento registrado" : "Pagamento registrado")}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline"
                    >
                      <CheckCircle2 className="h-3 w-3" /> {l.direcao === "entrada" ? "recebi" : "paguei"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => void onEnviar({ acao: "desfazer-liquidacao", id: l.id }, "Desfeito")}
                      className="text-[11px] text-white/40 hover:text-white"
                    >
                      desfazer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => {
                      if (confirm(`Remover "${l.descricao}"?`)) void onEnviar({ acao: "remover-lancamento", id: l.id }, "Removido");
                    }}
                    className="text-white/30 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {totais.atrasados > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {brl(totais.atrasados)} com vencimento já passado.
        </p>
      )}
    </Bloco>
  );
}
