"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { AlertCircle, Eye, Fuel, Pencil, RotateCcw, Settings2, Trash2, Truck } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  FiltroSelectMulti,
  MoneyText,
  SeloAnexos,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CANAIS,
  formatarDataHoraRioBranco,
  formatarLitros,
  ORIGENS_SAIDA,
  ROTULO_CANAL,
  ROTULO_ORIGEM_SAIDA,
} from "@/modules/combustivel/_shared/rotulos";
import {
  BadgeCombustivel,
  FaixaResumo,
  formatarDataHoraCurta,
} from "@/modules/combustivel/_shared/components/lista-operacional";
import { useNovoDaUrl } from "@/modules/combustivel/_shared/use-novo-da-url";
import { excluirAbastecimento, restaurarAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import { carregarAbastecimento } from "@/modules/combustivel/abastecimentos/detalhe-actions";
import {
  CHAVES_FILTRO_ABASTECIMENTOS as CHAVE,
  ORIGENS_EXTERNAS,
  ROTULO_ORIGEM_EXTERNA,
  ROTULO_VISAO,
  VISOES_SAIDA,
  type FiltrosAbastecimentos,
  type OrigemExterna,
  type VisaoSaida,
} from "@/modules/combustivel/abastecimentos/filtros";
import type {
  AbastecimentoCompleto,
  ContagemVisoes,
  SaidaLista,
} from "@/modules/combustivel/abastecimentos/queries";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { AbastecimentoDetalheDrawer } from "./abastecimento-detalhe-drawer";
import { AbastecimentoFormDrawer, type OpcoesAbastecimento } from "./abastecimento-form-drawer";
import { ROTULO_ORIGEM_CURTO } from "./rotulos-lista";

const OPCOES_ORIGEM = ORIGENS_SAIDA.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM_SAIDA[o] }));
const OPCOES_CANAL = CANAIS.map((c) => ({ valor: c, rotulo: ROTULO_CANAL[c] }));
const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];
/** Modo e sub-aba são navegação, não filtro: o "Limpar filtros" não os derruba. */
const NAO_SAO_FILTRO = [CHAVE.modo, CHAVE.visao] as const;

/** O consumidor como a origem: ícone + "COD — Nome", ou transportadora · placa. */
function CelulaConsumidor({ saida }: { saida: SaidaLista }) {
  if (saida.tipoConsumidor === "carreta_transportadora") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Truck className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">
          {saida.transportadoraNome ?? "Transportadora não informada"}
          {saida.placa ? <span className="text-muted-foreground"> · {saida.placa}</span> : null}
        </span>
      </span>
    );
  }
  if (saida.equipamentoSentinela || !saida.equipamentoDescricao) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-amber-700">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate text-legenda">Não identificado (Outros)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Settings2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">
        {saida.equipamentoCodigo ? `${saida.equipamentoCodigo} — ${saida.equipamentoDescricao}` : saida.equipamentoDescricao}
      </span>
    </span>
  );
}

