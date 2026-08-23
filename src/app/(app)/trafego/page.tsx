"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Flame,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  TrendingDown,
  Users,
} from "lucide-react";
import { PremiumStage } from "@/components/premium-stage";
import { RoleGuard } from "@/components/role-guard";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

/* ------------------------------------------------------------------ tipos */

type Grupo = {
  nome: string;
  conta: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  leads: number;
  dias: number;
  cpl: number | null;
  cpc: number | null;
  ctr: number | null;
  conclusivo: boolean;
};

type Panorama = {
  periodo: { dias: number; desde: string };
  conexao: { ativa: boolean; podeLerAnuncios: boolean };
  coleta: { ultimoDia: string | null; linhas: number };
  midia: {
    gasto: number; leads: number; cpl: number | null;
    gastoSemLead: number; fatiaSemLead: number | null; campanhasSemLead: number;
  };
  campanhas: Grupo[];
  anuncios: Grupo[];
  crm: {
    total: number;
    funil: { recebidos: number; distribuidos: number; atendidos: number; oportunidades: number; vendas: number };
    porProduto: { nome: string; total: number }[];
    porCidade: { nome: string; total: number }[];
    porPrazo: { nome: string; total: number }[];
    porPlataforma: { nome: string; total: number }[];
  };
  minimoParaConcluir: number;
};

