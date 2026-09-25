"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Fuel, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroSelectMulti,
  MoneyText,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import {
  BadgeCombustivel,
  FaixaResumo,
  formatarDataHoraCurta,
} from "@/modules/combustivel/_shared/components/lista-operacional";
import { useDetalheDaUrl } from "@/modules/combustivel/_shared/use-detalhe-da-url";
import { useNovoDaUrl } from "@/modules/combustivel/_shared/use-novo-da-url";
import { excluirEntrada, restaurarEntrada } from "@/modules/combustivel/entradas/actions";
import {
  CHAVES_FILTRO_ENTRADAS as CHAVE,
  filtrarEntradas,
  type FiltrosEntradasUrl,
} from "@/modules/combustivel/entradas/filtros";
import type { EntradaLinha, InsumoCombustivel, Opcao, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import { formatarValorOperacional, somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { EntradaDetalheDrawer } from "./entrada-detalhe-drawer";
import { EntradaFormDrawer } from "./entrada-form-drawer";

/**
 * Colunas da EntradaListV2 da origem, na mesma ordem (Data/Hora, Tanque, Combustível,
 * Fornecedor, Litros, Valor). Quantidade, R$/L e NF são do ERP e nascem escondidas.
 */
export const colunasEntradas: ColumnDef<EntradaLinha, unknown>[] = [
  {
    accessorKey: "dataHora",
    header: "Data/Hora",
    size: 120,
    meta: { atomico: true },
    cell: ({ row }) => <span className="font-medium tabular-nums">{formatarDataHoraCurta(row.original.dataHora)}</span>,
  },
  {
    accessorKey: "tanqueNome",
    header: "Tanque",
    meta: { esconderAte: "md" },
    size: 180,
    cell: ({ row }) => <span className="text-legenda text-muted-foreground">{row.original.tanqueNome}</span>,
  },
  {
    accessorKey: "insumoNome",
    header: "Combustível",
    size: 160,
    meta: { esconderAte: "sm", naoTruncar: true },
    cell: ({ row }) => <BadgeCombustivel nome={row.original.insumoNome} />,
  },
  {
    accessorKey: "fornecedorNome",
    header: "Fornecedor",
    meta: { esconderAte: "md" },
    size: 200,
    cell: ({ row }) =>
      row.original.fornecedorNome ? (
        <span className="block truncate" title={row.original.fornecedorNome}>
          {row.original.fornecedorNome}
        </span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    // Entrada soma no tanque: "+" e verde, como na origem.
    cell: ({ row }) => (
      <span className="font-medium tabular-nums text-emt-verde">+{formatarLitros(row.original.litros)}</span>
    ),
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} className="font-semibold" />,
  },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    size: 130,
    meta: { alinharDireita: true, atomico: true, ocultaPorPadrao: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.quantidade)}
        {row.original.unidade ? <span className="ml-1 text-muted-foreground">{row.original.unidade}</span> : null}
      </span>
    ),
  },
  {
    accessorKey: "precoLitro",
    header: "R$/L",
    size: 120,
    meta: { alinharDireita: true, atomico: true, ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.precoLitro === null ? (
        <CelulaVazia />
      ) : (
        <span className="tabular-nums">{formatarValorOperacional(row.original.precoLitro)}</span>
      ),
  },
  {
    accessorKey: "notaFiscal",
    header: "NF",
    size: 110,
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.notaFiscal ? <span className="codigo-doc">{row.original.notaFiscal}</span> : <CelulaVazia />,
  },
];

/** Coluna da exclusão, só no "Mostrar excluídos". */
const colunaExclusao: ColumnDef<EntradaLinha, unknown> = {
  id: "exclusao",
  header: "Excluída",
  size: 220,
  meta: { naoTruncar: true },
  cell: ({ row }) => (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.excluidoEm)}</span>
      {row.original.motivoExclusao ? (
        <span className="text-legenda text-muted-foreground">{row.original.motivoExclusao}</span>
      ) : null}
    </span>
  ),
};

export const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];

/** O modo do cabeçalho é navegação: o "Limpar filtros" não o derruba. */
const NAO_SAO_FILTRO = ["modo"] as const;