/** Coluna da exclusão, só no "Mostrar excluídos". */
const colunaExclusao: ColumnDef<SaidaLista, unknown> = {
  id: "exclusao",
  header: "Excluído",
  size: 220,
  enableSorting: false,
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

/**
 * Colunas da SaidaCombustivelListV2 da origem, na mesma ordem. Preço/L e Canal são do ERP e
 * nascem escondidas (menu "Colunas"). Só Data, Litros e Valor ordenam: a lista é paginada no
 * servidor, e é lá que a ordem é feita. Exportadas para o teste olhar sem montar a tela.
 */
export const colunasAbastecimentos: ColumnDef<SaidaLista, unknown>[] = [
  {
    accessorKey: "data",
    header: "Data",
    size: 140,
    sortDescFirst: true,
    meta: { atomico: true },
    // O clipe mora na Data, que está sempre à mostra: quem confere a lista vê de relance
    // quais saídas têm foto ou comprovante, sem abrir uma por uma.
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{formatarDataHoraCurta(row.original.data)}</span>
        <SeloAnexos quantidade={row.original.anexos} />
      </span>
    ),
  },
  {
    id: "consumidor",
    accessorKey: "consumidor",
    header: "Consumidor",
    size: 280,
    enableSorting: false,
    meta: { naoTruncar: true },
    cell: ({ row }) => <CelulaConsumidor saida={row.original} />,
  },
  {
    accessorKey: "origem",
    header: "Origem",
    meta: { esconderAte: "md" },
    size: 110,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-legenda text-muted-foreground">{ROTULO_ORIGEM_CURTO[row.original.origem]}</span>
    ),
  },
  {
    accessorKey: "tanqueNome",
    header: "Tanque",
    meta: { esconderAte: "md" },
    size: 160,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.tanqueNome ? (
        <span className="text-legenda text-muted-foreground">
          {row.original.tanqueNome}
          {row.original.tanqueExterno ? " (externo)" : ""}
        </span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "obraNome",
    header: "Obra",
    meta: { esconderAte: "md" },
    size: 150,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.obraNome ? (
        <span className="block truncate text-legenda text-muted-foreground" title={row.original.obraNome}>
          {row.original.obraNome}
        </span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "insumoNome",
    header: "Combustível",
    size: 150,
    enableSorting: false,
    meta: { esconderAte: "sm", naoTruncar: true },
    cell: ({ row }) => <BadgeCombustivel nome={row.original.insumoNome} />,
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 120,
    sortDescFirst: true,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    size: 140,
    sortDescFirst: true,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} className="font-semibold" />,
  },
  {
    accessorKey: "precoUnitario",
    header: "Preço/L",
    size: 120,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, ocultaPorPadrao: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarValorOperacional(row.original.precoUnitario)}</span>,
  },
  {
    accessorKey: "canal",
    header: "Canal",
    size: 110,
    enableSorting: false,
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) => ROTULO_CANAL[row.original.canal] ?? row.original.canal,
  },
];

export interface OpcaoFiltroAbastecimento {
  id: string;
  rotulo: string;
}

export interface OpcoesFiltroAbastecimentos {
  tanques: OpcaoFiltroAbastecimento[];
  equipamentos: OpcaoFiltroAbastecimento[];
  transportadoras: OpcaoFiltroAbastecimento[];
  obras: OpcaoFiltroAbastecimento[];
  combustiveis: OpcaoFiltroAbastecimento[];
}

/**
 * As sub-abas "Todas (N) / Internas (N) / Externas (N)" da origem e, em Externas, as
 * origens (Dinheiro, Requisição, Tanque Externo). Estado local à frente da URL: a volta do
 * servidor demora, e sem ele o segundo clique partiria da escolha velha.
 */
