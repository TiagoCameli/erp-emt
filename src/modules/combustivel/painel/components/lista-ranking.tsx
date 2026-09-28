import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ranking em HTML, no lugar das barras do Recharts e do treemap (Top equipamentos e Custo
 * por obra). Nome de equipamento e de obra é longo ("Caminhão Caçamba 2425/48 NAB-4669 - 05",
 * "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10"): o eixo do Recharts quebrava o
 * rótulo em 3-4 linhas que se sobrepunham, e o treemap, com uma obra de 83%, virava um bloco
 * só com o resto ilegível. Aqui o nome ocupa uma linha, corta no FIM (o começo é o que
 * identifica: "009 - ...", "Caminhão ...") e o nome inteiro fica no `title`.
 *
 * Uma cor só para a barra: o comprimento já carrega a grandeza. A cor muda pelo que o item É
 * (sentinela, agregado), nunca pela posição.
 */

/** Altura da área do Top e do Custo por obra, que ficam lado a lado: o esqueleto lê a mesma. */
export const ALTURA_RANKING = 340;

export interface ItemRanking {
  id: string;
  nome: string;
  /** Código, transportadora, litros: o segundo dado, apagado, ao lado do nome. */
  detalhe?: string;
  /** Valor formatado, à direita. */
  valor: string;
  /** Complemento do valor (o % da obra), mais apagado. */
  complemento?: string;
  /** 0 a 1: o comprimento da barra. */
  fracao: number;
  cor: string;
  marcado?: boolean;
  /** Apagado porque há outro item marcado no filtro. */
  esmaecido?: boolean;
  /** O "Não identificado": âmbar, com ícone. */
  sentinela?: boolean;
  /** Sem ação no clique ("Sem obra"). */
  inerte?: boolean;
  dica?: string;
}

export function ListaRanking({
  itens,
  onClicar,
  numerar = true,
  mono = false,
  cabecalho,
}: {
  itens: readonly ItemRanking[];
  onClicar: (id: string) => void;
  /** Posição à esquerda (1, 2, 3...). */
  numerar?: boolean;
  /** Placa de carreta. */
  mono?: boolean;
  cabecalho?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {cabecalho}
      <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {itens.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={item.inerte}
              title={item.dica ?? item.nome}
              aria-pressed={item.inerte ? undefined : Boolean(item.marcado)}
              onClick={() => onClicar(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-[background-color,opacity]",
                item.marcado ? "bg-primary/10" : "enabled:hover:bg-muted",
                item.esmaecido && "opacity-45",
                item.inerte && "cursor-default",
              )}
            >
              {numerar ? (
                <span className="w-4 shrink-0 text-right text-legenda tabular-nums text-muted-foreground">{i + 1}</span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-detalhe font-medium",
                        item.sentinela ? "text-status-pendente" : "text-foreground",
                        mono && "font-mono",
                      )}
                    >
                      {item.sentinela ? <AlertTriangle className="size-3 shrink-0 self-center" aria-hidden /> : null}
                      <span className="truncate">{item.nome}</span>
                    </span>
                    {item.detalhe ? (
                      <span className="hidden shrink-[2] truncate text-legenda text-muted-foreground sm:inline">{item.detalhe}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-detalhe tabular-nums text-foreground">
                    {item.valor}
                    {item.complemento ? <span className="ml-1 text-muted-foreground">· {item.complemento}</span> : null}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    data-slot="barra-ranking"
                    className="block h-full rounded-full"
                    style={{
                      // Um fio mínimo para o menor item não sumir; nunca passa de 100%.
                      width: `${Math.min(100, Math.max(item.fracao * 100, 1.5))}%`,
                      background: item.cor,
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
