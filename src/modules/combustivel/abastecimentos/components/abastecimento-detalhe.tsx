"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";

import { CelulaVazia, ConfirmDialog, DataTable, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarPercentual, formatarQuantidade } from "@/lib/formatadores";
import {
  formatarDataHoraRioBranco,
  formatarLitros,
  ROTULO_CANAL,
  ROTULO_ORIGEM_SAIDA,
  ROTULO_TIPO_CONSUMIDOR,
  ROTULO_TIPO_MOVIMENTO,
} from "@/modules/combustivel/_shared/rotulos";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { AnexosCombustivel } from "@/modules/combustivel/_shared/components/anexos-combustivel";
import { excluirAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import type {
  AbastecimentoCompleto,
  AlocacaoDetalhe,
  CamadaPeps,
  MovimentoConta,
} from "@/modules/combustivel/abastecimentos/queries";
import { formatarValorOperacional, somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { AbastecimentoFormDrawer, type OpcoesAbastecimento } from "./abastecimento-form-drawer";

const ROTA_LISTA = "/combustivel/abastecimentos";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

function Preco({ valor }: { valor: number | null }) {
  if (valor === null) return <CelulaVazia />;
  return <span className="tabular-nums">{formatarValorOperacional(valor)}</span>;
}

/** Número da tabela: à direita, tabular, em uma linha. */
function Numero({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

/** Total do rodapé: o peso vai na célula, que é quem sabe o que é número. */
function Total({ children }: { children: React.ReactNode }) {
  return <span className="font-medium tabular-nums">{children}</span>;
}

/** As camadas na ordem em que o PEPS as consumiu: a ordem é a informação, não ordena. */
const COLUNAS_CAMADAS: ColumnDef<CamadaPeps, unknown>[] = [
  {
    id: "fonte",
    header: "Fonte",
    enableSorting: false,
    meta: { celular: "titulo" },
    cell: ({ row }) => (row.original.fonteTipo === "entrada" ? "Entrada" : "Transferência recebida"),
  },
  {
    id: "dataFonte",
    header: "Data da fonte",
    enableSorting: false,
    meta: { atomico: true },
    cell: ({ row }) =>
      row.original.fonteData ? formatarDataHoraRioBranco(row.original.fonteData) : <CelulaVazia />,
  },
  {
    id: "notaFiscal",
    header: "NF",
    enableSorting: false,
    meta: { atomico: true },
    cell: ({ row }) =>
      row.original.fonteNotaFiscal ? <span className="codigo-doc">{row.original.fonteNotaFiscal}</span> : <CelulaVazia />,
  },
  {
    id: "litros",
    header: "Litros",
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "destaque" },
    cell: ({ row }) => <Numero>{formatarLitros(row.original.litros)}</Numero>,
  },
  {
    id: "preco",
    header: "Preço por litro",
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.preco)}</Numero>,
  },
  {
    id: "valor",
    header: "Valor",
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.litros * row.original.preco)}</Numero>,
  },
];

const COLUNAS_MOVIMENTOS: ColumnDef<MovimentoConta, unknown>[] = [
  {
    id: "movimento",
    accessorFn: (m) => ROTULO_TIPO_MOVIMENTO[m.tipo] ?? m.tipo,
    header: "Movimento",
    meta: { celular: "titulo" },
    cell: ({ row }) => ROTULO_TIPO_MOVIMENTO[row.original.tipo] ?? row.original.tipo,
  },
  { accessorKey: "transportadoraNome", header: "Fornecedor" },
  {
    accessorKey: "data",
    header: "Data",
    meta: { atomico: true },
    cell: ({ row }) => formatarDataHoraRioBranco(row.original.data),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.valor)}</Numero>,
  },
];

const COLUNAS_ALOCACOES: ColumnDef<AlocacaoDetalhe, unknown>[] = [
  { accessorKey: "centroCustoNome", header: "Obra", meta: { celular: "titulo" } },
  {
    accessorKey: "percentual",
    header: "Percentual",
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarPercentual(row.original.percentual, 4)}</Numero>,
  },
  {
    accessorKey: "litros",
    header: "Litros",
    meta: { alinharDireita: true, atomico: true, celular: "destaque" },
    cell: ({ row }) => <Numero>{formatarLitros(row.original.litros)}</Numero>,
  },
];

