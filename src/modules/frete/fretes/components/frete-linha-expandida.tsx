"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

import { semDerrubarSucesso } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarQuantidade } from "@/lib/formatadores";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { registrarChegadaPelaFoto } from "@/modules/frete/fretes/actions";
import { tkmDoFrete } from "@/modules/frete/fretes/schemas";
import type { FreteLinha } from "@/modules/frete/fretes/tipos";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { CampoChegada } from "./campo-chegada";
import { legendaFotosChegada } from "./frete-detalhe-drawer";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-legenda font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="text-detalhe">{children}</dd>
    </div>
  );
}

export interface FreteLinhaExpandidaProps {
  frete: FreteLinha;
  podeEditar: boolean;
}

/**
 * A linha expandida da lista de fretes (FreteRowExpanded da origem), em três colunas:
 *
 *   1. Fotos da chegada, com upload quando há `editar` (sem senha, como a origem).
 *   2. Motorista, placa, NF, NF 2 (se houver) e a data de chegada editável.
 *   3. Financeiro: KM rodados, R$/TKM com a memória "TKM = km × peso", valor do frete
 *      e, no frete de material, o valor total e por tonelada; na transferência, o aviso
 *      de que o material já era da EMT (R$ 0,00 leria como material de graça).
 *
 * As fotos são buscadas só quando a linha abre: a lista não carrega anexo de frete
 * nenhum. A primeira foto preenche a chegada vazia, pela mesma regra do detalhe.
 */
export function FreteLinhaExpandida({ frete, podeEditar }: FreteLinhaExpandidaProps) {
  const router = useRouter();
  const [fotos, setFotos] = React.useState<AnexoDoDocumento[] | null>(null);
  const editavel = podeEditar && !frete.excluidoEm;
  const transferencia = frete.tipo === "transferencia";

  React.useEffect(() => {
    let cancelado = false;
    void anexosDoDocumento("frete_chegada", frete.id)
      .then((lista) => {
        if (!cancelado) setFotos(lista);
      })
      .catch(() => {
        if (cancelado) return;
        setFotos([]);
        toast.error("Não foi possível carregar as fotos da chegada");
      });
    return () => {
      cancelado = true;
    };
  }, [frete.id]);

  async function aoMudarFotos() {
    const lista = await anexosDoDocumento("frete_chegada", frete.id);
    setFotos(lista);
    if (lista.length > 0 && !frete.dataChegada) {
      const resultado = await registrarChegadaPelaFoto(frete.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      if (resultado.dataChegada) semDerrubarSucesso("frete.fretes.chegada", () => router.refresh());
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-border p-4 md:grid-cols-3" data-testid="frete-linha-expandida">
      <section className="rounded-md border border-border bg-background p-3" aria-label="Fotos da chegada da carga">
        <div className="mb-3 flex items-start gap-2">
          <PackageCheck className="mt-0.5 size-4 text-primary" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-detalhe font-semibold">Fotos da chegada da carga</h3>
            {fotos ? (
              <p className="text-legenda text-muted-foreground">{legendaFotosChegada(fotos.length, frete.dataChegada)}</p>
            ) : null}
          </div>
        </div>
        {fotos ? (
          <Anexos
            entidade="frete_chegada"
            entidadeId={frete.id}
            anexos={fotos}
            podeEditar={editavel}
            onMudou={() => void aoMudarFotos()}
          />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </section>

      <dl className="flex flex-col gap-2">
        <Campo rotulo="Motorista">{frete.motorista || "-"}</Campo>
        <Campo rotulo="Placa">
          {frete.placaCarreta ? <span className="codigo-doc uppercase">{frete.placaCarreta}</span> : "-"}
        </Campo>
        <Campo rotulo="NF">{frete.notaFiscal ? <span className="codigo-doc">{frete.notaFiscal}</span> : "-"}</Campo>
        {frete.notaFiscal2 ? (
          <Campo rotulo="NF 2">
            <span className="codigo-doc">{frete.notaFiscal2}</span>
          </Campo>
        ) : null}
        <Campo rotulo="Data chegada">
          <CampoChegada freteId={frete.id} dataChegada={frete.dataChegada} podeEditar={editavel} />
        </Campo>
      </dl>

      <dl className="flex flex-col gap-2">
        <Campo rotulo="KM rodados">
          <span className="tabular-nums">{formatarQuantidade(frete.kmRodados)} km</span>
        </Campo>
        <Campo rotulo="R$ / TKM">
          <span className="tabular-nums">
            {formatarValorOperacional(frete.valorTkm)} (TKM = {formatarQuantidade(tkmDoFrete(frete.kmRodados, frete.pesoToneladas))})
          </span>
        </Campo>
        <Campo rotulo="Valor frete">
          <span className="tabular-nums">{formatarValorOperacional(frete.valorTotal)}</span>
        </Campo>
        {transferencia ? (
          <Campo rotulo="Material">
            <span className="text-muted-foreground">Transferência: material já era da EMT</span>
          </Campo>
        ) : (
          <>
            <Campo rotulo="Valor material (total)">
              <span className="tabular-nums">{formatarValorOperacional(frete.valorMaterial)}</span>
            </Campo>
            {frete.precoUnitario > 0 ? (
              <Campo rotulo="Valor material (R$/t)">
                <span className="tabular-nums">{formatarValorOperacional(frete.precoUnitario)}/t</span>
              </Campo>
            ) : null}
          </>
        )}
      </dl>
    </div>
  );
}
