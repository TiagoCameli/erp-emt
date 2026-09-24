"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

import { MoneyText, Trilha, type EventoTrilha } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarData, formatarDataHora } from "@/lib/formatadores";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { carregarTrilhaPedido } from "@/modules/frete/pedidos-material/actions";
import type { PedidoLinha } from "@/modules/frete/pedidos-material/queries";
import { PedidoItens } from "./pedido-itens";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface PedidoDetalheProps {
  pedido: PedidoLinha | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (pedido: PedidoLinha) => void;
  onExcluir: (pedido: PedidoLinha) => void;
}

/**
 * Detalhes do pedido (PedidoMaterialDetalhesDrawer da origem): data, fornecedor, itens,
 * total, observações, anexos e a trilha. Quem usa passa `key` com o id do pedido.
 */
export function PedidoDetalhe({ pedido, onFechar, podeEditar, podeExcluir, onEditar, onExcluir }: PedidoDetalheProps) {
  const [trilha, setTrilha] = React.useState<EventoTrilha[] | null>(null);
  const [anexos, setAnexos] = React.useState<AnexoDoDocumento[] | null>(null);
  const id = pedido?.id ?? null;

  React.useEffect(() => {
    if (!id) return;
    let vivo = true;
    carregarTrilhaPedido(id)
      .then((eventos) => vivo && setTrilha(eventos))
      .catch(() => vivo && setTrilha([]));
    anexosDoDocumento("pedido_material", id)
      .then((lista) => vivo && setAnexos(lista))
      .catch(() => vivo && setAnexos([]));
    return () => {
      vivo = false;
    };
  }, [id]);

  const excluido = pedido?.excluidoEm != null;

  return (
    <Sheet open={pedido !== null} onOpenChange={(aberto) => (aberto ? undefined : onFechar())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {pedido ? (
          <>
            <SheetHeader>
              <SheetTitle>Pedido de material</SheetTitle>
              <SheetDescription>
                {pedido.fornecedorNome} · {formatarData(pedido.data)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <Dado rotulo="Data">{formatarData(pedido.data)}</Dado>
                <Dado rotulo="Fornecedor">{pedido.fornecedorNome}</Dado>
                <Dado rotulo="Valor total">
                  <MoneyText valor={pedido.valorTotal} className="font-semibold" />
                </Dado>
                <Dado rotulo="Itens">{pedido.itens.length}</Dado>
                <Dado rotulo="Criado em">{formatarDataHora(pedido.criadoEm)}</Dado>
                <Dado rotulo="Última alteração">{formatarDataHora(pedido.atualizadoEm)}</Dado>
                {excluido ? (
                  <Dado rotulo="Excluído em">
                    {formatarDataHora(pedido.excluidoEm)}
                    {pedido.motivoExclusao ? ` · ${pedido.motivoExclusao}` : ""}
                  </Dado>
                ) : null}
              </div>

              <PedidoItens pedido={pedido} />

              <div>
                <h3 className="mb-2 text-detalhe font-medium">Anexos</h3>
                {anexos === null ? (
                  <p className="text-detalhe text-muted-foreground">Carregando anexos...</p>
                ) : (
                  <Anexos
                    entidade="pedido_material"
                    entidadeId={pedido.id}
                    anexos={anexos}
                    podeEditar={podeEditar && !excluido}
                  />
                )}
              </div>

              <div>
                <h3 className="mb-2 text-detalhe font-medium">Trilha</h3>
                {trilha === null ? (
                  <p className="text-detalhe text-muted-foreground">Carregando trilha...</p>
                ) : (
                  <Trilha eventos={trilha} />
                )}
              </div>

              {!excluido && (podeEditar || podeExcluir) ? (
                <div className="flex flex-wrap gap-2">
                  {podeEditar ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onEditar(pedido)}>
                      <Pencil />
                      Editar pedido
                    </Button>
                  ) : null}
                  {podeExcluir ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onExcluir(pedido)}>
                      <Trash2 />
                      Excluir pedido
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
