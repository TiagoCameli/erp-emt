"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ExternalLink, Fuel } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  colunaDinheiro,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  useFiltrosUrl,
} from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  CANAIS,
  formatarDataHoraRioBranco,
  formatarLitros,
  ORIGENS_SAIDA,
  ROTULO_CANAL,
  ROTULO_ORIGEM_SAIDA,
  ROTULO_TIPO_CONSUMIDOR,
  TIPOS_CONSUMIDOR,
} from "@/modules/combustivel/_shared/rotulos";
import { CHAVES_FILTRO_ABASTECIMENTOS as CHAVE, rotaDoAbastecimento } from "@/modules/combustivel/abastecimentos/filtros";
import type { SaidaLista } from "@/modules/combustivel/abastecimentos/queries";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

const OPCOES_ORIGEM = ORIGENS_SAIDA.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM_SAIDA[o] }));
const OPCOES_TIPO = TIPOS_CONSUMIDOR.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONSUMIDOR[t] }));
const OPCOES_CANAL = CANAIS.map((c) => ({ valor: c, rotulo: ROTULO_CANAL[c] }));

/** Colunas da lista. Exportadas para o teste olhar sem montar a tela. */
export const colunasAbastecimentos: ColumnDef<SaidaLista, unknown>[] = [
  colunaData<SaidaLista>("data", "Data", formatarDataHoraRioBranco, { size: 140 }),
  {
    accessorKey: "origem",
    header: "Origem",
    size: 150,
    cell: ({ row }) => ROTULO_ORIGEM_SAIDA[row.original.origem] ?? row.original.origem,
  },
  {
    accessorKey: "consumidor",
    header: "Consumidor",
    size: 280,
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.original.consumidor || "-"}</span>
        <span className="text-legenda text-muted-foreground">
          {ROTULO_TIPO_CONSUMIDOR[row.original.tipoConsumidor] ?? row.original.tipoConsumidor}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "tanqueNome",
    header: "Tanque",
    size: 180,
    cell: ({ row }) =>
      row.original.tanqueNome ? (
        <span className="flex flex-col">
          <span>{row.original.tanqueNome}</span>
          {row.original.tanqueExterno ? <span className="text-legenda text-muted-foreground">Externo</span> : null}
        </span>
      ) : (
        <CelulaVazia />
      ),
  },
  { accessorKey: "insumoNome", header: "Combustível", size: 150 },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  {
    accessorKey: "precoUnitario",
    header: "Preço/L",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarValorOperacional(row.original.precoUnitario)}</span>,
  },
  colunaDinheiro<SaidaLista>("valorTotal", "Valor", { size: 140 }),
  {
    accessorKey: "canal",
    header: "Canal",
    size: 110,
    cell: ({ row }) => ROTULO_CANAL[row.original.canal] ?? row.original.canal,
  },
];

export interface OpcaoFiltroAbastecimento {
  id: string;
  rotulo: string;
}

export interface AbastecimentosTabelaProps {
  abastecimentos: SaidaLista[];
  total: number;
  litrosDoFiltro: number;
  valorDoFiltro: number;
  pagina: number;
  tamanho: number;
  de: string;
  ate: string;
  tanqueId: string;
  equipamentoId: string;
  transportadoraId: string;
  tipo: string;
  origem: string;
  canal: string;
  tanques: OpcaoFiltroAbastecimento[];
  equipamentos: OpcaoFiltroAbastecimento[];
  transportadoras: OpcaoFiltroAbastecimento[];
}

/**
 * Abastecimentos: paginação e filtros no servidor, na URL (são ~3.100). O rodapé
 * soma litros e valor de TODOS os do filtro (vem do servidor).
 */