export function SubAbasSaidas({
  visao,
  origensExternas,
  contagens,
  onVisaoChange,
  onExternasChange,
}: {
  visao: VisaoSaida;
  origensExternas: OrigemExterna[];
  contagens: ContagemVisoes;
  onVisaoChange: (visao: VisaoSaida) => void;
  onExternasChange: (origens: OrigemExterna[]) => void;
}) {
  const chave = `${visao}|${origensExternas.join(",")}`;
  const [local, setLocal] = React.useState({ visao, origensExternas });
  const [chaveAnterior, setChaveAnterior] = React.useState(chave);
  if (chave !== chaveAnterior) {
    setChaveAnterior(chave);
    setLocal({ visao, origensExternas });
  }

  function trocarVisao(nova: VisaoSaida) {
    setLocal({ visao: nova, origensExternas: [] });
    onVisaoChange(nova);
  }

  function alternarExterna(origem: OrigemExterna) {
    const marcadas = local.origensExternas.includes(origem)
      ? local.origensExternas.filter((o) => o !== origem)
      : [...local.origensExternas, origem];
    const ordenadas = ORIGENS_EXTERNAS.filter((o) => marcadas.includes(o));
    setLocal({ visao: local.visao, origensExternas: ordenadas });
    onExternasChange(ordenadas);
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={local.visao} onValueChange={(valor) => trocarVisao(valor as VisaoSaida)}>
        <TabsList variant="line">
          {VISOES_SAIDA.map((v) => (
            <TabsTrigger key={v} value={v}>
              {ROTULO_VISAO[v]} <span className="tabular-nums opacity-60">({contagens[v].toLocaleString("pt-BR")})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {local.visao === "externas" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-legenda">
          <span className="mr-1 text-muted-foreground">Origem:</span>
          {ORIGENS_EXTERNAS.map((origem) => {
            const ativa = local.origensExternas.includes(origem);
            return (
              <button
                key={origem}
                type="button"
                aria-pressed={ativa}
                onClick={() => alternarExterna(origem)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-medium transition-colors",
                  ativa
                    ? "border-primary/30 bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {ROTULO_ORIGEM_EXTERNA[origem]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface AbastecimentosTabelaProps {
  abastecimentos: SaidaLista[];
  total: number;
  litrosDoFiltro: number;
  valorDoFiltro: number;
  contagens: ContagemVisoes;
  filtros: FiltrosAbastecimentos;
  podeCriar?: boolean;
  podeEditar?: boolean;
  podeExcluir?: boolean;
  /** Editar a Lixeira e excluir na aba: vê o filtro e o "Restaurar". */
  podeRestaurar?: boolean;
  /** Opções do formulário; nulo quando não dá para criar nem editar. */
  opcoesFormulario?: OpcoesAbastecimento | null;
  opcoesFiltro: OpcoesFiltroAbastecimentos;
}

/**
 * Saídas: a SaidaCombustivelListV2 da origem sobre o recorte do cabeçalho (modo, período e
 * os filtros globais da URL). Paginação e filtros no servidor (são ~3.100). A faixa acima
 * da tabela soma TODOS os do filtro, não só a página. O clique na linha abre o drawer de
 * detalhe; `?novo=1` (o "+ Nova Saída" do topo) abre o formulário.
 */
export function AbastecimentosTabela({
  abastecimentos,
  total,
  litrosDoFiltro,
  valorDoFiltro,
  contagens,
  filtros,
  podeCriar = false,
  podeEditar = false,
  podeExcluir = false,
  podeRestaurar = false,
  opcoesFormulario = null,
  opcoesFiltro,
}: AbastecimentosTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl({ naoSaoFiltro: NAO_SAO_FILTRO });
  const [novoAberto, setNovoAberto] = useNovoDaUrl(podeCriar && opcoesFormulario !== null);
  const [detalhe, setDetalhe] = React.useState<SaidaLista | null>(null);
  const [editando, setEditando] = React.useState<AbastecimentoCompleto | null>(null);
  const [excluindo, setExcluindo] = React.useState<SaidaLista | null>(null);
  const [restaurando, setRestaurando] = React.useState<SaidaLista | null>(null);
  const vendoExcluidos = podeRestaurar && filtros.excluidos === true;
  const carretas = filtros.modo === "carretas";
  const colunas = React.useMemo(
    () => (vendoExcluidos ? [...colunasAbastecimentos, colunaExclusao] : colunasAbastecimentos),
    [vendoExcluidos],
  );
  // Como a origem: sem editar nem excluir, a linha não tem menu (o clique abre o detalhe).
  const temAcoes = (podeEditar && opcoesFormulario !== null) || podeExcluir || podeRestaurar;
  const ordenacao: SortingState = [{ id: filtros.ordem, desc: filtros.direcao === "desc" }];

  const atualizar = (contexto: string) => semDerrubarSucesso(contexto, () => router.refresh());

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarAbastecimento(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Abastecimento restaurado");
    setRestaurando(null);
    atualizar("combustivel.saidas.restaurar");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirAbastecimento(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Abastecimento excluído");
    setExcluindo(null);
    setDetalhe(null);
    atualizar("combustivel.saidas.excluir");
  }

  async function editar(saida: SaidaLista) {
    const resposta = await carregarAbastecimento(saida.id);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    setEditando(resposta.abastecimento);
  }

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      [CHAVE.pagina]: String(paginacao.pageIndex + 1),
      [CHAVE.tamanho]: String(paginacao.pageSize),
    });
  }

  function aoMudarOrdenacao(nova: SortingState) {
    const primeira = nova[0];
    // Sem ordem, ou a padrão (data, mais nova primeiro): a URL fica limpa.
    const padrao = !primeira || (primeira.id === "data" && primeira.desc);
    setMuitos({
      [CHAVE.ordem]: padrao ? null : primeira.id,
      [CHAVE.direcao]: padrao ? null : primeira.desc ? "desc" : "asc",
      [CHAVE.pagina]: null,
    });
  }

  function abrir(saida: SaidaLista) {
    // O excluído não tem detalhe (a leitura só acha os lançados).
    if (saida.excluidoEm) return;
    setDetalhe(saida);
  }

  /** Troca um filtro e volta para a primeira página. */
  function filtrar(chave: string, valor: string | null) {
    setMuitos({ [chave]: valor === "" ? null : valor, [CHAVE.pagina]: null });
  }

  function filtroMulti(
    id: string,
    rotulo: string,
    chave: string,
    valores: string[],
    opcoes: { valor: string; rotulo: string }[],
    todos: string,
    extra: Partial<FiltroConfiguravel> = {},
  ): FiltroConfiguravel {
    return {
      id,
      rotulo,
      temValor: valores.length > 0,
      onLimpar: () => filtrar(chave, null),
      elemento: (
        <FiltroSelectMulti
          valores={valores}
          onValoresChange={(novos) => filtrar(chave, novos.join(","))}
          opcoes={opcoes}
          placeholder={rotulo}
          todosRotulo={todos}
        />
      ),
      ...extra,
    };
  }

  function filtroSelect(
    id: string,
    rotulo: string,
    chave: string,
    valor: string,
    opcoes: { valor: string; rotulo: string }[],
    todos: string,
  ): FiltroConfiguravel {
    return {
      id,
      rotulo,
      ocultoPorPadrao: true,
      temValor: valor !== "",
      onLimpar: () => filtrar(chave, null),
      elemento: (
        <FiltroSelect
          valor={valor}
          onValorChange={(novo) => filtrar(chave, novo)}
          opcoes={opcoes}
          placeholder={rotulo}
          todosRotulo={todos}
        />
      ),
    };
  }

  const paraOpcoes = (lista: OpcaoFiltroAbastecimento[]) => lista.map((o) => ({ valor: o.id, rotulo: o.rotulo }));
  /** Texto livre (placa, operador): as opções são o que está marcado, para dar para desmarcar. */
  const opcoesDoTexto = (valores: string[]) => valores.map((v) => ({ valor: v, rotulo: v }));

  const filtrosDaBarra: FiltroConfiguravel[] = [
    {
      id: "periodo",
      rotulo: "Período",
      fixo: true,
      temValor: filtros.de !== undefined || filtros.ate !== undefined,
      onLimpar: () => setMuitos({ [CHAVE.de]: null, [CHAVE.ate]: null, [CHAVE.pagina]: null }),
      elemento: (
        <FiltroPeriodo
          de={filtros.de ?? ""}
          ate={filtros.ate ?? ""}
          onPeriodoChange={(novoDe, novoAte) =>
            setMuitos({
              [CHAVE.de]: novoDe === "" ? null : novoDe,
              [CHAVE.ate]: novoAte === "" ? null : novoAte,
              [CHAVE.pagina]: null,
            })
          }
        />
      ),
    },
    filtroMulti("tanque", "Tanque", CHAVE.tanque, filtros.tanqueIds, paraOpcoes(opcoesFiltro.tanques), "Todos os tanques"),
    carretas
      ? filtroMulti(
          "transportadora",
          "Transportadora",
          CHAVE.transportadora,
          filtros.transportadoraIds,
          paraOpcoes(opcoesFiltro.transportadoras),
          "Todas as transportadoras",
        )
      : filtroMulti(
          "equipamento",
          "Equipamento",
          CHAVE.equipamento,
          filtros.equipamentoIds,
          paraOpcoes(opcoesFiltro.equipamentos),
          "Todos os equipamentos",
        ),
    filtroMulti("obra", "Obra", CHAVE.obra, filtros.obraIds, paraOpcoes(opcoesFiltro.obras), "Todas as obras", {
      ocultoPorPadrao: true,
    }),
    filtroMulti(
      "combustivel",
      "Combustível",
      CHAVE.combustivel,
      filtros.combustivelIds,
      paraOpcoes(opcoesFiltro.combustiveis),
      "Todos os combustíveis",
      { ocultoPorPadrao: true },
    ),
    ...(filtros.placas.length > 0
      ? [filtroMulti("placa", "Placa", CHAVE.placa, filtros.placas, opcoesDoTexto(filtros.placas), "Todas as placas")]
      : []),
    ...(filtros.operadores.length > 0
      ? [
          filtroMulti(
            "operador",
            carretas ? "Motorista" : "Operador",
            CHAVE.operador,
            filtros.operadores,
            opcoesDoTexto(filtros.operadores),
            "Todos",
          ),
        ]
      : []),
    filtroSelect("origem", "Origem", CHAVE.origem, filtros.origem ?? "", OPCOES_ORIGEM, "Todas as origens"),
    filtroSelect("canal", "Canal", CHAVE.canal, filtros.canal ?? "", OPCOES_CANAL, "Todos os canais"),
    ...(podeRestaurar
      ? [
          filtroSelect(
            "excluidos",
            "Mostrar excluídos",
            CHAVE.excluidos,
            vendoExcluidos ? "sim" : "",
            OPCOES_EXCLUIDOS,
            "Sem os excluídos",
          ),
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <SubAbasSaidas
        visao={filtros.visao}
        origensExternas={filtros.origensExternas}
        contagens={contagens}
        onVisaoChange={(visao) =>
          setMuitos({ [CHAVE.visao]: visao === "todas" ? null : visao, [CHAVE.externa]: null, [CHAVE.pagina]: null })
        }
        onExternasChange={(origens) => filtrar(CHAVE.externa, origens.join(","))}
      />

      {total > 0 ? (
        <FaixaResumo
          quantidade={total}
          singular={vendoExcluidos ? "saída excluída" : "saída"}
          plural={vendoExcluidos ? "saídas excluídas" : "saídas"}
          litros={litrosDoFiltro}
          valor={valorDoFiltro}
        />
      ) : null}

      <DataTable
        idTabela="combustivel.saidas"
        columns={colunas}
        data={abastecimentos}
        total={total}
        pageIndex={filtros.pagina}
        pageSize={filtros.tamanho}
        onPaginationChange={aoMudarPaginacao}
        sorting={ordenacao}
        onSortingChange={aoMudarOrdenacao}
        onRowClick={abrir}
        onLimparFiltros={limparTodos}
        cabecalhoFixo
        filtros={filtrosDaBarra}
        acoesLinha={
          temAcoes
            ? (saida) =>
                saida.excluidoEm ? (
                  podeRestaurar ? (
                    <DropdownMenuItem onSelect={() => setRestaurando(saida)}>
                      <RotateCcw />
                      Restaurar
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => abrir(saida)}>
                      <Eye />
                      Ver detalhe
                    </DropdownMenuItem>
                    {podeEditar && opcoesFormulario ? (
                      <DropdownMenuItem onSelect={() => void editar(saida)}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(saida)}>
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
            titulo={vendoExcluidos ? "Nenhuma saída excluída" : "Nenhuma saída para os filtros atuais"}
            descricao={
              vendoExcluidos
                ? "A lixeira de saídas está vazia neste filtro"
                : "Ajuste o período, o modo ou os filtros, ou lance uma saída pelo botão do topo"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <AbastecimentoDetalheDrawer
        saida={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar && opcoesFormulario !== null}
        podeExcluir={podeExcluir}
        onEditar={(completo) => {
          setDetalhe(null);
          setEditando(completo);
        }}
        onExcluir={(saida) => setExcluindo(saida)}
      />

      {opcoesFormulario && podeCriar ? (
        <AbastecimentoFormDrawer
          aberto={novoAberto}
          onAbertoChange={setNovoAberto}
          abastecimento={null}
          opcoes={opcoesFormulario}
          onSalvo={() => atualizar("combustivel.saidas.novo")}
        />
      ) : null}

      {opcoesFormulario && podeEditar && editando ? (
        <AbastecimentoFormDrawer
          key={editando.saida.id}
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          abastecimento={editando}
          opcoes={opcoesFormulario}
          onSalvo={() => atualizar("combustivel.saidas.editar")}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir saída"
        descricao={
          excluindo
            ? `A saída de ${formatarLitros(excluindo.litros)} de ${excluindo.insumoNome} sai do tanque e da conta corrente, e o PEPS do tanque é refeito. Se for de ciclo fechado, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir saída"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar saída"
        descricao={
          restaurando
            ? `A saída de ${formatarLitros(restaurando.litros)} de ${restaurando.insumoNome} volta para a lista: o PEPS do tanque, o nível e a conta corrente são refeitos.`
            : ""
        }
        textoConfirmar="Restaurar saída"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