/**
 * O corpo do detalhe (dados, camadas do PEPS, conta corrente e alocações), sem cabeçalho
 * nem ações: serve a página `[id]` e o drawer de detalhe da lista.
 */
export function AbastecimentoDetalheConteudo({ abastecimento }: { abastecimento: AbastecimentoCompleto }) {
  const { saida, camadas, movimentos, alocacoes, semSuprimento } = abastecimento;
  const carreta = saida.tipoConsumidor === "carreta_transportadora";
  const litrosCamadas = somarValoresOperacionais(camadas.map((c) => c.litros));
  const valorCamadas = somarValoresOperacionais(camadas.map((c) => c.litros * c.preco));

  return (
    <div className="flex flex-col gap-6">
      {semSuprimento ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
          <p>
            Sem suprimento: o tanque não tinha camada para {formatarLitros(semSuprimento.litrosSemSuprimento)} dos{" "}
            {formatarLitros(semSuprimento.litrosSolicitados)} pedidos. O preço saiu só das camadas encontradas.
          </p>
        </div>
      ) : null}

      <SecaoDetalhe titulo="Dados" card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dado rotulo="Consumidor">{ROTULO_TIPO_CONSUMIDOR[saida.tipoConsumidor]}</Dado>
          <Dado rotulo="Origem">{ROTULO_ORIGEM_SAIDA[saida.origem]}</Dado>
          <Dado rotulo="Tanque">
            {saida.tanqueNome ? `${saida.tanqueNome}${saida.tanqueExterno ? " (externo)" : ""}` : <CelulaVazia />}
          </Dado>
          <Dado rotulo="Combustível">{saida.insumoNome}</Dado>
          {carreta ? (
            <>
              <Dado rotulo="Transportadora">{saida.transportadoraNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo="Placa">{saida.placa ? <span className="codigo-doc">{saida.placa}</span> : <CelulaVazia />}</Dado>
              <Dado rotulo="Motorista">{saida.motorista ?? <CelulaVazia />}</Dado>
            </>
          ) : (
            <>
              <Dado rotulo="Equipamento">{saida.equipamentoNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo="Centro de custo">{saida.centroCustoNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo={saida.tipoMedicao === "km" ? "Hodômetro" : "Horímetro"}>
                {saida.medicao !== null ? (
                  <span className="tabular-nums">
                    {formatarQuantidade(saida.medicao)} {saida.tipoMedicao === "km" ? "km" : "h"}
                  </span>
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
            </>
          )}
          <Dado rotulo="Litros">
            <span className="tabular-nums">{formatarLitros(saida.litros)}</span>
          </Dado>
          <Dado rotulo="Preço por litro">
            <Preco valor={saida.precoUnitario} />
          </Dado>
          <Dado rotulo="Valor">
            <Preco valor={saida.valorTotal} />
          </Dado>
          {carreta && saida.origem === "tanque" ? (
            <>
              <Dado rotulo="Preço cobrado da transportadora">
                <Preco valor={saida.precoCombustivel} />
              </Dado>
              {saida.tanqueExterno ? (
                <Dado rotulo="Preço que o dono cobra">
                  <Preco valor={saida.precoProprietario} />
                </Dado>
              ) : null}
              <Dado rotulo="Taxa por litro">
                <Preco valor={saida.taxaLitro} />
              </Dado>
            </>
          ) : null}
          {saida.origem === "requisicao" ? (
            <Dado rotulo="Pagamento">
              {saida.pago ? `Pago${saida.pagoEm ? ` em ${formatarData(saida.pagoEm)}` : ""}` : "A pagar"}
            </Dado>
          ) : null}
          <Dado rotulo="Canal">{ROTULO_CANAL[saida.canal]}</Dado>
        </div>
        {saida.observacoes ? <p className="mt-4 whitespace-pre-wrap text-detalhe">{saida.observacoes}</p> : null}
      </SecaoDetalhe>

      {saida.origem === "tanque" && !saida.tanqueExterno ? (
        <SecaoDetalhe titulo="Camadas do PEPS">
          {camadas.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">Nenhuma camada consumida</p>
          ) : (
            <DataTable
              idTabela="combustivel.abastecimentos.detalhe.camadas"
              columns={COLUNAS_CAMADAS}
              data={camadas}
              idDaLinha={(c) => c.id}
              semPaginacao
              rodape={{
                fonte: <Total>Total</Total>,
                litros: <Total>{formatarLitros(litrosCamadas)}</Total>,
                valor: <Total>{formatarValorOperacional(valorCamadas)}</Total>,
              }}
            />
          )}
        </SecaoDetalhe>
      ) : null}

      {carreta ? (
        <SecaoDetalhe titulo="Conta corrente da transportadora">
          {movimentos.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">
              Nenhum movimento: só abastecimento de carreta em tanque gera movimento
            </p>
          ) : (
            <DataTable
              idTabela="combustivel.abastecimentos.detalhe.conta-corrente"
              columns={COLUNAS_MOVIMENTOS}
              data={movimentos}
              idDaLinha={(m) => m.id}
              semPaginacao
            />
          )}
        </SecaoDetalhe>
      ) : null}

      <SecaoDetalhe titulo="Alocações">
        {alocacoes.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">Sem alocação de obra</p>
        ) : (
          <DataTable
            idTabela="combustivel.abastecimentos.detalhe.alocacoes"
            columns={COLUNAS_ALOCACOES}
            data={alocacoes}
            idDaLinha={(a) => a.id}
            semPaginacao
          />
        )}
      </SecaoDetalhe>
    </div>
  );
}

export interface AbastecimentoDetalheViewProps {
  abastecimento: AbastecimentoCompleto;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Fotos e arquivos da saída, lidos no servidor. */
  anexos: AnexoDoDocumento[];
  /** Carregadas só quando dá para editar. */
  opcoes: OpcoesAbastecimento;
}

/**
 * Detalhe do abastecimento: os dados com as 4 casas, as camadas do PEPS que ele
 * consumiu, os movimentos que gerou na conta corrente da transportadora e as
 * alocações. Tudo vem do banco; a tela não soma preço nem valor para gravar.
 */
export function AbastecimentoDetalheView({
  abastecimento,
  podeEditar,
  podeExcluir,
  anexos,
  opcoes,
}: AbastecimentoDetalheViewProps) {
  const router = useRouter();
  const { saida } = abastecimento;
  const [editando, setEditando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);

  async function aoExcluir(motivo?: string) {
    const resultado = await excluirAbastecimento(saida.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Abastecimento excluído");
    setExcluindo(false);
    semDerrubarSucesso("combustivel.saidas.excluir", () => router.push(ROTA_LISTA));
  }

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo={saida.consumidor || "Abastecimento"}
        descricao={`${formatarDataHoraRioBranco(saida.data)} · ${formatarLitros(saida.litros)} de ${saida.insumoNome}`}
        voltarPara={{ rota: ROTA_LISTA, rotulo: "Abastecimentos" }}
        acoes={
          <>
            {podeEditar ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                Editar abastecimento
              </Button>
            ) : null}
            {podeExcluir ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setExcluindo(true)}>
                <Trash2 />
                Excluir abastecimento
              </Button>
            ) : null}
          </>
        }
      />

      <AbastecimentoDetalheConteudo abastecimento={abastecimento} />

      <div className="mt-6">
        <SecaoDetalhe titulo="Anexos">
          <AnexosCombustivel
            entidade="combustivel_saida"
            entidadeId={saida.id}
            anexos={anexos}
            podeEditar={podeEditar}
            onMudou={() => semDerrubarSucesso("combustivel.saidas.anexos", () => router.refresh())}
          />
        </SecaoDetalhe>
      </div>

      {podeEditar ? (
        <AbastecimentoFormDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          abastecimento={abastecimento}
          opcoes={opcoes}
          onSalvo={() => semDerrubarSucesso("combustivel.saidas.editar", () => router.refresh())}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo}
        onAbertoChange={setExcluindo}
        titulo="Excluir abastecimento"
        descricao={`O abastecimento de ${formatarLitros(saida.litros)} sai do tanque e da conta corrente, e o PEPS do tanque é refeito. Se for de ciclo fechado, a exclusão é recusada.`}
        textoConfirmar="Excluir abastecimento"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
    </>
  );
}