const PERIODOS = [
  { dias: 3, label: "3 dias" },
  { dias: 7, label: "7 dias" },
  { dias: 15, label: "15 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 365, label: "Histórico" },
];

const brl = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

/* --------------------------------------------------------------- resposta */

/** Um achado da Central: o que aconteceu, por quê e o que fazer. */
function Achado({
  icone: Icone,
  tom,
  titulo,
  oQue,
  porQue,
  oQueFazer,
}: {
  icone: React.ComponentType<{ className?: string }>;
  tom: "success" | "warn" | "danger" | "brand" | "neutral";
  titulo: string;
  oQue: React.ReactNode;
  porQue?: React.ReactNode;
  oQueFazer?: React.ReactNode;
}) {
  return (
    <Card className="flex gap-4">
      <Icone className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-dim)]" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <Badge tone={tom}>Central de Tráfego</Badge>
        </div>
        <p className="text-sm leading-relaxed">{oQue}</p>
        {porQue && (
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-dim)]">
            <span className="font-semibold">Por quê: </span>
            {porQue}
          </p>
        )}
        {oQueFazer && (
          <p className="mt-2 text-sm leading-relaxed">
            <span className="font-semibold">O que fazer: </span>
            {oQueFazer}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- página */

export default function CentralDeTrafego() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Panorama | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [coletando, setColetando] = useState(false);

  const carregar = useCallback(async (d: number) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/trafego/panorama?dias=${d}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao carregar.");
      setDados(await r.json());
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui carregar o panorama.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(dias);
  }, [dias, carregar]);

  const analisarAgora = async () => {
    setColetando(true);
    try {
      const r = await fetch(`/api/trafego/coletar?dias=${Math.max(dias, 30)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detalhe ?? j.error ?? "Falha ao buscar na Meta.");
      notify.success(`Dados atualizados: ${j.linhas_gravadas ?? 0} registros.`);
      await carregar(dias);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não consegui falar com a Meta.");
    } finally {
      setColetando(false);
    }
  };

  const m = dados?.midia;
  const f = dados?.crm.funil;
  const semAmostra = (dados?.crm.total ?? 0) < (dados?.minimoParaConcluir ?? 30);
  const recortes: { rotulo: string; lista: { nome: string; total: number }[] }[] = dados
    ? [
        { rotulo: "Produto", lista: dados.crm.porProduto },
        { rotulo: "Cidade", lista: dados.crm.porCidade },
        { rotulo: "Quando pretende", lista: dados.crm.porPrazo },
        { rotulo: "Origem", lista: dados.crm.porPlataforma },
      ]
    : [];

  return (
    <RoleGuard minimo="admin">
      <PremiumStage>
        <div className="mx-auto max-w-6xl space-y-6">
          {/* cabeçalho */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-[var(--color-brand)]" />
                <h1 className="text-2xl font-bold">Central de Tráfego</h1>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                O que está acontecendo com o seu investimento — e o que fazer a respeito.
              </p>
            </div>
            <Button onClick={analisarAgora} disabled={coletando}>
              {coletando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {coletando ? "Buscando na Meta…" : "Analisar agora"}
            </Button>
          </div>

          {/* período */}
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                onClick={() => setDias(p.dias)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  dias === p.dias
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                    : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {carregando && !dados && (
            <Card className="flex items-center gap-3 text-sm text-[var(--color-text-dim)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </Card>
          )}

          {dados && !dados.conexao.podeLerAnuncios && (
            <Card className="border-[var(--color-warn)]/40">
              <CardTitle>Aguardando permissão da Meta</CardTitle>
              <p className="mt-2 text-sm">
                A conexão está ativa, mas ainda sem autorização para ler os anúncios. Os números de
                investimento não aparecem até isso ser resolvido — e prefiro deixar em branco a mostrar
                zero, que pareceria resposta.
              </p>
            </Card>
          )}

          {dados && (
            <>
              {/* números do período */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardTitle>Investimento</CardTitle>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{brl(m?.gasto)}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">nos últimos {dados.periodo.dias} dias</p>
                </Card>
                <Card>
                  <CardTitle>Leads que chegaram</CardTitle>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{int(dados.crm.total)}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">contados no CRM, sem testes</p>
                </Card>
                <Card>
                  <CardTitle>Custo por lead</CardTitle>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{brl(m?.cpl)}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">média do período</p>
                </Card>
                <Card>
                  <CardTitle>Viraram venda</CardTitle>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{int(f?.vendas)}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">de {int(f?.recebidos)} recebidos</p>
                </Card>
              </div>

              {/* o que a Central conclui */}
              <div className="space-y-3">
                {m && m.fatiaSemLead != null && m.fatiaSemLead > 40 && (
                  <Achado
                    icone={TrendingDown}
                    tom="danger"
                    titulo="Boa parte do dinheiro não está virando lead"
                    oQue={
                      <>
                        <strong>{brl(m.gastoSemLead)}</strong> — {m.fatiaSemLead}% do que foi investido — saiu em{" "}
                        {m.campanhasSemLead} campanha(s) que não trouxeram nenhum lead de formulário.
                      </>
                    }
                    porQue="Campanhas de mensagem e engajamento não geram lead de formulário. Elas podem ter gerado conversa no WhatsApp — mas isso não fica registrado em lugar nenhum, então não dá para saber se valeu."
                    oQueFazer="Antes de mexer no valor, decida o que cada campanha deve entregar. Se o objetivo é lead rastreável, migre para formulário. Se é conversa, aceite que o resultado dela não vai aparecer aqui."
                  />
                )}

                {f && f.recebidos > 0 && f.atendidos === 0 && (
                  <Achado
                    icone={AlertTriangle}
                    tom="warn"
                    titulo="Leads recebidos ainda sem atendimento"
                    oQue={<>{f.recebidos} lead(s) chegaram e nenhum foi atendido ainda.</>}
                    porQue="Pode ser normal se caiu em fim de semana ou fora do horário — a distribuição acontece no próximo dia útil."
                    oQueFazer="Se já é dia útil e continua assim, o gargalo não é de tráfego: é de operação. Nenhum ajuste de campanha resolve lead que não recebe ligação."
                  />
                )}

                {semAmostra && (
                  <Achado
                    icone={BadgeCheck}
                    tom="neutral"
                    titulo="Ainda sem volume para conclusão segura"
                    oQue={
                      <>
                        São {dados.crm.total} lead(s) no período. Abaixo de {dados.minimoParaConcluir} por
                        grupo, comparar cidade, produto ou anúncio é sorte, não análise.
                      </>
                    }
                    porQue="Um punhado de leads pode dobrar ou zerar na semana seguinte sem nada ter mudado. Decidir orçamento em cima disso é apostar."
                    oQueFazer="Deixe rodar e volte quando houver volume. Prefiro dizer isso a inventar uma recomendação bonita."
                  />
                )}
              </div>

              {/* campanhas */}
              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-4">
                  <Flame className="h-4 w-4 text-[var(--color-text-dim)]" />
                  <CardTitle>Campanhas do período</CardTitle>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                        <th className="p-3 font-medium">Campanha</th>
                        <th className="p-3 text-right font-medium">Investido</th>
                        <th className="p-3 text-right font-medium">Leads</th>
                        <th className="p-3 text-right font-medium">Custo/lead</th>
                        <th className="p-3 text-right font-medium">Dias</th>
                        <th className="p-3 font-medium">Leitura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.campanhas.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-[var(--color-text-dim)]">
                            Nenhum dado no período. Use “Analisar agora” para buscar na Meta.
                          </td>
                        </tr>
                      )}
                      {dados.campanhas.map((c) => (
                        <tr key={c.nome + c.conta} className="border-t border-[var(--color-border)]">
                          <td className="max-w-[280px] truncate p-3" title={c.nome}>{c.nome}</td>
                          <td className="p-3 text-right tabular-nums">{brl(c.gasto)}</td>
                          <td className="p-3 text-right tabular-nums">{int(c.leads)}</td>
                          <td className="p-3 text-right tabular-nums">{brl(c.cpl)}</td>
                          <td className="p-3 text-right tabular-nums">{c.dias}</td>
                          <td className="p-3">
                            {c.leads === 0 && c.gasto > 0 ? (
                              <Badge tone="danger">sem lead de formulário</Badge>
                            ) : c.conclusivo ? (
                              <Badge tone="success">amostra suficiente</Badge>
                            ) : (
                              <Badge tone="neutral">dados insuficientes</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* o lead depois que chega */}
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--color-text-dim)]" />
                  <CardTitle>O que acontece depois que o lead chega</CardTitle>
                </div>
                <div className="grid gap-3 sm:grid-cols-5">
                  {[
                    ["Recebidos", f?.recebidos],
                    ["Distribuídos", f?.distribuidos],
                    ["Atendidos", f?.atendidos],
                    ["Oportunidades", f?.oportunidades],
                    ["Vendas", f?.vendas],
                  ].map(([rot, val]) => (
                    <div key={String(rot)} className="rounded-lg border border-[var(--color-border)] p-3">
                      <p className="text-xs text-[var(--color-text-dim)]">{rot}</p>
                      <p className="text-xl font-bold tabular-nums">{int(val as number)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {recortes.map(({ rotulo, lista }) => (
                    <div key={rotulo}>
                      <p className="mb-1 text-xs uppercase tracking-wider text-[var(--color-text-dim)]">{rotulo}</p>
                      {lista.slice(0, 5).map((x) => (
                        <div key={x.nome} className="flex justify-between gap-2 text-sm">
                          <span className="truncate" title={x.nome}>{x.nome}</span>
                          <span className="tabular-nums text-[var(--color-text-dim)]">{x.total}</span>
                        </div>
                      ))}
                      {lista.length === 0 && <p className="text-sm text-[var(--color-text-dim)]">—</p>}
                    </div>
                  ))}
                </div>
              </Card>

              <p className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                <RefreshCw className="h-3 w-3" />
                {dados.coleta.ultimoDia
                  ? `Último dia coletado: ${new Date(dados.coleta.ultimoDia + "T12:00:00").toLocaleDateString("pt-BR")} · ${dados.coleta.linhas} registros no período`
                  : "Nenhuma coleta ainda."}
              </p>
            </>
          )}
        </div>
      </PremiumStage>
    </RoleGuard>
  );
}
