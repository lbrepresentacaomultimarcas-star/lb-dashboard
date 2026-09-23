"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";

import { brl, monthLabel } from "@/lib/utils";
import { cicloPorChave } from "@/lib/ciclo";
import { useCicloProducao } from "@/lib/use-ciclo";
import { PERCENTUAIS, type Situacao } from "@/lib/financeiro";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * FINANCEIRO ESTRATÉGICO — a tela do administrador.
 *
 * O PRINCÍPIO, e a razão desta tela ter sido reorganizada:
 *
 *   O ADMIN INFORMA O FATURAMENTO.
 *   O SISTEMA CALCULA A DISTRIBUIÇÃO.
 *   O ADMIN SÓ CONFIRMA OU ALTERA O QUE REALMENTE FEZ.
 *
 * Antes, informar o faturamento mostrava os percentuais mas deixava todos os
 * realizados em R$ 0,00, e cada número só saía do zero com lançamento manual.
 * Agora a distribuição aparece calculada na hora, cada destinação já vem com o
 * valor recomendado no campo, e confirmar é um clique.
 *
 * O que NÃO mudou de propósito: a conta continua saindo inteira de
 * `lib/financeiro.ts` pela rota `/api/financeiro` (que exige admin). A tela
 * nunca recalcula percentual por conta própria — senão um dia ela mostraria um
 * número e o fechamento gravaria outro.
 *
 * A linguagem é deliberadamente simples: "guardar para a empresa", "valor
 * mantido na empresa", "quanto ainda posso gastar". Nada de "retido",
 * "provisão" ou "forecast".
 */

type Destino = "guardar" | "prolabore" | "impostos" | "operacao";

type Linha = {
  destino: Destino;
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
  gasto_fixo_id: string | null;
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
  /** Ocorrência deste gasto no mês selecionado — null = ainda não gerada. */
  lancamentoId: string | null;
  valorNoMes: number;
  vencimento: string | null;
  status: "previsto" | "pendente" | "atrasado" | "pago";
};

type Dados = {
  chave: string;
  faturamento: number;
  faturamentoVendas: number;
  observacao: string | null;
  fechadoEm: string | null;
  plano: {
    faturamento: number;
    limites: Record<Destino, number>;
    linhas: Linha[];
    mantidoNaEmpresa: number;
    operacaoDisponivel: number;
    operacaoExcedente: number;
    operacaoPaga: number;
    operacaoAPagar: number;
  };
  diagnostico: { situacao: Situacao; titulo: string; pontos: string[] };
  caixa: { disponivel: number; aReceber: number; aPagar: number; projetado: number };
  caixaMov: { entrou: number; saiu: number };
  caixaEmpresa: number;
  resumo: {
    faturamento: number;
    guardado: number;
    prolaboreRetirado: number;
    impostoSeparado: number;
    operacaoUtilizada: number;
    gastosPagos: number;
    naoDestinado: number;
  };
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
  totais: {
    fixosPrevisto: number;
    fixosPago: number;
    fixosPendente: number;
    fixosNaoGerado: number;
    fixos: number;
    variaveis: number;
    pagos: number;
    pendentes: number;
    atrasados: number;
  };
};

/* ------------------------------------------------------------------ peças */

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

