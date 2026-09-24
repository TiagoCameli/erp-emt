"use client";

import { Calendar, Container, Droplet, FileText, Gauge, Pencil, Trash2, Truck, Wallet } from "lucide-react";

import { MoneyText, SecaoDetalhe } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarQuantidade } from "@/lib/formatadores";
import { AnexosCombustivel, useAnexosDoRegistro } from "@/modules/combustivel/_shared/components/anexos-combustivel";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import {
  BadgeCombustivel,
  CampoDetalhe,
  formatarDataHoraCurta,
  KpiDetalhe,
} from "@/modules/combustivel/_shared/components/lista-operacional";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

export interface EntradaDetalheDrawerProps {
  entrada: EntradaLinha | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (entrada: EntradaLinha) => void;
  onExcluir: (entrada: EntradaLinha) => void;
}

/**
 * O EntradaDetalhesDrawer da origem: leitura sem entrar em edição. Tudo sai da linha da
 * lista (a entrada não tem camada nem movimento a buscar). Rodapé com Editar e Excluir.
 */
export function EntradaDetalheDrawer({
  entrada,
  onFechar,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: EntradaDetalheDrawerProps) {
  const lancada = entrada !== null && entrada.excluidoEm === null;
  const anexos = useAnexosDoRegistro("combustivel_entrada", entrada?.id ?? null);
  return (
    <Sheet
      open={entrada !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Entrada de combustível</SheetTitle>
          <SheetDescription>{entrada ? formatarDataHoraCurta(entrada.dataHora) : ""}</SheetDescription>
        </SheetHeader>

        {entrada ? (
          <div className="flex flex-col gap-5 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <KpiDetalhe icone={Droplet} rotulo="Litros">
                {formatarLitros(entrada.litros)}
              </KpiDetalhe>
              <KpiDetalhe icone={Wallet} rotulo="Valor">
                <MoneyText valor={entrada.valorTotal} />
              </KpiDetalhe>
              <KpiDetalhe icone={Gauge} rotulo="R$/L">
                {entrada.precoLitro !== null ? formatarValorOperacional(entrada.precoLitro) : "—"}
              </KpiDetalhe>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <CampoDetalhe icone={Calendar} rotulo="Data e hora">
                {formatarDataHoraCurta(entrada.dataHora)}
              </CampoDetalhe>
              <CampoDetalhe icone={Container} rotulo="Tanque">
                {entrada.tanqueNome}
              </CampoDetalhe>
              <CampoDetalhe icone={Droplet} rotulo="Combustível">
                <BadgeCombustivel nome={entrada.insumoNome} />
              </CampoDetalhe>
              <CampoDetalhe icone={Truck} rotulo="Fornecedor">
                {entrada.fornecedorNome}
              </CampoDetalhe>
              {entrada.unidade && entrada.unidade.toUpperCase() !== "L" ? (
                <CampoDetalhe icone={FileText} rotulo="Quantidade">
                  {formatarQuantidade(entrada.quantidade)} {entrada.unidade}
                </CampoDetalhe>
              ) : null}
              {entrada.notaFiscal ? (
                <CampoDetalhe icone={FileText} rotulo="Nota fiscal">
                  <span className="codigo-doc">{entrada.notaFiscal}</span>
                </CampoDetalhe>
              ) : null}
            </div>

            {entrada.observacoes ? (
              <CampoDetalhe icone={FileText} rotulo="Observações">
                <p className="whitespace-pre-wrap">{entrada.observacoes}</p>
              </CampoDetalhe>
            ) : null}

            <SecaoDetalhe titulo="Anexos">
              <AnexosCombustivel
                entidade="combustivel_entrada"
                entidadeId={entrada.id}
                anexos={anexos.anexos}
                erro={anexos.erro}
                podeEditar={podeEditar && lancada}
                onMudou={anexos.recarregar}
              />
            </SecaoDetalhe>
          </div>
        ) : null}

        {entrada && lancada && (podeEditar || podeExcluir) ? (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            {podeEditar ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onEditar(entrada)}>
                <Pencil />
                Editar
              </Button>
            ) : null}
            {podeExcluir ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => onExcluir(entrada)}>
                <Trash2 />
                Excluir
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