export function AbastecimentosTabela({
  abastecimentos,
  total,
  litrosDoFiltro,
  valorDoFiltro,
  pagina,
  tamanho,
  de,
  ate,
  tanqueId,
  equipamentoId,
  transportadoraId,
  tipo,
  origem,
  canal,
  tanques,
  equipamentos,
  transportadoras,
}: AbastecimentosTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      [CHAVE.pagina]: String(paginacao.pageIndex + 1),
      [CHAVE.tamanho]: String(paginacao.pageSize),
    });
  }

  function abrir(saida: SaidaLista) {
    router.push(rotaDoAbastecimento(saida.id));
  }

  function filtroSelect(chave: string, valor: string, opcoes: { valor: string; rotulo: string }[], rotulo: string, todos: string) {
    return (
      <FiltroSelect
        valor={valor}
        onValorChange={(novo) => setMuitos({ [chave]: novo === "" ? null : novo, [CHAVE.pagina]: "1" })}
        opcoes={opcoes}
        placeholder={rotulo}
        todosRotulo={todos}
      />
    );
  }

  const paraOpcoes = (lista: OpcaoFiltroAbastecimento[]) => lista.map((o) => ({ valor: o.id, rotulo: o.rotulo }));

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="combustivel.saidas"
        columns={colunasAbastecimentos}
        data={abastecimentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={abrir}
        onLimparFiltros={limparTodos}
        cabecalhoFixo
        filtros={[
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ [CHAVE.de]: null, [CHAVE.ate]: null, [CHAVE.pagina]: "1" }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({
                    [CHAVE.de]: novoDe === "" ? null : novoDe,
                    [CHAVE.ate]: novoAte === "" ? null : novoAte,
                    [CHAVE.pagina]: "1",
                  })
                }
              />
            ),
          },
          {
            id: "tanque",
            rotulo: "Tanque",
            temValor: tanqueId !== "",
            onLimpar: () => setMuitos({ [CHAVE.tanque]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(CHAVE.tanque, tanqueId, paraOpcoes(tanques), "Tanque", "Todos os tanques"),
          },
          {
            id: "equipamento",
            rotulo: "Equipamento",
            temValor: equipamentoId !== "",
            onLimpar: () => setMuitos({ [CHAVE.equipamento]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(
              CHAVE.equipamento,
              equipamentoId,
              paraOpcoes(equipamentos),
              "Equipamento",
              "Todos os equipamentos",
            ),
          },
          {
            id: "transportadora",
            rotulo: "Transportadora",
            temValor: transportadoraId !== "",
            onLimpar: () => setMuitos({ [CHAVE.transportadora]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(
              CHAVE.transportadora,
              transportadoraId,
              paraOpcoes(transportadoras),
              "Transportadora",
              "Todas as transportadoras",
            ),
          },
          {
            id: "tipo",
            rotulo: "Consumidor",
            temValor: tipo !== "",
            onLimpar: () => setMuitos({ [CHAVE.tipo]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(CHAVE.tipo, tipo, OPCOES_TIPO, "Consumidor", "Todos os consumidores"),
          },
          {
            id: "origem",
            rotulo: "Origem",
            ocultoPorPadrao: true,
            temValor: origem !== "",
            onLimpar: () => setMuitos({ [CHAVE.origem]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(CHAVE.origem, origem, OPCOES_ORIGEM, "Origem", "Todas as origens"),
          },
          {
            id: "canal",
            rotulo: "Canal",
            ocultoPorPadrao: true,
            temValor: canal !== "",
            onLimpar: () => setMuitos({ [CHAVE.canal]: null, [CHAVE.pagina]: "1" }),
            elemento: filtroSelect(CHAVE.canal, canal, OPCOES_CANAL, "Canal", "Todos os canais"),
          },
        ]}
        acoesLinha={(saida) => (
          <DropdownMenuItem onSelect={() => abrir(saida)}>
            <ExternalLink />
            Abrir abastecimento
          </DropdownMenuItem>
        )}
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo="Nenhum abastecimento encontrado"
            descricao="Ajuste os filtros ou lance um abastecimento pelo botão do cabeçalho"
            className="border-none bg-transparent"
          />
        }
      />

      {total > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {total} {total === 1 ? "abastecimento" : "abastecimentos"} no filtro,{" "}
          <span className="tabular-nums font-medium text-foreground">{formatarLitros(litrosDoFiltro)}</span>, valor de{" "}
          <MoneyText valor={valorDoFiltro} className="font-medium text-foreground" />
        </p>
      ) : null}
    </div>
  );
}