/** Bloco numerado — a ordem dos passos é a própria explicação da tela. */
function Passo({
  numero,
  titulo,
  sub,
  children,
  acao,
}: {
  numero?: number;
  titulo: string;
  sub?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {numero !== undefined && (
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-bold text-white/70">
              {numero}
            </span>
          )}
          <div>
            <h3 className="text-sm font-bold text-white">{titulo}</h3>
            {sub && <p className="mt-0.5 text-xs text-white/45">{sub}</p>}
          </div>
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
  destaque,
}: {
  rotulo: string;
  valor: number;
  cor?: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-2.5 ${
        destaque ? "border-white/20 bg-white/[0.07]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{rotulo}</p>
      <p className={`mt-0.5 truncate text-base font-bold ${cor ?? "text-white"}`}>{brl(valor)}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

/**
 * Campo de dinheiro que não come o separador enquanto se digita.
 *
 * O `ultimo` existe por um bug que fazia o financeiro parecer bagunçado: o
 * texto digitado ficava guardado só aqui dentro, então ao trocar de mês no
 * seletor o campo continuava exibindo o valor do mês anterior. Setembro
 * mostrava 38.509,94 e, ao abrir outubro, o mesmo 38.509,94 seguia na tela
 * mesmo com o banco vazio — parecia que o mês novo tinha herdado os valores.
 * Comparar com o último valor recebido de fora ressincroniza o campo.
 */
function Moeda({
  id,
  label,
  valor,
  onChange,
  disabled,
  dica,
}: {
  id: string;
  label: string;
  valor: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  dica?: string;
}) {
  const escrever = (n: number) => (n ? String(n).replace(".", ",") : "");
  const [texto, setTexto] = useState(() => escrever(valor));
  const [ultimo, setUltimo] = useState(valor);
  if (valor !== ultimo) {
    // ajuste de estado por mudança de prop — padrão do React, sem efeito
    setUltimo(valor);
    setTexto(escrever(valor));
  }
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
      {dica && <p className="mt-1 text-[11px] text-white/40">{dica}</p>}
    </div>
  );
}

const ROTULO_SITUACAO: Record<Lancamento["situacao"], string> = {
  pendente: "Pendente",
  liquidado: "Pago",
  atrasado: "Atrasado",
};
const COR_SITUACAO: Record<Lancamento["situacao"], string> = {
  pendente: "text-amber-300",
  liquidado: "text-emerald-400",
  atrasado: "text-rose-400",
};

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ------------------------------------------------------------------- tela */

export function FinanceiroEstrategico({ chaveInicial }: { chaveInicial: string }) {
  const [chave, setChave] = useState(chaveInicial);
  /*
   * A JANELA DO CICLO, ESCRITA NA TELA.
   *
   * O mês do financeiro é o CICLO de produção (fecha dia 20), o mesmo do
   * ranking e das metas — não o mês do calendário. Só que a tela dizia apenas
   * "outubro de 2026", e o ciclo de outubro começa em 22 de SETEMBRO. Quem
   * abrisse a tela no fim de setembro lançava o faturamento acreditando estar
   * em setembro e o valor caía no ciclo de outubro: o mês "recebia valores
   * sozinho". Com a janela escrita ao lado do nome, não há como confundir.
   */
  const { config, feriados } = useCicloProducao();
  const janela = useCallback(
    (ch: string) => {
      try {
        const { inicio, fim } = cicloPorChave(ch, config, feriados);
        const f = (dt: Date) => dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return `${f(inicio)} a ${f(fim)}`;
      } catch {
        return "";
      }
    },
    [config, feriados],
  );
  const [d, setD] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // rascunho dos campos do mês (o que está digitado, ainda não gravado)
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
      const feito = (dest: Destino) => j.plano.linhas.find((l) => l.destino === dest)?.realizado ?? 0;
      setD(j);
      setFat(j.faturamento);
      setObs(j.observacao ?? "");
      /*
       * Os campos vêm PREENCHIDOS com o recomendado quando nada foi confirmado
       * ainda — é o que transforma "vários lançamentos manuais" em um clique.
       * O que está no campo é sugestão; o que aparece como "já feito" é só o
       * que foi gravado. Pró-labore nunca é sugerido: os 50% são limite, e
       * supor retirada seria inventar um saque que não aconteceu.
       */
      setGuardado(feito("guardar") || j.plano.limites.guardar);
      setImposto(feito("impostos") || j.plano.limites.impostos);
      setProlabore(feito("prolabore"));
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

  const enviar = useCallback(
    async (corpo: Record<string, unknown>, aviso: string) => {
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
    },
    [chave, carregar],
  );

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
    return (
      <div className="rounded-2xl border border-white/10 p-6 text-sm text-white/50">
        Carregando o financeiro…
      </div>
    );
  }
  if (!d) return null;

  const fechado = !!d.fechadoEm;
  const semFaturamento = d.plano.faturamento <= 0;
  const feito = (dest: Destino) => d.plano.linhas.find((l) => l.destino === dest)?.realizado ?? 0;
  const linha = (dest: Destino) => d.plano.linhas.find((l) => l.destino === dest);

  /**
   * Grava o mês mudando SÓ o que a ação nomeia.
   *
   * O resto vai com o valor que está no banco, não com o que está digitado na
   * tela. Assim confirmar o imposto não grava de tabela uma sugestão de
   * pró-labore que o admin nunca confirmou.
   */
  const salvarMes = (patch: Record<string, unknown>, aviso: string) =>
    enviar(
      {
        acao: "salvar-mes",
        faturamento: d.faturamento,
        guardado: feito("guardar"),
        prolaboreUsado: feito("prolabore"),
        impostoSeparado: feito("impostos"),
        observacao: d.observacao ?? "",
        ...patch,
      },
      aviso,
    );

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------- cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">Controle do dinheiro</h2>
            <p className="text-xs text-white/50">
              Só o administrador vê esta área · ciclo de {monthLabel(chave)} ({janela(chave)}) ·
              cada mês tem os próprios números
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
                {monthLabel(m)} · {janela(m)}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => void carregar(chave)} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------- diagnóstico */}
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

      {/* ----------------------------------------- 1. FATURAMENTO DO MÊS */}
      <Passo
        numero={1}
        titulo="Quanto a empresa faturou neste mês"
        sub={`Ciclo de ${monthLabel(chave)}, que vai de ${janela(chave)}. As vendas do CRM somam ${brl(d.faturamentoVendas)} nesse período — informe abaixo o valor que você considera realizado.`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Moeda
              id="fat"
              label="Faturamento realizado"
              valor={fat}
              onChange={setFat}
              disabled={fechado}
            />
          </div>
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
            onClick={() => void salvarMes({ faturamento: fat, observacao: obs }, "Faturamento salvo")}
          >
            Salvar faturamento
          </Button>
        </div>
        {d.faturamentoVendas > 0 && Math.abs(d.faturamentoVendas - d.faturamento) > 0.01 && (
          <p className="mt-2 text-[11px] text-white/40">
            Diferença de {brl(Math.abs(d.faturamentoVendas - d.faturamento))} em relação às vendas do
            CRM. Os dois números aparecem lado a lado de propósito — a diferença é informação, não
            erro.
          </p>
        )}
      </Passo>

      {/* -------------------------------------- 2. DISTRIBUIÇÃO AUTOMÁTICA */}
      <Passo
        numero={2}
        titulo="Distribuição automática"
        sub={`Calculada na hora sobre o faturamento: ${PERCENTUAIS.guardar}% guardar · ${PERCENTUAIS.prolabore}% limite do pró-labore · ${PERCENTUAIS.impostos}% impostos · ${PERCENTUAIS.operacao}% operação.`}
      >
        {semFaturamento ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/8 px-3 py-2.5 text-xs text-amber-200">
            Informe o faturamento acima e os quatro valores aparecem aqui calculados. Este mês começa
            zerado porque ainda não tem nenhum lançamento próprio — nada é copiado de outro mês.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-4">
            <Numero
              rotulo={`Guardar para a empresa · ${PERCENTUAIS.guardar}%`}
              valor={d.plano.limites.guardar}
              cor="text-emerald-400"
              sub="lucro que não se mexe"
              destaque
            />
            <Numero
              rotulo={`Limite do pró-labore · ${PERCENTUAIS.prolabore}%`}
              valor={d.plano.limites.prolabore}
              sub="limite, não obrigação de retirar"
              destaque
            />
            <Numero
              rotulo={`Separar para impostos · ${PERCENTUAIS.impostos}%`}
              valor={d.plano.limites.impostos}
              cor="text-amber-300"
              sub="tem que sair do caixa"
              destaque
            />
            <Numero
              rotulo={`Operação · ${PERCENTUAIS.operacao}%`}
              valor={d.plano.limites.operacao}
              sub="orçamento do mês"
              destaque
            />
          </div>
        )}
      </Passo>

      {/* ------------------------------ 3. QUANTO REALMENTE FOI SEPARADO */}
      <Passo
        numero={3}
        titulo="Quanto você realmente separou e retirou"
        sub="Os campos já vêm com o valor recomendado. Confirme o que realmente fez — ou troque o valor antes de confirmar."
        acao={
          !fechado && !semFaturamento ? (
            <Button
              variant="secondary"
              disabled={salvando}
              onClick={() =>
                void salvarMes(
                  {
                    guardado: d.plano.limites.guardar,
                    impostoSeparado: d.plano.limites.impostos,
                  },
                  "Valores recomendados confirmados",
                )
              }
            >
              <Check className="h-4 w-4" /> Confirmar o recomendado
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {/* guardar — meta */}
          <LinhaRealizado
            rotulo="Guardar para a empresa"
            explicacao={`Valor recomendado pela regra dos ${PERCENTUAIS.guardar}%.`}
            recomendadoRotulo="Valor recomendado"
            recomendado={d.plano.limites.guardar}
            feitoRotulo="Já guardei"
            feito={feito("guardar")}
            restanteRotulo="Ainda falta"
            restante={linha("guardar")?.diferenca ?? 0}
            situacao={linha("guardar")?.situacao ?? "ok"}
            estado={linha("guardar")?.estado ?? ""}
            campoId="gua"
            campoLabel="Quanto vou guardar agora?"
            valor={guardado}
            onChange={setGuardado}
            disabled={fechado}
            salvando={salvando}
            onConfirmar={() => void salvarMes({ guardado }, "Valor guardado atualizado")}
          />
          {/* pró-labore — limite */}
          <LinhaRealizado
            rotulo="Pró-labore"
            explicacao={`Os ${PERCENTUAIS.prolabore}% são LIMITE. O que você não retirar continua na empresa.`}
            recomendadoRotulo="Limite do mês"
            recomendado={d.plano.limites.prolabore}
            feitoRotulo="Já retirei"
            feito={feito("prolabore")}
            restanteRotulo="Disponível"
            restante={Math.max(0, d.plano.limites.prolabore - feito("prolabore"))}
            situacao={linha("prolabore")?.situacao ?? "ok"}
            estado={linha("prolabore")?.estado ?? ""}
            campoId="pro"
            campoLabel="Quanto já retirei?"
            valor={prolabore}
            onChange={setProlabore}
            disabled={fechado}
            salvando={salvando}
            onConfirmar={() => void salvarMes({ prolaboreUsado: prolabore }, "Pró-labore atualizado")}
          />
          {/* impostos — meta */}
          <LinhaRealizado
            rotulo="Separar para impostos"
            explicacao={`Valor recomendado pela regra dos ${PERCENTUAIS.impostos}%.`}
            recomendadoRotulo="Recomendado separar"
            recomendado={d.plano.limites.impostos}
            feitoRotulo="Já separei"
            feito={feito("impostos")}
            restanteRotulo="Ainda falta"
            restante={linha("impostos")?.diferenca ?? 0}
            situacao={linha("impostos")?.situacao ?? "ok"}
            estado={linha("impostos")?.estado ?? ""}
            campoId="imp"
            campoLabel="Quanto já separei?"
            valor={imposto}
            onChange={setImposto}
            disabled={fechado}
            salvando={salvando}
            onConfirmar={() => void salvarMes({ impostoSeparado: imposto }, "Impostos atualizados")}
          />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Numero
            rotulo="Valor mantido na empresa"
            valor={d.plano.mantidoNaEmpresa}
            cor="text-emerald-400"
            sub="a parte do pró-labore que você não retirou"
          />
          <Numero
            rotulo="Mantido na empresa (acumulado, todos os meses)"
            valor={d.acumuladoMantido}
            sub={`lucro guardado até hoje: ${brl(d.acumuladoGuardado)}`}
          />
        </div>
      </Passo>

      {/* ------------------------------------ 4. ORÇAMENTO DA OPERAÇÃO */}
      <Operacao
        limite={d.plano.limites.operacao}
        gasto={feito("operacao")}
        disponivel={d.plano.operacaoDisponivel}
        excedente={d.plano.operacaoExcedente}
        pago={d.plano.operacaoPaga}
        aPagar={d.plano.operacaoAPagar}
        lista={d.lancamentos.filter((l) => l.direcao === "saida" && l.operacao)}
        fechado={fechado}
        salvando={salvando}
        onEnviar={enviar}
      />

      {/* -------------------------------------------- 5. GASTOS FIXOS */}
      <GastosFixos
        fixos={d.fixos}
        totais={d.totais}
        chave={chave}
        fechado={fechado}
        salvando={salvando}
        onEnviar={enviar}
      />

      {/* --------------------------------------------------- 6. CAIXA */}
      <Caixa
        caixa={d.caixa}
        mov={d.caixaMov}
        empresa={d.caixaEmpresa}
        chave={chave}
        lista={d.lancamentos.filter(
          (l) => l.direcao === "entrada" || (!l.operacao && !l.gasto_fixo_id),
        )}
        fechado={fechado}
        salvando={salvando}
        onEnviar={enviar}
      />

      {/* --------------------------------------- 7. FECHAMENTO DO MÊS */}
      <Passo
        numero={7}
        titulo={fechado ? `${monthLabel(chave)} está fechado` : `Fechar ${monthLabel(chave)}`}
        sub={
          fechado
            ? "O histórico está guardado. Só o administrador pode reabrir para alterar."
            : "Depois de fechar, os lançamentos deste mês ficam travados. O mês seguinte começa independente, zerado."
        }
        acao={
          <Button
            variant={fechado ? "ghost" : "primary"}
            disabled={salvando}
            onClick={() => {
              if (
                !fechado &&
                !confirm(
                  `Fechar o mês de ${monthLabel(chave)}? Os lançamentos ficam travados até você reabrir.`,
                )
              )
                return;
              void enviar(
                { acao: fechado ? "reabrir" : "fechar" },
                fechado ? "Mês reaberto" : "Mês fechado",
              );
            }}
          >
            {fechado ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {fechado ? "Reabrir mês" : "Fechar mês"}
          </Button>
        }
      >
        <ul className="divide-y divide-white/5 text-sm">
          {[
            { r: "Faturamento", v: d.resumo.faturamento, cor: "text-white" },
            { r: "Guardado para a empresa", v: d.resumo.guardado, cor: "text-emerald-400" },
            { r: "Pró-labore retirado", v: d.resumo.prolaboreRetirado, cor: "text-white/80" },
            { r: "Impostos separados", v: d.resumo.impostoSeparado, cor: "text-white/80" },
            { r: "Operação utilizada", v: d.resumo.operacaoUtilizada, cor: "text-white/80" },
            { r: "Gastos pagos no mês", v: d.resumo.gastosPagos, cor: "text-white/80" },
          ].map((x) => (
            <li key={x.r} className="flex items-center justify-between py-1.5">
              <span className="text-white/60">{x.r}</span>
              <span className={`font-semibold tabular-nums ${x.cor}`}>{brl(x.v)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-2">
            <span className="font-semibold text-white">
              Ainda não destinado
              <span className="ml-1 font-normal text-white/40">(continua na empresa)</span>
            </span>
            <span
              className={`font-bold tabular-nums ${
                d.resumo.naoDestinado < 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {brl(d.resumo.naoDestinado)}
            </span>
          </li>
        </ul>
      </Passo>

      {/* ---------------------------------------- histórico e previsão */}
      <Passo
        titulo="Meses anteriores e previsão"
        sub={`Fora do mês selecionado, para comparar. O caixa acumulado da empresa é de ${brl(d.caixaEmpresa)} e é dele que a previsão parte.`}
      >
        {d.historico.length > 0 && (
          <div className="lb-scroll mb-4 overflow-x-auto">
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
                  <tr
                    key={h.chave}
                    className={`border-t border-white/5 ${h.chave === chave ? "bg-white/[0.04]" : ""}`}
                  >
                    <td className="py-2 text-white/80">{monthLabel(h.chave)}</td>
                    <td className="py-2 text-right text-white/80">{brl(h.faturamento)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.guardado)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.prolaboreUsado)}</td>
                    <td className="py-2 text-right font-semibold text-emerald-400">
                      {brl(h.mantidoNaEmpresa)}
                    </td>
                    <td className="py-2 text-right text-white/60">{brl(h.impostoSeparado)}</td>
                    <td className="py-2 text-right text-white/60">{brl(h.operacaoGasta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="lb-scroll overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="pb-2">Próximos meses</th>
                <th className="pb-2 text-right">Vai entrar</th>
                <th className="pb-2 text-right">Vai sair</th>
                <th className="pb-2 text-right">Resultado</th>
                <th className="pb-2 text-right">Saldo previsto</th>
              </tr>
            </thead>
            <tbody>
              {d.projecao.map((p) => (
                <tr key={p.chave} className="border-t border-white/5">
                  <td className="py-2 text-white/80">{monthLabel(p.chave)}</td>
                  <td className="py-2 text-right text-white/70">{brl(p.entradas)}</td>
                  <td className="py-2 text-right text-white/70">{brl(p.saidas)}</td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      p.resultado < 0 ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {brl(p.resultado)}
                  </td>
                  <td
                    className={`py-2 text-right font-bold ${p.saldo < 0 ? "text-rose-400" : "text-white"}`}
                  >
                    {brl(p.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Passo>
    </div>
  );
}

/* --------------------------------------------- linha de "o que eu fiz" */

function LinhaRealizado({
  rotulo,
  explicacao,
  recomendadoRotulo,
  recomendado,
  feitoRotulo,
  feito,
  restanteRotulo,
  restante,
  situacao,
  estado,
  campoId,
  campoLabel,
  valor,
  onChange,
  disabled,
  salvando,
  onConfirmar,
}: {
  rotulo: string;
  explicacao: string;
  recomendadoRotulo: string;
  recomendado: number;
  feitoRotulo: string;
  feito: number;
  restanteRotulo: string;
  restante: number;
  situacao: Situacao;
  estado: string;
  campoId: string;
  campoLabel: string;
  valor: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  salvando: boolean;
  onConfirmar: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[situacao]}`} />
        <span className="min-w-[150px] flex-1 text-sm font-semibold text-white">{rotulo}</span>
        <span className={`text-xs font-bold ${CORES[situacao]}`}>{estado}</span>
      </div>
      <p className="mt-0.5 pl-5 text-[11px] text-white/40">{explicacao}</p>
      <div className="mt-2.5 grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45">{recomendadoRotulo}</p>
          <p className="text-sm font-bold text-white">{brl(recomendado)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45">{feitoRotulo}</p>
          <p className="text-sm font-bold text-white">{brl(feito)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45">{restanteRotulo}</p>
          <p className={`text-sm font-bold ${restante > 0 ? CORES[situacao] : "text-white"}`}>
            {brl(restante)}
          </p>
        </div>
        <Moeda id={campoId} label={campoLabel} valor={valor} onChange={onChange} disabled={disabled} />
        <Button variant="secondary" disabled={salvando || disabled} onClick={onConfirmar}>
          <Check className="h-4 w-4" /> Confirmar
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------- 4. orçamento da operação */

const CATEGORIAS_OPERACAO = [
  "Meta Ads",
  "Google Ads",
  "Lista fria",
  "Equipamentos",
  "Passagens",
  "Premiações",
  "Material",
  "Eventos",
  "Outros",
];

function Operacao({
  limite,
  gasto,
  disponivel,
  excedente,
  pago,
  aPagar,
  lista,
  fechado,
  salvando,
  onEnviar,
}: {
  limite: number;
  gasto: number;
  disponivel: number;
  excedente: number;
  pago: number;
  aPagar: number;
  lista: Lancamento[];
  fechado: boolean;
  salvando: boolean;
  onEnviar: (corpo: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState(0);
  const [cat, setCat] = useState(CATEGORIAS_OPERACAO[0]);
  const [venc, setVenc] = useState(() => new Date().toISOString().slice(0, 10));
  const usoPct = limite > 0 ? Math.min(100, (gasto / limite) * 100) : 0;

  return (
    <Passo
      numero={4}
      titulo="Orçamento da operação"
      sub={`Os ${PERCENTUAIS.operacao}% do faturamento. Registrar um gasto já consome o orçamento; pagar é outra coisa, e aparece no caixa.`}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Numero rotulo="💰 Disponível para operação" valor={limite} destaque />
        <Numero
          rotulo="💸 Já gasto"
          valor={gasto}
          cor={excedente > 0 ? "text-rose-400" : "text-amber-300"}
          sub={`${brl(pago)} já pago · ${brl(aPagar)} a pagar`}
          destaque
        />
        <Numero
          rotulo="📊 Ainda disponível"
          valor={disponivel}
          cor={excedente > 0 ? "text-rose-400" : "text-emerald-400"}
          sub={excedente > 0 ? `passou em ${brl(excedente)}` : undefined}
          destaque
        />
      </div>

      {limite > 0 && (
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${Math.max(2, usoPct)}%`,
              background: excedente > 0 ? "#fb7185" : "linear-gradient(90deg,#34d399,#f5b301)",
            }}
          />
        </div>
      )}

      {!fechado && (
        <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Label htmlFor="odesc">O que foi o gasto</Label>
            <Input
              id="odesc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Meta Ads setembro"
            />
          </div>
          <Moeda id="oval" label="Valor" valor={valor} onChange={setValor} />
          <div>
            <Label htmlFor="ocat">Categoria</Label>
            <select
              id="ocat"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              {CATEGORIAS_OPERACAO.map((c) => (
                <option key={c} value={c} className="bg-[#0b0d16]">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ovenc">Vencimento</Label>
            <Input id="ovenc" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              disabled={salvando || !desc.trim() || valor <= 0}
              onClick={async () => {
                await onEnviar(
                  {
                    acao: "salvar-lancamento",
                    direcao: "saida",
                    tipo: "variavel",
                    descricao: desc,
                    valor,
                    vencimento: venc,
                    categoria: cat,
                    operacao: true,
                  },
                  "Gasto da operação registrado",
                );
                setDesc("");
                setValor(0);
              }}
            >
              <Plus className="h-4 w-4" /> Registrar
            </Button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="mt-3 text-xs text-white/45">Nenhum gasto de operação registrado neste mês.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {lista.map((l) => (
            <ItemLancamento key={l.id} l={l} fechado={fechado} salvando={salvando} onEnviar={onEnviar} />
          ))}
        </ul>
      )}
    </Passo>
  );
}

/* ------------------------------------------------- 5. gastos fixos */

const CATEGORIAS_FIXAS = [
  "Aluguel",
  "Contabilidade",
  "Advogado",
  "FGTS",
  "Salários",
  "Internet",
  "Sistemas",
  "Outros",
];

const ROTULO_FIXO: Record<Fixo["status"], string> = {
  previsto: "Previsto",
  pendente: "Pendente",
  atrasado: "Atrasado",
  pago: "Pago",
};
const COR_FIXO: Record<Fixo["status"], string> = {
  previsto: "text-white/45",
  pendente: "text-amber-300",
  atrasado: "text-rose-400",
  pago: "text-emerald-400",
};

function GastosFixos({
  fixos,
  totais,
  chave,
  fechado,
  salvando,
  onEnviar,
}: {
  fixos: Fixo[];
  totais: Dados["totais"];
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
  const faltaGerar = ativos.some((f) => f.status === "previsto");

  return (
    <Passo
      numero={5}
      titulo="Gastos fixos"
      sub="Cadastre uma vez e o compromisso nasce todo mês. Previsto é o que está cadastrado; pendente é o compromisso do mês em aberto; pago é dinheiro que já saiu."
      acao={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={salvando || fechado || !faltaGerar}
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
      <div className="grid gap-2 sm:grid-cols-3">
        <Numero
          rotulo="Previsto no mês"
          valor={totais.fixosPrevisto}
          sub={`${ativos.length} gasto(s) fixo(s) ativo(s)`}
        />
        <Numero rotulo="Pago" valor={totais.fixosPago} cor="text-emerald-400" />
        <Numero
          rotulo="Pendente"
          valor={totais.fixosPendente + totais.fixosNaoGerado}
          cor="text-amber-300"
          sub={
            totais.fixosNaoGerado > 0
              ? `${brl(totais.fixosNaoGerado)} ainda sem compromisso gerado`
              : undefined
          }
        />
      </div>

      {novo && (
        <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label htmlFor="fnome">Nome da despesa</Label>
            <Input
              id="fnome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Aluguel"
            />
          </div>
          <Moeda id="fvalor" label="Valor" valor={valor} onChange={setValor} />
          <div>
            <Label htmlFor="fdia">Dia do vencimento</Label>
            <Input
              id="fdia"
              type="number"
              min={1}
              max={31}
              value={dia}
              onChange={(e) => setDia(Number(e.target.value) || 1)}
            />
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
                await onEnviar(
                  { acao: "salvar-fixo", nome, valor, diaVencimento: dia, categoria: cat },
                  "Gasto fixo cadastrado",
                );
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
        <p className="mt-3 text-xs text-white/45">Nenhum gasto fixo cadastrado ainda.</p>
      ) : (
        <div className="lb-scroll mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="pb-2">Gasto</th>
                <th className="pb-2 text-right">Valor</th>
                <th className="pb-2 text-center">Vencimento</th>
                <th className="pb-2 text-center">Status</th>
                <th className="pb-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {fixos.map((f) => (
                <tr key={f.id} className="border-t border-white/5">
                  <td className="py-2">
                    <span className={f.ativo ? "text-white" : "text-white/35 line-through"}>
                      {f.nome}
                    </span>
                    <span className="ml-2 text-[11px] text-white/40">{f.categoria}</span>
                  </td>
                  <td className="py-2 text-right font-semibold text-white/80">{brl(f.valorNoMes)}</td>
                  <td className="py-2 text-center text-xs text-white/50">
                    {f.vencimento ? diaMes(f.vencimento) : `dia ${f.dia_vencimento}`}
                  </td>
                  <td className={`py-2 text-center text-[11px] font-bold ${COR_FIXO[f.status]}`}>
                    {ROTULO_FIXO[f.status]}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!fechado && f.lancamentoId && f.status !== "pago" && (
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() =>
                            void onEnviar(
                              { acao: "liquidar", id: f.lancamentoId },
                              "Pagamento registrado",
                            )
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline"
                        >
                          <CheckCircle2 className="h-3 w-3" /> paguei
                        </button>
                      )}
                      {!fechado && f.lancamentoId && f.status === "pago" && (
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() =>
                            void onEnviar(
                              { acao: "desfazer-liquidacao", id: f.lancamentoId },
                              "Desfeito",
                            )
                          }
                          className="text-[11px] text-white/40 hover:text-white"
                        >
                          desfazer
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() =>
                          void onEnviar(
                            {
                              acao: "salvar-fixo",
                              id: f.id,
                              nome: f.nome,
                              valor: f.valor,
                              diaVencimento: f.dia_vencimento,
                              categoria: f.categoria,
                              ativo: !f.ativo,
                            },
                            f.ativo ? "Gasto fixo desativado" : "Gasto fixo reativado",
                          )
                        }
                        className="text-[11px] font-semibold text-white/45 hover:text-white"
                      >
                        {f.ativo ? "desativar" : "reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Passo>
  );
}

/* -------------------------------------------------------- 6. caixa */

const CATEGORIAS_CAIXA = [
  "Recebimento",
  "Comissão",
  "Aluguel",
  "Salários",
  "Impostos",
  "Contabilidade",
  "Material",
  "Outros",
];

function Caixa({
  caixa,
  mov,
  empresa,
  chave,
  lista,
  fechado,
  salvando,
  onEnviar,
}: {
  caixa: Dados["caixa"];
  mov: Dados["caixaMov"];
  empresa: number;
  chave: string;
  lista: Lancamento[];
  fechado: boolean;
  salvando: boolean;
  onEnviar: (corpo: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  const [novo, setNovo] = useState(false);
  const [direcao, setDirecao] = useState<"saida" | "entrada">("entrada");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState(0);
  const [venc, setVenc] = useState(() => new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState(CATEGORIAS_CAIXA[0]);

  return (
    <Passo
      numero={6}
      titulo={`Caixa de ${monthLabel(chave)}`}
      sub="Dinheiro que já entrou fica separado do que ainda vai entrar — de propósito. Só os lançamentos deste mês entram nesta conta."
      acao={
        <Button variant="ghost" onClick={() => setNovo((v) => !v)} disabled={fechado}>
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Numero rotulo="Já entrou" valor={mov.entrou} cor="text-emerald-400" />
        <Numero rotulo="Já saiu" valor={mov.saiu} cor="text-white/80" />
        <Numero
          rotulo="Tenho hoje"
          valor={caixa.disponivel}
          cor={caixa.disponivel < 0 ? "text-rose-400" : "text-emerald-400"}
          sub="entrou − saiu"
          destaque
        />
        <Numero rotulo="Ainda vou receber" valor={caixa.aReceber} sub="previsto, não entrou" />
        <Numero rotulo="Tenho para pagar" valor={caixa.aPagar} cor="text-amber-300" sub="em aberto" />
        <Numero
          rotulo="Previsão de caixa"
          valor={caixa.projetado}
          cor={caixa.projetado < 0 ? "text-rose-400" : "text-white"}
          sub="tenho + vou receber − vou pagar"
          destaque
        />
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        Caixa acumulado da empresa, somando todos os meses: {brl(empresa)}.
      </p>

      {novo && (
        <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-6">
          <div>
            <Label htmlFor="cdir">Tipo</Label>
            <select
              id="cdir"
              value={direcao}
              onChange={(e) => setDirecao(e.target.value as "saida" | "entrada")}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              <option value="entrada" className="bg-[#0b0d16]">
                Vou receber
              </option>
              <option value="saida" className="bg-[#0b0d16]">
                Vou pagar
              </option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cdesc">Descrição</Label>
            <Input
              id="cdesc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Comissão da administradora"
            />
          </div>
          <Moeda id="cval" label="Valor" valor={valor} onChange={setValor} />
          <div>
            <Label htmlFor="cvenc">Vencimento</Label>
            <Input id="cvenc" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ccat">Categoria</Label>
            <select
              id="ccat"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white"
            >
              {CATEGORIAS_CAIXA.map((c) => (
                <option key={c} value={c} className="bg-[#0b0d16]">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-6">
            <p className="mb-2 text-[11px] text-white/40">
              Gasto de anúncio, lista ou premiação entra no orçamento da operação (passo 4). Aqui
              ficam recebimentos e gastos da empresa que não contam no limite de{" "}
              {PERCENTUAIS.operacao}%.
            </p>
            <Button
              disabled={salvando || !desc.trim() || valor <= 0}
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
                    operacao: false,
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
        <p className="mt-3 text-xs text-white/45">
          Nenhum recebimento ou outro gasto lançado neste mês.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {lista.map((l) => (
            <ItemLancamento key={l.id} l={l} fechado={fechado} salvando={salvando} onEnviar={onEnviar} />
          ))}
        </ul>
      )}

      {caixa.aPagar > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> {brl(caixa.aPagar)} em contas ainda a pagar neste
          mês.
        </p>
      )}
    </Passo>
  );
}

/* ---------------------------------------------- item de lançamento */

function ItemLancamento({
  l,
  fechado,
  salvando,
  onEnviar,
}: {
  l: Lancamento;
  fechado: boolean;
  salvando: boolean;
  onEnviar: (corpo: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          l.direcao === "entrada" ? "bg-emerald-400" : "bg-white/30"
        }`}
      />
      <span className="min-w-[130px] flex-1 truncate text-white">{l.descricao}</span>
      <span className="text-xs text-white/40">{l.categoria}</span>
      <span className="text-xs text-white/40">{diaMes(l.vencimento)}</span>
      <span
        className={`font-semibold ${l.direcao === "entrada" ? "text-emerald-400" : "text-white/80"}`}
      >
        {l.direcao === "entrada" ? "+" : "−"}
        {brl(l.valor)}
      </span>
      <span className={`text-[11px] font-bold ${COR_SITUACAO[l.situacao]}`}>
        {l.direcao === "entrada" && l.situacao === "liquidado"
          ? "Recebido"
          : ROTULO_SITUACAO[l.situacao]}
      </span>
      {!fechado && (
        <>
          {l.status === "pendente" ? (
            <button
              type="button"
              disabled={salvando}
              onClick={() =>
                void onEnviar(
                  { acao: "liquidar", id: l.id },
                  l.direcao === "entrada" ? "Recebimento registrado" : "Pagamento registrado",
                )
              }
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
              if (confirm(`Remover "${l.descricao}"?`))
                void onEnviar({ acao: "remover-lancamento", id: l.id }, "Removido");
            }}
            className="text-white/30 hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  );
}