/** Valores distintos de uma lista, ordenados pelo rótulo: filtro não oferece o que não acha nada. */
function distintos(pares: Iterable<[string | null, string | null]>): { valor: string; rotulo: string }[] {
  const vistos = new Map<string, string>();
  for (const [valor, rotulo] of pares) if (valor && rotulo) vistos.set(valor, rotulo);
  return [...vistos.entries()]
    .map(([valor, rotulo]) => ({ valor, rotulo }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export interface EntradasTabelaProps {
  entradas: EntradaLinha[];
  /**
   * As da lixeira. Só vêm para quem pode restaurar (editar a Lixeira e excluir na aba);
   * para o resto, lista vazia e o filtro nem aparece.
   */
  excluidas?: EntradaLinha[];
  podeRestaurar?: boolean;
  /** O recorte da URL (período, tanque, combustível, fornecedor). */
  filtrosUrl: FiltrosEntradasUrl;
  /** Todos os tanques, para o filtro (entrada só existe em tanque da EMT). */
  tanquesFiltro: Opcao[];
  /** Tanques que recebem entrada, para o formulário. */
  tanquesEdicao: TanqueOpcao[];
  insumos: InsumoCombustivel[];
  fornecedores: Opcao[];
  podeCriar?: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Entradas: a EntradaListV2 da origem. A página traz todas as não excluídas
 * (`todasAsLinhas`) e a tabela filtra e pagina em memória; a faixa acima soma o que o
 * filtro acha (todas as páginas). O clique na linha abre o detalhe; `?novo=1` (o
 * "+ Nova Entrada" do topo) abre o formulário.
 */
export function EntradasTabela({
  entradas: lancadas,
  excluidas = [],
  podeRestaurar = false,
  filtrosUrl,
  tanquesFiltro,
  tanquesEdicao,
  insumos,
  fornecedores,
  podeCriar = false,
  podeEditar,
  podeExcluir,
}: EntradasTabelaProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl({ naoSaoFiltro: NAO_SAO_FILTRO });
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [novoAberto, setNovoAberto] = useNovoDaUrl(podeCriar);
  const [detalhe, setDetalhe] = useDetalheDaUrl(lancadas);
  const [editando, setEditando] = React.useState<EntradaLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<EntradaLinha | null>(null);
  const [restaurando, setRestaurando] = React.useState<EntradaLinha | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useFiltroSessao("excluidos", "");
  const vendoExcluidas = podeRestaurar && mostrarExcluidos === "sim";
  const entradas = vendoExcluidas ? excluidas : lancadas;
  const colunas = React.useMemo(
    () => (vendoExcluidas ? [...colunasEntradas, colunaExclusao] : colunasEntradas),
    [vendoExcluidas],
  );

  const filtradas = React.useMemo(
    () => filtrarEntradas(entradas, { ...filtrosUrl, busca }),
    [entradas, filtrosUrl, busca],
  );

  const opcoesCombustivel = React.useMemo(
    () => distintos(entradas.map((e) => [e.insumoId, e.insumoNome] as [string, string])),
    [entradas],
  );
  const opcoesFornecedor = React.useMemo(
    () => distintos(entradas.map((e) => [e.fornecedorId, e.fornecedorNome] as [string | null, string | null])),
    [entradas],
  );

  const totalLitros = somarValoresOperacionais(filtradas.map((e) => e.litros));
  const totalValor = somarValoresOperacionais(filtradas.map((e) => e.valorTotal));

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirEntrada(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada excluída");
    setExcluindo(null);
    setDetalhe(null);
  }

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarEntrada(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada restaurada");
    setRestaurando(null);
  }

  function filtroMulti(
    id: string,
    rotulo: string,
    chave: string,
    valores: readonly string[],
    opcoes: { valor: string; rotulo: string }[],
    todos: string,
  ): FiltroConfiguravel {
    return {
      id,
      rotulo,
      temValor: valores.length > 0,
      onLimpar: () => setMuitos({ [chave]: null }),
      elemento: (
        <FiltroSelectMulti
          valores={[...valores]}
          onValoresChange={(novos) => setMuitos({ [chave]: novos.length > 0 ? novos.join(",") : null })}
          opcoes={opcoes}
          placeholder={rotulo}
          todosRotulo={todos}
        />
      ),
    };
  }

  // Como a origem: sem editar nem excluir, a linha não tem menu (o clique abre o detalhe).
  const temAcoes = vendoExcluidas ? podeRestaurar : podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-3">
      {filtradas.length > 0 ? (
        <FaixaResumo
          quantidade={filtradas.length}
          singular={vendoExcluidas ? "entrada excluída" : "entrada"}
          plural={vendoExcluidas ? "entradas excluídas" : "entradas"}
          litros={totalLitros}
          valor={totalValor}
        />
      ) : null}

      <DataTable
        idTabela="combustivel.entradas"
        columns={colunas}
        data={filtradas}
        onRowClick={setDetalhe}
        onLimparFiltros={() => {
          setBusca("");
          limparTodos();
        }}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por fornecedor, NF ou observação" />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: filtrosUrl.de !== "" || filtrosUrl.ate !== "",
            onLimpar: () => setMuitos({ [CHAVE.de]: null, [CHAVE.ate]: null }),
            elemento: (
              <FiltroPeriodo
                de={filtrosUrl.de}
                ate={filtrosUrl.ate}
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ [CHAVE.de]: novoDe === "" ? null : novoDe, [CHAVE.ate]: novoAte === "" ? null : novoAte })
                }
              />
            ),
          },
          filtroMulti(
            "tanque",
            "Tanque",
            CHAVE.tanque,
            filtrosUrl.tanqueIds,
            tanquesFiltro.map((t) => ({ valor: t.id, rotulo: t.nome })),
            "Todos os tanques",
          ),
          filtroMulti(
            "combustivel",
            "Combustível",
            CHAVE.combustivel,
            filtrosUrl.insumoIds,
            opcoesCombustivel,
            "Todos os combustíveis",
          ),
          {
            ...filtroMulti(
              "fornecedor",
              "Fornecedor",
              CHAVE.fornecedor,
              filtrosUrl.fornecedorIds,
              opcoesFornecedor,
              "Todos os fornecedores",
            ),
            ocultoPorPadrao: true,
          },
          ...(podeRestaurar
            ? [
                {
                  id: "excluidos",
                  rotulo: "Mostrar excluídos",
                  ocultoPorPadrao: true,
                  temValor: mostrarExcluidos !== "",
                  onLimpar: () => setMostrarExcluidos(""),
                  elemento: (
                    <FiltroSelect
                      valor={mostrarExcluidos}
                      onValorChange={setMostrarExcluidos}
                      opcoes={OPCOES_EXCLUIDOS}
                      placeholder="Mostrar excluídos"
                      todosRotulo="Sem os excluídos"
                    />
                  ),
                },
              ]
            : []),
        ]}
        acoesLinha={
          temAcoes
            ? (entrada) =>
                entrada.excluidoEm ? (
                  <DropdownMenuItem onSelect={() => setRestaurando(entrada)}>
                    <RotateCcw />
                    Restaurar
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => setDetalhe(entrada)}>
                      <Eye />
                      Ver detalhe
                    </DropdownMenuItem>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => setEditando(entrada)}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(entrada)}>
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo={
              vendoExcluidas
                ? "Nenhuma entrada excluída"
                : entradas.length === 0
                  ? "Nenhuma entrada registrada"
                  : "Nenhuma entrada para os filtros atuais"
            }
            descricao={
              vendoExcluidas
                ? "A lixeira de entradas está vazia neste filtro"
                : entradas.length === 0
                  ? "Lance a nota fiscal do combustível para o tanque ter estoque e preço no PEPS"
                  : "Ajuste a busca, o período, o tanque ou o combustível"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <EntradaDetalheDrawer
        entrada={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={(entrada) => {
          setDetalhe(null);
          setEditando(entrada);
        }}
        onExcluir={setExcluindo}
      />

      {podeCriar ? (
        <EntradaFormDrawer
          aberto={novoAberto}
          onAbertoChange={setNovoAberto}
          entrada={null}
          tanques={tanquesEdicao}
          insumos={insumos}
          fornecedores={fornecedores}
        />
      ) : null}

      {podeEditar && editando ? (
        <EntradaFormDrawer
          key={editando.id}
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          entrada={editando}
          tanques={tanquesEdicao}
          insumos={insumos}
          fornecedores={fornecedores}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir entrada"
        descricao={
          excluindo
            ? `A entrada de ${formatarLitros(excluindo.litros)} de ${excluindo.insumoNome} sai do tanque ${excluindo.tanqueNome}, e o PEPS do tanque é refeito. Se o saldo ficar negativo em algum momento, ou se a entrada for de ciclo fechado, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir entrada"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar entrada"
        descricao={
          restaurando
            ? `A entrada de ${formatarLitros(restaurando.litros)} de ${restaurando.insumoNome} volta para o tanque ${restaurando.tanqueNome}, e o nível e o PEPS do tanque são refeitos.`
            : ""
        }
        textoConfirmar="Restaurar entrada"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
