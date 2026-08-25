"use client";

import {
  Layers,
  Banknote,
  Building2,
  CalendarClock,
  Landmark,
  LineChart,
  Scale,
  Scale3d,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import {
  RELATORIOS,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";

/**
 * Rótulo e ícone de cada relatório. Só isto vive aqui: os ids, o padrão e a
 * normalização do parâmetro da URL estão em `relatorios/relatorios.ts`, módulo
 * neutro, porque a página é Server Component e precisa chamar a normalização.
 * Função exportada de módulo "use client" não pode ser chamada do servidor.
 */
const APRESENTACAO: Record<RelatorioId, { rotulo: string; icone: LucideIcon }> =
  {
    "fluxo-caixa": { rotulo: "Fluxo de caixa", icone: LineChart },
    dre: { rotulo: "DRE gerencial", icone: Scale },
    aging: { rotulo: "Aging", icone: CalendarClock },
    "posicao-bancaria": { rotulo: "Posição bancária", icone: Banknote },
    endividamento: { rotulo: "Endividamento", icone: Landmark },
    "custo-cc": { rotulo: "Custo por centro de custo", icone: Building2 },
    "custo-receita": { rotulo: "Custo x receita", icone: Scale3d },
    "custo-grupo": { rotulo: "Custo por grupo de insumo", icone: Layers },
    "extrato-fornecedor": { rotulo: "Extrato por fornecedor", icone: Users },
  };

interface RelatoriosNavProps {
  ativo: RelatorioId;
}

/**
 * Navegação entre os relatórios. Troca o parâmetro `rel` na URL (replace),
 * o que faz o Server Component re-renderizar com os dados do relatório certo.
 */
export function RelatoriosNav({ ativo }: RelatoriosNavProps) {
  const { set } = useFiltrosUrl();

  return (
    <nav
      aria-label="Relatórios financeiros"
      className="flex flex-wrap items-center gap-1"
    >
      {RELATORIOS.map((id) => {
        const { rotulo, icone: Icone } = APRESENTACAO[id];
        const selecionado = id === ativo;
        return (
          <button
            key={id}
            type="button"
            aria-current={selecionado ? "page" : undefined}
            onClick={() => set("rel", id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-detalhe transition-colors",
              selecionado
                ? "border-primary/30 bg-primary/10 font-medium text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Icone className="size-4" aria-hidden="true" />
            {rotulo}
          </button>
        );
      })}
    </nav>
  );
}
