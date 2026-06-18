"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import {
  FormDrawer,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { AnexosRegistro } from "@/modules/compras/_shared/anexos";
import { infoStatusRecebimento } from "@/modules/compras/_shared/formato";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import {
  carregarRecebimento,
  carregarTrilhaRecebimento,
} from "@/modules/compras/recebimentos/actions";
import type { RecebimentoDetalhe } from "@/modules/compras/recebimentos/queries";

export interface RecebimentoDetalheDrawerProps {
  recebimentoId: string | null;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Libera anexar/remover anexos (mesma permissão de criar recebimento). */
  podeEditar: boolean;
}

/** Linha rótulo + valor do bloco de dados da nota. */
function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/**
 * Detalhe de um recebimento: dados da nota, itens recebidos, link para a OC,
 * anexos e trilha. Carrega o registro e a trilha por server action ao abrir.
 */
export function RecebimentoDetalheDrawer({
  recebimentoId,
  aberto,
  onAbertoChange,
  podeEditar,
}: RecebimentoDetalheDrawerProps) {
  const [detalhe, setDetalhe] = React.useState<RecebimentoDetalhe | null>(null);
  const [trilha, setTrilha] = React.useState<EventoTrilha[]>([]);
  // Começa carregando: o componente é remontado a cada recebimento aberto
  // (key no pai), então não há setState síncrono de loading no efeito.
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    if (!aberto || !recebimentoId) return;

    let ativo = true;
    Promise.all([
      carregarRecebimento(recebimentoId),
      carregarTrilhaRecebimento(recebimentoId),
    ])
      .then(([registro, eventos]) => {
        if (!ativo) return;
        setDetalhe(registro);
        setTrilha(eventos);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, recebimentoId]);

  const info = detalhe ? infoStatusRecebimento(detalhe.status) : null;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={detalhe?.numero ? `Recebimento ${detalhe.numero}` : "Recebimento"}
      descricao="Conferência da nota fiscal e quantidades recebidas"
      larguraClassName="sm:max-w-2xl"
    >
      {carregando ? (
        <p className="text-detalhe text-muted-foreground">Carregando</p>
      ) : !detalhe ? (
        <p className="text-detalhe text-muted-foreground">
          Recebimento não encontrado
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="codigo-doc text-detalhe">
                {detalhe.numero ?? "Sem número"}
              </span>
              {info ? (
                <StatusBadge status={info.badge} rotulo={info.rotulo} />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-surface p-4">
              <Dado rotulo="Ordem de compra">
                {detalhe.ordemCompraNumero ? (
                  <Link
                    href={`/compras/ordens/${detalhe.ordemCompraId}`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <span className="codigo-doc">
                      {detalhe.ordemCompraNumero}
                    </span>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  "-"
                )}
              </Dado>
              <Dado rotulo="Fornecedor">{detalhe.fornecedorNome}</Dado>
              <Dado rotulo="Nota fiscal">
                <span className="codigo-doc">{detalhe.numeroNf ?? "-"}</span>
              </Dado>
              <Dado rotulo="Valor da nota">
                <MoneyText
                  valor={detalhe.valorNf}
                  className="block text-left"
                />
              </Dado>
              <Dado rotulo="Recebido em">
                <span className="tabular-nums">
                  {formatarData(detalhe.dataRecebimento)}
                </span>
              </Dado>
              <Dado rotulo="Vencimento">
                <span className="tabular-nums">
                  {detalhe.dataVencimento
                    ? formatarData(detalhe.dataVencimento)
                    : "-"}
                </span>
              </Dado>
            </div>

            {detalhe.observacoes ? (
              <Dado rotulo="Observações">{detalhe.observacoes}</Dado>
            ) : null}
          </div>

          <SecaoDetalhe titulo="Itens recebidos">
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Insumo</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Recebido
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium">{item.insumoNome}</span>
                        {item.insumoCodigo ? (
                          <span className="ml-1 codigo-doc text-muted-foreground">
                            {item.insumoCodigo}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarQuantidade(item.quantidadeRecebida)}
                        {item.unidadeSigla ? ` ${item.unidadeSigla}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SecaoDetalhe>

          <SecaoDetalhe titulo="Anexos">
            <AnexosRegistro
              tabela="recebimentos"
              registroId={detalhe.id}
              podeEditar={podeEditar}
            />
          </SecaoDetalhe>

          <SecaoDetalhe titulo="Trilha">
            <Trilha eventos={trilha} />
          </SecaoDetalhe>
        </div>
      )}
    </FormDrawer>
  );
}
