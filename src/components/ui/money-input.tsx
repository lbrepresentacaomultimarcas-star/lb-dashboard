"use client";

import { Input } from "@/components/ui/input";
import { formatNumBR, parseNumBR } from "@/lib/utils";

/**
 * Input monetário no padrão brasileiro.
 * - Aceita digitação natural (171187, 171.187, 171.187,50, 2.500.000,75)
 * - Sem limite de valor (não usa type=number)
 * - Reformata pro padrão BR quando sai do campo (onBlur)
 * - O `value` no estado é a string exibida; converta com parseNumBR ao salvar
 */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      required={required}
      onChange={(e) => {
        // deixa o usuário digitar livre: só dígitos, ponto e vírgula
        const limpo = e.target.value.replace(/[^\d.,]/g, "");
        onChange(limpo);
      }}
      onBlur={() => {
        const n = parseNumBR(value);
        onChange(n ? formatNumBR(n) : "");
      }}
    />
  );
}
