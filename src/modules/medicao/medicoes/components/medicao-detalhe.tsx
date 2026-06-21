"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, MoneyText, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import {
  ROTULO_REAJUSTE,
  STATUS_MEDICAO,
} from "@/modules/medicao/_shared/formato";
import {
  cancelarMedicao,
  desaprovarMedicao,
  removerItem,
} from "@/modules/medicao/medicoes/actions";
import type {
  ItemMedido,
  MedicaoDetalhe,
} from "@/modules/medicao/medicoes/queries";
import { AprovarMedicaoDialog } from "./aprovar-medicao-dialog";
import { BotaoBoletim } from "./botao-boletim";
import { EditarCabecalhoDrawer } from "./editar-cabecalho-drawer";
import { ItemMedicaoFormDrawer } from "./item-medicao-form-drawer";

/** Card de seção do detalhe (borda + superfície), com título e ação. */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha rotulada para os dados do cabeçalho. */
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

export interface MedicaoDetalheViewProps {
  medicao: MedicaoDetalhe;
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

/**
 * Detalhe da medição: cabeçalho com obra, competência, status, valores e
 * reajuste (editável no rascunho); barra de ações conforme o estado; e a tabela
 * de itens com a previsão (anterior/atual/total/saldo/valor). No rascunho dá
 * para adicionar, editar e remover itens. Exportar boletim em qualquer estado.
 */
export function MedicaoDetalheView({
  medicao,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: MedicaoDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_MEDICAO[medicao.status];

  const rascunho = medicao.status === "rascunho";
  const aprovada = medicao.status === "aprovada";

  const [drawerItem, setDrawerItem] = React.useState(false);
  const [itemEditando, setItemEditando] = React.useState<ItemMedido | null>(
    null,
  );
  const [drawerCabecalho, setDrawerCabecalho] = React.useState(false);
  const [dialogAprovar, setDialogAprovar] = React.useState(false);
  const [dialogCancelar, setDialogCancelar] = React.useState(false);
  const [dialogDesaprovar, setDialogDesaprovar] = React.useState(false);

  const podeMexerItens = podeEditar && rascunho;
  // Total previsto do rascunho (a aprovação fecha os valores no banco).
  const brutoPrevisto = medicao.itens.reduce(
    (soma, item) => soma + item.valor,
    0,
  );

  function abrirNovoItem() {
    setItemEditando(null);
    setDrawerItem(true);
  }

  function abrirEditarItem(item: ItemMedido) {
    setItemEditando(item);
    setDrawerItem(true);
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarMedicao(medicao.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Medição cancelada");
    router.refresh();
  }

  async function aoDesaprovar(motivo?: string) {
    const resultado = await desaprovarMedicao(medicao.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Medição desaprovada");
    router.refresh();
  }

  async function aoRemoverItem(itemId: string) {
    const resultado = await removerItem(medicao.id, itemId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Item removido");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/medicao/medicoes")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">
                  {medicao.numero ?? "Sem número"}
                </span>
              </h1>
              <StatusBadge status={info.badge} rotulo={info.rotulo} />
            </div>
            <p className="text-detalhe text-muted-foreground">
              {medicao.obraNome}
              {medicao.obraLote ? ` (Lote ${medicao.obraLote})` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeAprovar && rascunho ? (
            <Button type="button" size="sm" onClick={() => setDialogAprovar(true)}>
              <CheckCircle2 />
              Aprovar
            </Button>
          ) : null}
          {podeDesaprovar && aprovada ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogDesaprovar(true)}
            >
              <RotateCcw />
              Desaprovar
            </Button>
          ) : null}
          {podeEditar && rascunho ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDialogCancelar(true)}
            >
              <Ban />
              Cancelar
            </Button>
          ) : null}
          <BotaoBoletim medicaoId={medicao.id} />
        </div>
      </div>

      {medicao.motivoCancelamento ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do cancelamento
          </p>
          <p className="text-detalhe text-foreground">
            {medicao.motivoCancelamento}
          </p>
        </div>
      ) : null}

