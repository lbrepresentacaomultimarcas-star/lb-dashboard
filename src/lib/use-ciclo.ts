"use client";

import { useMemo } from "react";
import { useConfigProducao, useFeriados } from "./store";
import { cicloAtual, setDeFeriados, type ConfigProducao } from "./ciclo";

/**
 * Reúne, de forma reativa, tudo que as telas precisam pra aplicar a regra de
 * fechamento: a `config`, o `Set` de feriados e a `chaveAtual` do ciclo de hoje.
 *
 * Com a regra desligada (config padrão), `chaveAtual` é o próprio mês-calendário
 * e `config`/`feriados` mantêm os cálculos idênticos ao comportamento antigo.
 */
export function useCicloProducao(): {
  config: ConfigProducao;
  feriados: Set<string>;
  chaveAtual: string;
} {
  const config = useConfigProducao();
  const feriadosList = useFeriados();
  const feriados = useMemo(
    () => setDeFeriados(feriadosList.map((f) => f.data)),
    [feriadosList],
  );
  const chaveAtual = useMemo(
    () => cicloAtual(config, feriados, new Date()).chave,
    [config, feriados],
  );
  return { config, feriados, chaveAtual };
}
