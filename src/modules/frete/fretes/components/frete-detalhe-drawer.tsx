"use client";

import * as React from "react";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";

import { FormDrawer, GradeKpis, KPICard, MoneyText, SecaoDetalhe, Trilha } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarDataHora, formatarQuantidade } from "@/lib/formatadores";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import { carregarDetalheFrete, registrarChegadaPelaFoto, type DetalheFrete } from "@/modules/frete/fretes/actions";
import { diaBR, tituloDoFrete, tkmDoFrete } from "@/modules/frete/fretes/schemas";
import type { FreteLinha } from "@/modules/frete/fretes/tipos";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { CampoChegada } from "./campo-chegada";

/**
 * Legenda do bloco de fotos da chegada (utils/freteFotoChegada.ts da origem, sem o
 * travessão): sem foto, pendente; com foto, quantas e o dia da chegada.
 */
export function legendaFotosChegada(quantidade: number, dataChegada: string | null): string {
  if (quantidade === 0) return "Pendente: carga ainda não foi confirmada na chegada.";
  const fotos = `${quantidade} ${quantidade === 1 ? "foto" : "fotos"}`;
  return dataChegada ? `${fotos} · registrada em ${diaBR(dataChegada)}` : fotos;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-legenda text-muted-foreground">{rotulo}</dt>
      <dd className="text-detalhe">{children}</dd>
    </div>
  );
}

export interface FreteDetalheDrawerProps {
  frete: FreteLinha | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (frete: FreteLinha) => void;
  onExcluir: (frete: FreteLinha) => void;
}