      <Secao
        titulo="Dados da medição"
        acao={
          podeMexerItens ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerCabecalho(true)}
            >
              <Pencil />
              Editar
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dado rotulo="Obra">
            {medicao.obraNome}
            {medicao.obraLote ? ` (Lote ${medicao.obraLote})` : ""}
          </Dado>
          <Dado rotulo="Planilha">{medicao.planilhaNome ?? "-"}</Dado>
          <Dado rotulo="Competência">{formatarData(medicao.competencia)}</Dado>
          <Dado rotulo="Aprovação">
            {medicao.dataAprovacao ? formatarData(medicao.dataAprovacao) : "-"}
          </Dado>
          <Dado rotulo="Reajuste">
            {ROTULO_REAJUSTE[medicao.reajusteTipo]}
            {medicao.reajusteTipo === "percentual"
              ? ` (${formatarQuantidade(medicao.reajusteValor)}%)`
              : null}
          </Dado>
          {medicao.reajusteTipo === "valor" ? (
            <Dado rotulo="Valor do reajuste">
              <MoneyText valor={medicao.reajusteValor} />
            </Dado>
          ) : null}
        </div>
        {medicao.descricao ? (
          <div className="mt-4">
            <Dado rotulo="Descrição">{medicao.descricao}</Dado>
          </div>
        ) : null}
      </Secao>

      <Secao titulo="Valores">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dado rotulo={aprovada ? "Valor bruto" : "Valor bruto previsto"}>
            <MoneyText valor={aprovada ? medicao.valorBruto : brutoPrevisto} />
          </Dado>
          <Dado rotulo="Reajuste">
            <MoneyText valor={aprovada ? medicao.valorReajuste : 0} />
          </Dado>
          <Dado rotulo={aprovada ? "Valor total" : "Total previsto"}>
            <MoneyText
              valor={aprovada ? medicao.valorTotal : brutoPrevisto}
              className="font-semibold"
            />
          </Dado>
        </div>
        {!aprovada ? (
          <p className="mt-3 text-legenda text-muted-foreground">
            Os valores são fechados na aprovação. O reajuste é aplicado nesse
            momento.
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Itens medidos"
        acao={
          podeMexerItens ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={abrirNovoItem}
            >
              <Plus />
              Adicionar item
            </Button>
          ) : null
        }
      >
        {medicao.itens.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum item medido ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-left font-medium">Unid.</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Qtd. contratada
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Acum. anterior
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Atual</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Acum. total
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Preço</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  {podeMexerItens ? (
                    <th className="px-3 py-2 text-right font-medium" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {medicao.itens.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 codigo-doc text-muted-foreground">
                      {item.codigo ?? "-"}
                    </td>
                    <td className="px-3 py-2">{item.descricao}</td>
                    <td className="px-3 py-2">{item.unidadeSigla ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.quantidadeContratada)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatarQuantidade(item.acumuladoAnterior)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatarQuantidade(item.atual)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.acumuladoTotal)}
                    </td>
                    <td
                      className={
                        item.saldo < 0
                          ? "px-3 py-2 text-right tabular-nums text-destructive"
                          : "px-3 py-2 text-right tabular-nums"
                      }
                    >
                      {formatarQuantidade(item.saldo)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.precoUnitario} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.valor} />
                    </td>
                    {podeMexerItens ? (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Editar item"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => abrirEditarItem(item)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remover item"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => aoRemoverItem(item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {podeMexerItens ? (
        <>
          <ItemMedicaoFormDrawer
            aberto={drawerItem}
            onAbertoChange={setDrawerItem}
            medicaoId={medicao.id}
            item={itemEditando}
            disponiveis={medicao.disponiveis}
          />
          <EditarCabecalhoDrawer
            aberto={drawerCabecalho}
            onAbertoChange={setDrawerCabecalho}
            medicao={medicao}
          />
        </>
      ) : null}

      {podeAprovar && rascunho ? (
        <AprovarMedicaoDialog
          aberto={dialogAprovar}
          onAbertoChange={setDialogAprovar}
          medicaoId={medicao.id}
        />
      ) : null}

      {podeEditar && rascunho ? (
        <ConfirmDialog
          aberto={dialogCancelar}
          onAbertoChange={setDialogCancelar}
          titulo="Cancelar medição"
          descricao="Informe o motivo. Só dá para cancelar uma medição em rascunho."
          textoConfirmar="Cancelar medição"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={aoCancelar}
        />
      ) : null}

      {podeDesaprovar && aprovada ? (
        <ConfirmDialog
          aberto={dialogDesaprovar}
          onAbertoChange={setDialogDesaprovar}
          titulo="Desaprovar medição"
          descricao="A medição volta para rascunho e a fatura é revertida, se ainda não recebida. Informe o motivo."
          textoConfirmar="Desaprovar"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={aoDesaprovar}
        />
      ) : null}
    </div>
  );
}
