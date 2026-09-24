import type * as React from "react";
import type { LucideIcon } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { corDoCombustivel } from "@/modules/combustivel/tanques/visual";

/**
 * Peças comuns das listas operacionais (Saídas, Entradas, Transferências), no desenho das
 * listas V2 da origem: a faixa de resumo acima da tabela, o badge do combustível e os blocos
 * do drawer de detalhe. Sem hooks: servem página e cliente.
 */

export interface FaixaResumoProps {
  quantidade: number;
  singular: string;
  plural: string;
  litros: number;
  valor: number;
  className?: string;
}

/**
 * "115 saídas · 12.784,10 L · R$ 85.087,60", como a barra de resumo da origem. Os números
 * são do FILTRO inteiro, não da página: quem chama passa a soma de tudo o que o filtro acha.
 */
export function FaixaResumo({ quantidade, singular, plural, litros, valor, className }: FaixaResumoProps) {
  return (
    <div
      data-testid="faixa-resumo"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-legenda text-muted-foreground",
        className,
      )}
    >
      <span>
        <span className="font-semibold text-foreground tabular-nums">{quantidade.toLocaleString("pt-BR")}</span>{" "}
        {quantidade === 1 ? singular : plural}
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold text-foreground tabular-nums">{formatarLitros(litros)}</span>
      <span aria-hidden>·</span>
      <MoneyText valor={valor} className="font-semibold text-foreground" />
    </div>
  );
}

/**
 * O combustível como badge, com a cor DO COMBUSTÍVEL (a mesma da cápsula do tanque): o
 * diesel S10 é azul em toda lista, filtrada ou não. A cor vai no ponto e num fundo leve; o
 * texto fica no tom normal, porque âmbar e verde-azulado sobre branco não se leem.
 */
export function BadgeCombustivel({ nome }: { nome: string | null | undefined }) {
  if (!nome) return <span className="text-muted-foreground">—</span>;
  const cor = corDoCombustivel(nome);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-legenda font-medium text-foreground"
      style={{ backgroundColor: `${cor}1A`, borderColor: `${cor}59` }}
      title={nome}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      <span className="truncate">{nome}</span>
    </span>
  );
}

/** Instante -> "23/09/26 14:30" em Rio Branco (UTC-5 o ano todo), o formato das listas da origem. */
export function formatarDataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "";
  const local = new Date(instante.getTime() - 5 * 60 * 60 * 1000).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(2, 4)} ${local.slice(11, 16)}`;
}

/** Cartão de número no topo do drawer de detalhe (Litros, Valor, R$/L, Origem). */
export function KpiDetalhe({
  icone: Icone,
  rotulo,
  children,
}: {
  icone?: LucideIcon;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-legenda font-medium text-muted-foreground">
        {Icone ? <Icone className="size-3" aria-hidden /> : null}
        {rotulo}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
    </div>
  );
}

/** Campo do drawer de detalhe: ícone, rótulo pequeno e o valor ("—" quando vazio). */
export function CampoDetalhe({
  icone: Icone,
  rotulo,
  children,
  className,
}: {
  icone: LucideIcon;
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  const vazio = children === null || children === undefined || children === "";
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <Icone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-legenda font-medium text-muted-foreground">{rotulo}</div>
        <div className="mt-0.5 break-words text-detalhe">{vazio ? "—" : children}</div>
      </div>
    </div>
  );
}
