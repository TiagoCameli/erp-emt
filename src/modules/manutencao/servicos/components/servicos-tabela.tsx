"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ExternalLink, Wrench } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  colunaDinheiro,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroSelectMulti,
  MoneyText,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { escreverListaNaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import {
  BADGE_STATUS_OS,
  ROTULO_STATUS_OS,
  ROTULO_TIPO_OS,
  STATUS_OS,
  TIPOS_OS,
} from "@/modules/manutencao/_shared/rotulos";
import { CHAVES_FILTRO_SERVICOS as CHAVE } from "@/modules/manutencao/servicos/filtros";
import { rotuloPropriedade } from "@/modules/manutencao/servicos/formato";
import type { EquipamentoFiltro, OsLista } from "@/modules/manutencao/servicos/queries";

const OPCOES_STATUS = STATUS_OS.map((status) => ({ valor: status, rotulo: ROTULO_STATUS_OS[status] }));
const OPCOES_TIPO = TIPOS_OS.map((tipo) => ({ valor: tipo, rotulo: ROTULO_TIPO_OS[tipo] }));

/** Colunas do caderno. Exportadas para o teste olhar sem montar a tela. */
export const colunasServicos: ColumnDef<OsLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    size: 150,
    meta: { fixa: true },
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="codigo-doc">{row.original.numero}</span>
        {row.original.numeroLegado ? (
          <span className="text-legenda text-muted-foreground">Origem {row.original.numeroLegado}</span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "equipamentoNome",
    header: "Equipamento",
    size: 280,
    meta: { naoTruncar: true },
    cell: ({ row }) =>
      row.original.equipamentoNome ? (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.equipamentoNome}</span>
          {row.original.propriedade ? (
            <span className="text-legenda text-muted-foreground">{rotuloPropriedade(row.original.propriedade)}</span>
          ) : null}
        </span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 150,
    cell: ({ row }) => ROTULO_TIPO_OS[row.original.tipo] ?? row.original.tipo,
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    cell: ({ row }) => (
      <StatusBadge status={BADGE_STATUS_OS[row.original.status]} rotulo={ROTULO_STATUS_OS[row.original.status]} />
    ),
  },
  colunaData<OsLista>("dataAbertura", "Abertura", formatarData, { size: 120 }),
  colunaData<OsLista>("dataConclusao", "Conclusão", formatarData, { size: 120 }),
  colunaDinheiro<OsLista>("custoTotal", "Custo total", { size: 150 }),
];

export interface ServicosTabelaProps {
  ordens: OsLista[];
  total: number;
  custoDoFiltro: number;
  pagina: number;
  tamanho: number;
  status: string[];
  equipamentoId: string;
  tipo: string;
  conclusaoDe: string;
  conclusaoAte: string;
  busca: string;
  equipamentos: EquipamentoFiltro[];
  idUsuario: string;
}

/**
 * Caderno de serviços: paginação e filtros no servidor, persistidos na URL. O
 * rodapé soma o custo de TODAS as OS do filtro (vem do servidor), não só da
 * página à vista.
 */
export function ServicosTabela({
  ordens,
  total,
  custoDoFiltro,
  pagina,
  tamanho,
  status,
  equipamentoId,
  tipo,
  conclusaoDe,
  conclusaoAte,
  busca: buscaUrl,
  equipamentos,
  idUsuario,
}: ServicosTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl, CHAVE.busca);

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      [CHAVE.pagina]: String(paginacao.pageIndex + 1),
      [CHAVE.tamanho]: String(paginacao.pageSize),
    });
  }

  function abrir(os: OsLista) {
    router.push(`/manutencao/servicos/${os.id}`);
  }

  const opcoesEquipamento = React.useMemo(
    () => equipamentos.map((equipamento) => ({ valor: equipamento.id, rotulo: equipamento.rotulo })),
    [equipamentos],
  );

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="manutencao.servicos"
        idUsuario={idUsuario}
        columns={colunasServicos}
        data={ordens}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={abrir}
        onLimparFiltros={limparTodos}
        cabecalhoFixo
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por número ou descrição" />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status.length > 0,
            onLimpar: () => setMuitos({ [CHAVE.status]: null, [CHAVE.pagina]: "1" }),
            elemento: (
              <FiltroSelectMulti
                valores={status}
                onValoresChange={(valores) =>
                  setMuitos({ [CHAVE.status]: escreverListaNaUrl(valores), [CHAVE.pagina]: "1" })
                }
                opcoes={OPCOES_STATUS}
                todosRotulo="Todos os status"
              />
            ),
          },
          {
            id: "equipamento",
            rotulo: "Equipamento",
            temValor: equipamentoId !== "",
            onLimpar: () => setMuitos({ [CHAVE.equipamento]: null, [CHAVE.pagina]: "1" }),
            elemento: (
              <FiltroSelect
                valor={equipamentoId}
                onValorChange={(valor) =>
                  setMuitos({ [CHAVE.equipamento]: valor === "" ? null : valor, [CHAVE.pagina]: "1" })
                }
                opcoes={opcoesEquipamento}
                placeholder="Equipamento"
                todosRotulo="Todos os equipamentos"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo",
            temValor: tipo !== "",
            onLimpar: () => setMuitos({ [CHAVE.tipo]: null, [CHAVE.pagina]: "1" }),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={(valor) =>
                  setMuitos({ [CHAVE.tipo]: valor === "" ? null : valor, [CHAVE.pagina]: "1" })
                }
                opcoes={OPCOES_TIPO}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
          {
            id: "conclusao",
            rotulo: "Período de conclusão",
            temValor: conclusaoDe !== "" || conclusaoAte !== "",
            onLimpar: () =>
              setMuitos({ [CHAVE.conclusaoDe]: null, [CHAVE.conclusaoAte]: null, [CHAVE.pagina]: "1" }),
            elemento: (
              <FiltroPeriodo
                de={conclusaoDe}
                ate={conclusaoAte}
                rotulo="Conclusão"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({
                    [CHAVE.conclusaoDe]: novoDe === "" ? null : novoDe,
                    [CHAVE.conclusaoAte]: novoAte === "" ? null : novoAte,
                    [CHAVE.pagina]: "1",
                  })
                }
              />
            ),
          },
        ]}
        acoesLinha={(os) => (
          <DropdownMenuItem onSelect={() => abrir(os)}>
            <ExternalLink />
            Abrir OS
          </DropdownMenuItem>
        )}
        emptyState={
          <EmptyState
            icone={Wrench}
            titulo="Nenhuma ordem de serviço encontrada"
            descricao="Ajuste os filtros ou abra uma OS pelo botão Nova OS"
            className="border-none bg-transparent"
          />
        }
      />

      {total > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {total} OS no filtro, custo total de{" "}
          <MoneyText valor={custoDoFiltro} className="font-medium text-foreground" />
        </p>
      ) : null}
    </div>
  );
}
