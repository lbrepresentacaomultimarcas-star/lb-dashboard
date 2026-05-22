"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { metasApi, useMetas, useVendedores } from "@/lib/store";
import { brl, formatNumBR, monthKey, monthLabel, parseNumBR, todayMonth } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function monthsRange(centerMes = todayMonth(), before = 1, after = 4) {
  const [y, m] = centerMes.split("-").map(Number);
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(y, m - 1 + i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export default function MetasPage() {
  const vendedores = useVendedores();
  const metas = useMetas();
  const meses = useMemo(() => monthsRange(), []);
  const [salvando, setSalvando] = useState<string | null>(null);

  function valorAtual(vendedorId: string, anoMes: string, fallback: number) {
    const especifica = metas.find(
      (m) => m.vendedorId === vendedorId && m.anoMes === anoMes,
    );
    return especifica ? especifica.valor : fallback;
  }

  async function salvar(
    vendedorId: string,
    anoMes: string,
    raw: string,
    fallback: number,
  ) {
    const valor = parseNumBR(raw);
    if (valor < 0) {
      notify.error("Valor inválido");
      return;
    }
    if (valor === fallback) return; // não mudou
    const key = `${vendedorId}-${anoMes}`;
    setSalvando(key);
    try {
      await metasApi.upsert(vendedorId, anoMes, valor);
      notify.success(`Meta de ${anoMes} salva`);
    } catch (e) {
      notify.error("Erro ao salvar", e instanceof Error ? e.message : undefined);
    } finally {
      setSalvando(null);
    }
  }

  const totalPorMes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of meses) {
      out[m] = vendedores
        .filter((v) => v.ativo)
        .reduce((acc, v) => acc + valorAtual(v.id, m, v.metaMensal), 0);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedores, metas, meses]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Metas mensais</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Defina metas específicas por mês. Quando vazia, usa a meta padrão do vendedor.
          </p>
        </div>
      </header>

      {vendedores.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="mb-3 h-10 w-10 text-[var(--color-text-dim)]" />
            <CardTitle>Cadastre vendedores primeiro</CardTitle>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Vá em Vendedores → Novo vendedor.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                  <th className="px-5 py-3">Vendedor</th>
                  <th className="px-5 py-3 text-right">Padrão</th>
                  {meses.map((m) => (
                    <th key={m} className="px-3 py-3 text-right whitespace-nowrap">
                      {monthLabel(m).slice(0, 3)}/{m.slice(2, 4)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {vendedores.map((v) => (
                  <tr key={v.id} className="hover:bg-[var(--color-surface-2)]/40">
                    <td className="px-5 py-3 font-medium">{v.nome}</td>
                    <td className="px-5 py-3 text-right text-[var(--color-text-dim)]">
                      {brl(v.metaMensal)}
                    </td>
                    {meses.map((m) => {
                      const atual = valorAtual(v.id, m, v.metaMensal);
                      const personalizada = metas.some(
                        (x) => x.vendedorId === v.id && x.anoMes === m,
                      );
                      const key = `${v.id}-${m}`;
                      return (
                        <td key={m} className="px-3 py-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            defaultValue={formatNumBR(atual)}
                            onBlur={(e) => salvar(v.id, m, e.target.value, atual)}
                            disabled={salvando === key}
                            className={
                              personalizada
                                ? "h-8 text-right text-xs ring-1 ring-[var(--color-brand)]/40"
                                : "h-8 text-right text-xs text-[var(--color-text-dim)]"
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-[var(--color-surface-2)]/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3" />
                  {meses.map((m) => (
                    <td key={m} className="px-3 py-3 text-right text-xs whitespace-nowrap">
                      {brl(totalPorMes[m])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-[var(--color-text-dim)]">
        Dica: campos com borda azul têm meta personalizada salva. Apague o valor (deixe 0) pra usar o padrão.
      </p>
    </div>
  );
}
