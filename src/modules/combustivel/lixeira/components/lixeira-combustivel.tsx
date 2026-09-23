"use client";

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Droplet,
  PackageX,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog, EmptyState } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { restaurarAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import { restaurarEntrada } from "@/modules/combustivel/entradas/actions";
import { restaurarEsvaziamento } from "@/modules/combustivel/esvaziamentos/actions";
import { textoExclusao, type ItemLixeira } from "@/modules/combustivel/lixeira/montar";
import { TIPOS_LIXEIRA, type PermissoesLixeira, type TipoLixeira } from "@/modules/combustivel/lixeira/permissoes";
import { restaurarTransferencia } from "@/modules/combustivel/transferencias/actions";

/** A action de restaurar de cada módulo (a mesma do "Mostrar excluídos" de cada lista). */
export const RESTAURAR_POR_TIPO: Record<TipoLixeira, (id: string) => Promise<{ ok: true } | { erro: string }>> = {
  saida: restaurarAbastecimento,
  entrada: restaurarEntrada,
  transferencia: restaurarTransferencia,
  esvaziamento: restaurarEsvaziamento,
};

const SECAO: Record<TipoLixeira, { titulo: string; icone: LucideIcon; restaurado: string }> = {
  saida: { titulo: "Saídas excluídas", icone: ArrowUpFromLine, restaurado: "Saída restaurada" },
  entrada: { titulo: "Entradas excluídas", icone: ArrowDownToLine, restaurado: "Entrada restaurada" },
  transferencia: { titulo: "Transferências excluídas", icone: ArrowLeftRight, restaurado: "Transferência restaurada" },
  esvaziamento: { titulo: "Esvaziamentos excluídos", icone: PackageX, restaurado: "Esvaziamento restaurado" },
};

export interface LixeiraCombustivelProps {
  itens: Record<TipoLixeira, ItemLixeira[]>;
  permissoes: PermissoesLixeira;
}

/**
 * A LixeiraTab da origem: os registros excluídos agrupados em seções recolhíveis (Saídas
 * aberta), cada um com o resumo, quem excluiu e quando, e o botão Restaurar. Sem exclusão
 * definitiva, como na origem (histórico contábil).
 *
 * Cada seção só aparece para quem pode ver o recurso; o botão, só para quem pode
 * restaurar aquele recurso. A action confere de novo, e a `fn_comb_restaurar` também.
 */
export function LixeiraCombustivel({ itens, permissoes }: LixeiraCombustivelProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<ItemLixeira | null>(null);

  const tiposVisiveis = TIPOS_LIXEIRA.filter((tipo) => permissoes[tipo].ver);
  const total = tiposVisiveis.reduce((soma, tipo) => soma + itens[tipo].length, 0);

  async function restaurar(item: ItemLixeira) {
    const resultado = await RESTAURAR_POR_TIPO[item.tipo](item.id);
    if ("erro" in resultado) {
      // A recusa do banco (saldo negativo, permissão) vai para a tela, com o texto dela.
      toast.error(resultado.erro);
      return;
    }
    toast.success(SECAO[item.tipo].restaurado);
    // As actions revalidam as listas delas, não esta rota. Depois do sucesso nada vira
    // falha: o refresh só atualiza a lixeira.
    try {
      router.refresh();
    } catch (erro) {
      console.error("[erp-emt] combustivel.lixeira.refresh", erro);
    }
  }

  if (total === 0) {
    return (
      <EmptyState
        icone={Droplet}
        titulo="Lixeira vazia"
        descricao="Nenhum registro excluído. Quando alguém excluir uma saída, entrada, transferência ou esvaziamento, ele aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      {tiposVisiveis
        .filter((tipo) => itens[tipo].length > 0)
        .map((tipo) => (
          <Secao key={tipo} tipo={tipo} quantidade={itens[tipo].length} abertaNoInicio={tipo === "saida"}>
            <ul className="divide-y divide-border">
              {itens[tipo].map((item) => (
                <ItemExcluido
                  key={item.id}
                  item={item}
                  podeRestaurar={permissoes[tipo].restaurar}
                  onRestaurar={() => setConfirmando(item)}
                />
              ))}
            </ul>
          </Secao>
        ))}

      <ConfirmDialog
        aberto={confirmando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setConfirmando(null);
        }}
        titulo="Restaurar registro"
        descricao={
          confirmando
            ? `Restaurar ${confirmando.titulo} (${confirmando.subtitulo})? O saldo dos tanques é recalculado; se a volta deixar algum tanque negativo, o sistema recusa.`
            : ""
        }
        textoConfirmar="Restaurar"
        onConfirmar={async () => {
          if (confirmando) await restaurar(confirmando);
        }}
      />
    </div>
  );
}

function Secao({
  tipo,
  quantidade,
  abertaNoInicio,
  children,
}: {
  tipo: TipoLixeira;
  quantidade: number;
  abertaNoInicio: boolean;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(abertaNoInicio);
  const { titulo, icone: Icone } = SECAO[tipo];
  const Seta = aberta ? ChevronDown : ChevronRight;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        <Seta className="size-4 text-muted-foreground" aria-hidden="true" />
        <Icone className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-detalhe font-semibold">{titulo}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-legenda font-semibold tabular-nums text-muted-foreground">
          {quantidade}
        </span>
      </button>
      {aberta ? <div className="border-t border-border">{children}</div> : null}
    </section>
  );
}

function ItemExcluido({
  item,
  podeRestaurar,
  onRestaurar,
}: {
  item: ItemLixeira;
  podeRestaurar: boolean;
  onRestaurar: () => void;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Droplet className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-detalhe font-medium tabular-nums">{item.titulo}</p>
        <p className="truncate text-legenda text-muted-foreground">{item.subtitulo}</p>
        {item.motivo ? <p className="text-legenda text-muted-foreground">Motivo: {item.motivo}</p> : null}
        <p className="mt-0.5 text-legenda italic text-muted-foreground">{textoExclusao(item)}</p>
      </div>
      {podeRestaurar ? (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRestaurar}>
          <Undo2 className="size-3.5" aria-hidden="true" />
          Restaurar
        </Button>
      ) : null}
    </li>
  );
}