/** O detalhe no drawer da lista, com Editar e Excluir no rodapé. */
export function FreteDetalheDrawer({
  frete,
  onFechar,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: FreteDetalheDrawerProps) {
  const excluido = Boolean(frete?.excluidoEm);
  return (
    <FormDrawer
      aberto={frete !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo={frete ? tituloDoFrete(frete) : "Frete"}
      descricao={frete ? `${diaBR(frete.data)} · ${frete.transportadoraNome}` : undefined}
      larguraClassName="sm:max-w-3xl"
      rodape={
        frete && !excluido && (podeEditar || podeExcluir) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {podeExcluir ? (
              <Button type="button" variant="outline" onClick={() => onExcluir(frete)}>
                <Trash2 />
                Excluir frete
              </Button>
            ) : null}
            {podeEditar ? (
              <Button type="button" onClick={() => onEditar(frete)}>
                <Pencil />
                Editar frete
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {frete ? <FreteDetalheConteudo key={frete.id} frete={frete} podeEditar={podeEditar} /> : null}
    </FormDrawer>
  );
}

export interface FreteDetalheConteudoProps {
  frete: FreteLinha;
  podeEditar: boolean;
}

/**
 * O corpo do detalhe do frete (FreteDetalhesDrawer + FreteRowExpanded da origem): KPIs,
 * rota, dados, a memória de cálculo "R$/TKM (TKM = km × peso)", o valor do material por
 * tonelada, as fotos da chegada (upload com `editar`, sem senha), os arquivos e o
 * histórico. Serve o drawer da lista e a página `/frete/fretes/[id]`. Quem usa passa
 * `key={frete.id}`: trocar de frete recomeça o carregamento.
 */
export function FreteDetalheConteudo({ frete, podeEditar }: FreteDetalheConteudoProps) {
  const [detalhe, setDetalhe] = React.useState<DetalheFrete | null>(null);
  const [dataChegada, setDataChegada] = React.useState<string | null>(frete.dataChegada);

  React.useEffect(() => {
    let cancelado = false;
    void carregarDetalheFrete(frete.id, { criadoPor: frete.createdBy, alteradoPor: frete.updatedBy })
      .then((resultado) => {
        if (cancelado) return;
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        setDetalhe(resultado);
      })
      .catch(() => {
        if (!cancelado) toast.error("Não foi possível carregar o detalhe do frete");
      });
    return () => {
      cancelado = true;
    };
  }, [frete]);

  async function aoMudarFotosChegada() {
    const fotos = await anexosDoDocumento("frete_chegada", frete.id);
    setDetalhe((atual) => (atual ? { ...atual, anexosChegada: fotos } : atual));
    if (fotos.length > 0 && !dataChegada) {
      const resultado = await registrarChegadaPelaFoto(frete.id);
      if ("erro" in resultado) toast.error(resultado.erro);
      else if (resultado.dataChegada) setDataChegada(resultado.dataChegada);
    }
  }

  const transferencia = frete.tipo === "transferencia";
  const excluido = Boolean(frete.excluidoEm);

  return (
    <div className="flex flex-col gap-5">
      <GradeKpis>
        <KPICard titulo="Peso" valor={`${formatarQuantidade(frete.pesoToneladas)} t`} />
        <KPICard titulo="KM" valor={formatarQuantidade(frete.kmRodados)} />
        <KPICard titulo="Valor frete" valor={<MoneyText valor={frete.valorTotal} />} />
        {transferencia ? (
          <KPICard titulo="Tipo" valor="Transferência" />
        ) : (
          <KPICard titulo="Valor material" valor={<MoneyText valor={frete.valorMaterial} />} />
        )}
      </GradeKpis>

      <div className="flex flex-wrap items-center gap-2 text-detalhe">
        <span className="font-medium">{frete.origemNome || "-"}</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{frete.destinoNome || "-"}</span>
        {transferencia ? <Badge variant="secondary">Transferência</Badge> : null}
      </div>

      <SecaoDetalhe titulo="Dados">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Data de saída">
            <span className="tabular-nums">{diaBR(frete.data)}</span>
          </Campo>
          <Campo rotulo="Data de chegada">
            <CampoChegada
              freteId={frete.id}
              dataChegada={dataChegada}
              podeEditar={podeEditar && !excluido}
              onSalvo={setDataChegada}
            />
          </Campo>
          <Campo rotulo="Transportadora">{frete.transportadoraNome}</Campo>
          <Campo rotulo="Motorista">{frete.motorista}</Campo>
          <Campo rotulo="Placa">
            {frete.placaCarreta ? <span className="codigo-doc">{frete.placaCarreta}</span> : "-"}
          </Campo>
          <Campo rotulo="Material">{frete.insumoNome}</Campo>
          <Campo rotulo="KM rodados">
            <span className="tabular-nums">{formatarQuantidade(frete.kmRodados)}</span>
          </Campo>
          <Campo rotulo="R$ / TKM">
            <span className="tabular-nums">
              {formatarValorOperacional(frete.valorTkm)} (TKM = km × peso ={" "}
              {formatarQuantidade(tkmDoFrete(frete.kmRodados, frete.pesoToneladas))})
            </span>
          </Campo>
          <Campo rotulo="Valor frete">
            <span className="tabular-nums">{formatarValorOperacional(frete.valorTotal)}</span>
          </Campo>
          {transferencia ? (
            <Campo rotulo="Material">Transferência: material já era da EMT</Campo>
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
          <Campo rotulo="Obra">{frete.obraNome ?? "-"}</Campo>
          <Campo rotulo="Nota fiscal">
            {frete.notaFiscal ? <span className="codigo-doc">{frete.notaFiscal}</span> : "-"}
          </Campo>
          {frete.notaFiscal2 ? (
            <Campo rotulo="Nota fiscal 2">
              <span className="codigo-doc">{frete.notaFiscal2}</span>
            </Campo>
          ) : null}
          <Campo rotulo="Criado por">
            {detalhe?.criadoPorNome ?? "-"} · {formatarDataHora(frete.createdAt)}
          </Campo>
          {frete.updatedBy && frete.updatedBy !== frete.createdBy ? (
            <Campo rotulo="Última alteração por">
              {detalhe?.alteradoPorNome ?? "-"} · {formatarDataHora(frete.updatedAt)}
            </Campo>
          ) : null}
          {frete.excluidoEm ? (
            <Campo rotulo="Excluído">
              {formatarDataHora(frete.excluidoEm)}
              {frete.motivoExclusao ? ` · ${frete.motivoExclusao}` : ""}
            </Campo>
          ) : null}
        </dl>
        {frete.observacoes ? (
          <p className="whitespace-pre-wrap text-detalhe">
            <span className="text-muted-foreground">Observações: </span>
            {frete.observacoes}
          </p>
        ) : null}
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Fotos da chegada">
        {detalhe ? (
          <>
            <p className="text-legenda text-muted-foreground" data-testid="legenda-fotos-chegada">
              {legendaFotosChegada(detalhe.anexosChegada.length, dataChegada)}
            </p>
            <Anexos
              entidade="frete_chegada"
              entidadeId={frete.id}
              anexos={detalhe.anexosChegada}
              podeEditar={podeEditar && !excluido}
              onMudou={() => void aoMudarFotosChegada()}
            />
          </>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Arquivos">
        {detalhe ? (
          <Anexos entidade="frete" entidadeId={frete.id} anexos={detalhe.anexosFrete} podeEditar={false} />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Histórico">
        {detalhe ? <Trilha eventos={detalhe.trilha} /> : <Skeleton className="h-24 w-full" />}
      </SecaoDetalhe>
    </div>
  );
}
