"use client";

import {
  Banknote,
  Building2,
  CalendarClock,
  LineChart,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { cn } from "@/lib/utils";

/** Identificador de cada relatório (também o valor do parâmetro `rel`). */
export type RelatorioId =
  | "fluxo-caixa"
  | "dre"
  | "aging"
  | "posicao-bancaria"
  | "custo-cc"
  | "extrato-fornecedor";

export const RELATORIO_PADRAO: RelatorioId = "fluxo-caixa";

interface ItemRelatorio {
  id: RelatorioId;
  rotulo: string;
  icone: LucideIcon;
}

const ITENS: ItemRelatorio[] = [
  { id: "fluxo-caixa", rotulo: "Fluxo de caixa", icone: LineChart },
  { id: "dre", rotulo: "DRE gerencial", icone: Scale },
  { id: "aging", rotulo: "Aging", icone: CalendarClock },
  { id: "posicao-bancaria", rotulo: "Posição bancária", icone: Banknote },
  { id: "custo-cc", rotulo: "Custo por centro de custo", icone: Building2 },
  { id: "extrato-fornecedor", rotulo: "Extrato por fornecedor", icone: Users },
];

const IDS_VALIDOS = new Set<string>(ITENS.map((item) => item.id));

/** Normaliza o parâmetro `rel` num RelatorioId, com fallback no padrão. */
export function normalizarRelatorio(valor: string | undefined): RelatorioId {
  return valor && IDS_VALIDOS.has(valor)
    ? (valor as RelatorioId)
    : RELATORIO_PADRAO;
}

interface RelatoriosNavProps {
  ativo: RelatorioId;
}

/**
 * Navegação entre os seis relatórios. Troca o parâmetro `rel` na URL (replace),
 * o que faz o Server Component re-renderizar com os dados do relatório certo.
 */
export function RelatoriosNav({ ativo }: RelatoriosNavProps) {
  const { set } = useFiltrosUrl();

  return (
    <nav
      aria-label="Relatórios financeiros"
      className="flex flex-wrap items-center gap-1"
    >
      {ITENS.map((item) => {
        const Icone = item.icone;
        const selecionado = item.id === ativo;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selecionado ? "page" : undefined}
            onClick={() => set("rel", item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-detalhe transition-colors",
              selecionado
                ? "border-primary/30 bg-primary/10 font-medium text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Icone className="size-4" aria-hidden="true" />
            {item.rotulo}
          </button>
        );
      })}
    </nav>
  );
}
