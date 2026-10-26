"use client";
import { useState } from "react";
import { Field, Input } from "./ui";

export function NumberField({ label, value, onChange, hint, min = 0, max = 1000000, decimals = 3, money = false }: {
  label: string; value: number | null; onChange: (value: number | null) => void; hint?: string; min?: number; max?: number; decimals?: number; money?: boolean;
}) {
  const format = (n: number | null) => n === null ? "" : String(money ? n / 100 : n).replace(".", ",");
  const [input, setInput] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const numeric = /^\d+(?:[.,]\d+)?$/.test(input.trim()) ? Number(input.trim().replace(",", ".")) : NaN;
  const places = input.split(/[.,]/)[1]?.length ?? 0;
  const invalid = input !== "" && (!Number.isFinite(numeric) || numeric < min || numeric > max || places > decimals);
  return <Field label={label} hint={hint} error={focused && invalid ? `Use um número de ${min} a ${max}, com até ${decimals} casas decimais.` : undefined}>
    <Input inputMode="decimal" value={focused ? input : format(value)} placeholder="Informe o valor" aria-invalid={focused && invalid} onFocus={() => { setInput(format(value)); setFocused(true); }} onBlur={() => setFocused(false)} onChange={e => {
      const raw = e.target.value; setInput(raw);
      const n = /^\d+(?:[.,]\d+)?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : NaN;
      const valid = Number.isFinite(n) && n >= min && n <= max && (raw.split(/[.,]/)[1]?.length ?? 0) <= decimals;
      onChange(valid ? money ? Math.round(n * 100) : n : null);
    }} />
  </Field>;
}
