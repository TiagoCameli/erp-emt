"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Layers,
  Banknote,
  Building2,
  CalendarClock,
  Landmark,
  LineChart,
  PiggyBank,
  Scale,
  Scale3d,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import {
  lerQuerySessao,
  salvarQuerySessao,
} from "@/components/canonicos/filtros-sessao";
import { cn } from "@/lib/utils";
import {
  PARAM_RELATORIO,
  RELATORIOS,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";

/** Onde os relatórios moram. A barra também aparece fora dela, em Aplicações. */
const ROTA_RELATORIOS = "/financeiro/relatorios";
const ROTA_APLICACOES = "/financeiro/aplicacoes";

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
    creditos: { rotulo: "Créditos", icone: Landmark },
    investimentos: { rotulo: "Investimentos", icone: PiggyBank },
    "custo-cc": { rotulo: "Custo por centro de custo", icone: Building2 },
    "custo-receita": { rotulo: "Custo x receita", icone: Scale3d },
    "custo-grupo": { rotulo: "Custo por grupo de insumo", icone: Layers },
    "extrato-fornecedor": { rotulo: "Extrato por fornecedor", icone: Users },
  };

interface RelatoriosNavProps {
  ativo: RelatorioId;
  /**
   * Investimentos virou a tela Financeiro > Aplicações para quem tem a aba
   * (25/09/2026). Ligado, o botão vai direto para lá.
   */
  investimentosEmAplicacoes?: boolean;
}

/**
 * Navegação entre os relatórios. Dentro de Relatórios, troca o parâmetro `rel`
 * na URL (replace), o que faz o Server Component re-renderizar com os dados do
 * relatório certo.
 *
 * Fora dela (em Aplicações, que faz o papel de Investimentos) a barra leva de
 * volta para Relatórios com a query que a sessão lembrava, trocando só o `rel`.
 *
 * Investimentos NUNCA passa por `rel=investimentos` quando vira Aplicações. Até
 * 28/09/2026 passava, e o `set` gravava `rel=investimentos` na memória de
 * filtros da sessão: abrir Relatórios pelo menu restaurava essa query, o
 * servidor redirecionava para Aplicações de novo, e a pessoa não conseguia mais
 * voltar para os outros relatórios.
 */
export function RelatoriosNav({
  ativo,
  investimentosEmAplicacoes = false,
}: RelatoriosNavProps) {
  const { set } = useFiltrosUrl();
  const router = useRouter();
  const pathname = usePathname();

  function abrir(id: RelatorioId) {
    if (id === ativo) return;
    if (id === "investimentos" && investimentosEmAplicacoes) {
      router.push(ROTA_APLICACOES);
      return;
    }
    if (pathname === ROTA_RELATORIOS) {
      set(PARAM_RELATORIO, id);
      return;
    }
    const params = new URLSearchParams(lerQuerySessao(ROTA_RELATORIOS) ?? "");
    params.set(PARAM_RELATORIO, id);
    const query = params.toString();
    salvarQuerySessao(ROTA_RELATORIOS, query);
    router.push(`${ROTA_RELATORIOS}?${query}`);
  }

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
            onClick={() => abrir(id)}
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
