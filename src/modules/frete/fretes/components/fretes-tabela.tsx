"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Pencil, RotateCcw, Trash2, Truck } from "lucide-react";

import {
  CelulaVazia,
  colunaDinheiro,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  semDerrubarSucesso,
  useBuscaUrl,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarDataHora, formatarQuantidade } from "@/lib/formatadores";
import { excluirFrete, restaurarFrete } from "@/modules/frete/fretes/actions";
import { totaisDosFretes } from "@/modules/frete/fretes/calculo";
import {
  CHAVES_FILTRO_FRETES as CHAVE,
  filtrarFretes,
  presetAtivo,
  topTransportadoras,
  type FiltrosFretes,
} from "@/modules/frete/fretes/filtros";
import { diaBR, ROTULO_TIPO_FRETE, TIPOS_FRETE } from "@/modules/frete/fretes/schemas";
import type { FreteLinha, OpcoesFrete } from "@/modules/frete/fretes/tipos";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { CampoChegada } from "./campo-chegada";
import { FreteDetalheDrawer } from "./frete-detalhe-drawer";
import { FreteFormDrawer } from "./frete-form-drawer";
import { FreteLinhaExpandida } from "./frete-linha-expandida";
import { FretesPresets } from "./fretes-presets";

const OPCOES_TIPO = TIPOS_FRETE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_FRETE[t] }));
const OPCOES_EXCLUIDOS = [{ valor: "sim", rotulo: "Só os excluídos" }];
/** A origem abre a lista pela saída mais recente (`data desc`). */
const ORDENACAO_INICIAL: SortingState = [{ id: "data", desc: true }];

/**
 * Colunas da lista (FreteListV2 da origem), na mesma ordem e no mesmo desenho de célula:
 * rota em duas linhas, transportadora em três (nome, motorista, placa). A Chegada é
 * editável na hora com `editar`. O expansor da origem é o chevron da DataTable
 * (`linhaExpandida`), e o menu de Editar/Excluir é o `acoesLinha`.
 * No celular ficam Saída, rota, transportadora e valor do frete; o resto volta a partir do
 * breakpoint indicado em `esconderAte`.
 */
export function colunasFretes(podeEditar: boolean): ColumnDef<FreteLinha, unknown>[] {
  return [
    {
      accessorKey: "data",
      header: "Saída",
      size: 104,
      meta: { atomico: true },
      cell: ({ row }) => <span className="font-medium tabular-nums">{diaBR(row.original.data)}</span>,
    },
    {
      accessorKey: "dataChegada",
      header: "Chegada",
      size: 160,
      meta: { atomico: true, naoTruncar: true, esconderAte: "md" },
      cell: ({ row }) => (
        <CampoChegada
          freteId={row.original.id}
          dataChegada={row.original.dataChegada}
          podeEditar={podeEditar && !row.original.excluidoEm}
        />
      ),
    },
    {
      id: "rota",
      accessorFn: (f) => `${f.origemNome} → ${f.destinoNome}`,
      header: "Origem → Destino",
      size: 260,
      meta: { naoTruncar: true },
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.origemNome || "-"}</span>
          <span className="truncate text-legenda text-muted-foreground">→ {row.original.destinoNome || "-"}</span>
          {row.original.tipo === "transferencia" ? (
            <Badge className="mt-0.5 w-fit self-center rounded-full border-transparent bg-amber-100 px-2 text-[10px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-status-pendente/15 dark:text-status-pendente">
              Transferência
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: "transportadoraNome",
      header: "Transportadora",
      size: 220,
      meta: { naoTruncar: true },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.transportadoraNome}</span>
          {row.original.motorista ? (
            <span className="text-legenda text-muted-foreground">{row.original.motorista}</span>
          ) : null}
          {row.original.placaCarreta ? (
            <span className="codigo-doc text-[11px] tracking-wide text-muted-foreground uppercase">
              {row.original.placaCarreta}
            </span>
          ) : null}
        </span>
      ),
    },
    { accessorKey: "insumoNome", header: "Material", size: 180, meta: { esconderAte: "md" } },
    {
      accessorKey: "pesoToneladas",
      header: "Peso (t)",
      size: 110,
      meta: { alinharDireita: true, atomico: true, esconderAte: "sm" },
      cell: ({ row }) => <span className="tabular-nums">{formatarQuantidade(row.original.pesoToneladas)} t</span>,
    },
    colunaDinheiro<FreteLinha>("valorTotal", "Valor frete", {
      size: 130,
      cell: ({ row }) => <MoneyText valor={row.original.valorTotal} className="font-semibold" />,
    }),
    colunaDinheiro<FreteLinha>("valorMaterial", "Valor material", { size: 130, meta: { esconderAte: "md" } }),
    {
      accessorKey: "precoUnitario",
      header: "Preço unit.",
      size: 130,
      meta: { alinharDireita: true, atomico: true, esconderAte: "lg" },
      cell: ({ row }) =>
        row.original.precoUnitario === 0 ? (
          <CelulaVazia />
        ) : (
          <span className="tabular-nums">{formatarValorOperacional(row.original.precoUnitario)}/t</span>
        ),
    },
  ];
}

const colunaExclusao: ColumnDef<FreteLinha, unknown> = {
  id: "exclusao",
  header: "Excluído",
  size: 220,
  meta: { naoTruncar: true },
  cell: ({ row }) => (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatarDataHora(row.original.excluidoEm)}</span>
      {row.original.motivoExclusao ? (
        <span className="text-legenda text-muted-foreground">{row.original.motivoExclusao}</span>
      ) : null}
    </span>
  ),
};

/** Opções de filtro a partir dos próprios fretes: filtro não oferece o que não acha nada. */
function distintos(fretes: readonly FreteLinha[], id: (f: FreteLinha) => string | null, nome: (f: FreteLinha) => string | null) {
  const vistos = new Map<string, string>();
  for (const f of fretes) {
    const chave = id(f);
    if (chave && !vistos.has(chave)) vistos.set(chave, nome(f) || chave);
  }
  return [...vistos.entries()]
    .map(([valor, rotulo]) => ({ valor, rotulo }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export interface FretesTabelaProps {
  fretes: FreteLinha[];
  /** Os da lixeira, só para quem pode restaurar. */
  excluidos: FreteLinha[];
  filtros: FiltrosFretes;
  hoje: string;
  opcoes: OpcoesFrete;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeRestaurar: boolean;
}

/**
 * Aba Fretes: presets, filtros na URL, a lista (filtrada e paginada em memória; a
 * página traz todos os fretes) e o rodapé "Totais" sobre TODAS as linhas do filtro.
 * Clique na linha abre o detalhe.
 */
export function FretesTabela({
  fretes: vivos,
  excluidos,
  filtros,
  hoje,
  opcoes,
  podeEditar,
  podeExcluir,
  podeRestaurar,
}: FretesTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(filtros.busca, CHAVE.busca);
  const { busca: motorista, setBusca: setMotorista } = useBuscaUrl(filtros.motorista, CHAVE.motorista);
  const [detalhe, setDetalhe] = React.useState<FreteLinha | null>(null);
  const [editando, setEditando] = React.useState<FreteLinha | null>(null);
  const [formAberto, setFormAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<FreteLinha | null>(null);
  const [restaurando, setRestaurando] = React.useState<FreteLinha | null>(null);

  const vendoExcluidos = podeRestaurar && filtros.excluidos;
  const base = vendoExcluidos ? excluidos : vivos;
  const colunas = React.useMemo(() => {
    const lista = colunasFretes(podeEditar);
    return vendoExcluidos ? [...lista, colunaExclusao] : lista;
  }, [podeEditar, vendoExcluidos]);

  const filtradas = React.useMemo(() => filtrarFretes(base, filtros), [base, filtros]);
  const totais = React.useMemo(() => totaisDosFretes(filtradas), [filtradas]);
  const top = React.useMemo(() => topTransportadoras(vivos, hoje), [vivos, hoje]);

  const opcoesObra = React.useMemo(() => distintos(base, (f) => f.centroCustoId, (f) => f.obraNome), [base]);
  const opcoesTransportadora = React.useMemo(
    () => distintos(base, (f) => f.transportadoraId, (f) => f.transportadoraNome),
    [base],
  );
  const opcoesMaterial = React.useMemo(() => distintos(base, (f) => f.insumoId, (f) => f.insumoNome), [base]);
  const opcoesOrigem = React.useMemo(() => distintos(base, (f) => f.origemId, (f) => f.origemNome), [base]);
  const opcoesDestino = React.useMemo(() => distintos(base, (f) => f.destinoId, (f) => f.destinoNome), [base]);

  function selecionar(chave: string) {
    return (valor: string) => setMuitos({ [chave]: valor === "" ? null : valor });
  }

  function filtroSelect(
    id: string,
    rotulo: string,
    chave: string,
    valor: string,
    opcoesFiltro: { valor: string; rotulo: string }[],
    todos: string,
    oculto = false,
  ): FiltroConfiguravel {
    return {
      id,
      rotulo,
      ocultoPorPadrao: oculto,
      temValor: valor !== "",
      onLimpar: () => setMuitos({ [chave]: null }),
      elemento: (
        <FiltroSelect valor={valor} onValorChange={selecionar(chave)} opcoes={opcoesFiltro} placeholder={rotulo} todosRotulo={todos} />
      ),
    };
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirFrete(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Frete movido para a lixeira.");
    setExcluindo(null);
    setDetalhe(null);
    semDerrubarSucesso("frete.fretes.excluir", () => router.refresh());
  }

  async function aoConfirmarRestauracao() {
    if (!restaurando) return;
    const resultado = await restaurarFrete(restaurando.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Registro restaurado.");
    setRestaurando(null);
    semDerrubarSucesso("frete.fretes.restaurar", () => router.refresh());
  }

  function editar(frete: FreteLinha) {
    setDetalhe(null);
    setEditando(frete);
    setFormAberto(true);
  }

  const ativo = presetAtivo(filtros, hoje);
  const filtrosDaTabela: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: busca !== "",
      onLimpar: () => setBusca(""),
      elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por nota fiscal..." />,
    },
    filtroSelect("tipo", "Tipo", CHAVE.tipo, filtros.tipo, OPCOES_TIPO, "Todos os tipos"),
    filtroSelect("obra", "Obra", CHAVE.obra, filtros.obraId, opcoesObra, "Todas as obras"),
    filtroSelect(
      "transportadora",
      "Transportadora",
      CHAVE.transportadora,
      filtros.transportadoraId,
      opcoesTransportadora,
      "Todas as transportadoras",
    ),
    {
      id: "periodo",
      rotulo: "Período",
      temValor: filtros.de !== "" || filtros.ate !== "",
      onLimpar: () => setMuitos({ [CHAVE.de]: null, [CHAVE.ate]: null }),
      elemento: (
        <FiltroPeriodo
          de={filtros.de}
          ate={filtros.ate}
          onPeriodoChange={(de, ate) => setMuitos({ [CHAVE.de]: de || null, [CHAVE.ate]: ate || null })}
        />
      ),
    },
    {
      id: "motorista",
      rotulo: "Motorista",
      ocultoPorPadrao: true,
      temValor: motorista !== "",
      onLimpar: () => setMotorista(""),
      elemento: <FiltroBusca valor={motorista} onValorChange={setMotorista} placeholder="Motorista" />,
    },
    filtroSelect("material", "Material", CHAVE.material, filtros.insumoId, opcoesMaterial, "Todos os materiais", true),
    filtroSelect("origem", "Pedreira", CHAVE.origem, filtros.origemId, opcoesOrigem, "Todas as origens", true),
    filtroSelect("destino", "Local de entrega", CHAVE.destino, filtros.destinoId, opcoesDestino, "Todos os destinos", true),
    ...(podeRestaurar
      ? [
          filtroSelect(
            "excluidos",
            "Mostrar excluídos",
            CHAVE.excluidos,
            filtros.excluidos ? "sim" : "",
            OPCOES_EXCLUIDOS,
            "Sem os excluídos",
            true,
          ),
        ]
      : []),
  ];

  const temAcoes = vendoExcluidos ? podeRestaurar : podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-3">
      <FretesPresets
        hoje={hoje}
        ativo={ativo}
        temAlgo={ativo !== null || filtros.transportadoraId !== "" || filtros.semChegada}
        top={top}
        transportadoraId={filtros.transportadoraId}
        onAplicar={setMuitos}
      />

      <DataTable
        idTabela="frete.fretes"
        columns={colunas}
        data={filtradas}
        onRowClick={(frete) => setDetalhe(frete)}
        idDaLinha={(frete) => frete.id}
        sorting={ORDENACAO_INICIAL}
        linhaExpandida={(frete) => <FreteLinhaExpandida frete={frete} podeEditar={podeEditar} />}
        onLimparFiltros={limparTodos}
        cabecalhoFixo
        filtros={filtrosDaTabela}
        rodape={{
          data: <span className="font-medium">Totais</span>,
          pesoToneladas: <span className="tabular-nums">{formatarQuantidade(totais.peso)} t</span>,
          valorTotal: <MoneyText valor={totais.valor} />,
          valorMaterial: <MoneyText valor={totais.valorMaterial} />,
          precoUnitario:
            totais.precoMedioMaterial > 0 ? (
              <span className="tabular-nums" title="Preço médio ponderado, só dos fretes com valor de material">
                {formatarValorOperacional(totais.precoMedioMaterial)}/t
              </span>
            ) : (
              <CelulaVazia />
            ),
        }}
        acoesLinha={
          temAcoes
            ? (frete) =>
                frete.excluidoEm ? (
                  <DropdownMenuItem onSelect={() => setRestaurando(frete)}>
                    <RotateCcw />
                    Restaurar frete
                  </DropdownMenuItem>
                ) : (
                  <>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => editar(frete)}>
                        <Pencil />
                        Editar frete
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(frete)}>
                        <Trash2 />
                        Excluir frete
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Truck}
            titulo={vendoExcluidos ? "Nenhum frete excluído" : "Nenhum frete encontrado"}
            descricao={
              vendoExcluidos
                ? "A lixeira de fretes está vazia neste filtro"
                : "Ajuste os filtros acima ou registre um novo frete."
            }
            className="border-none bg-transparent"
          />
        }
      />

      {filtradas.length > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {filtradas.length} {filtradas.length === 1 ? "frete" : "fretes"}
          {vendoExcluidos ? (filtradas.length === 1 ? " excluído" : " excluídos") : ""} no filtro
        </p>
      ) : null}

      <FreteDetalheDrawer
        frete={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={editar}
        onExcluir={(frete) => setExcluindo(frete)}
      />

      {podeEditar ? (
        <FreteFormDrawer
          key={editando?.id ?? "nenhum"}
          aberto={formAberto}
          onAbertoChange={(aberto) => {
            setFormAberto(aberto);
            if (!aberto) setEditando(null);
          }}
          frete={editando}
          opcoes={opcoes}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir frete"
        descricao={
          excluindo
            ? `O frete ${excluindo.notaFiscal ? `NF ${excluindo.notaFiscal}` : "sem NF"} de ${excluindo.origemNome} para ${excluindo.destinoNome} vai para a lixeira, e o crédito dele sai da conta corrente de ${excluindo.transportadoraNome}. Dá para restaurar depois.`
            : ""
        }
        textoConfirmar="Excluir frete"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />

      <ConfirmDialog
        aberto={restaurando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRestaurando(null);
        }}
        titulo="Restaurar frete"
        descricao="Restaurar este registro pra fora da lixeira? O crédito na conta corrente da transportadora volta."
        textoConfirmar="Restaurar frete"
        onConfirmar={aoConfirmarRestauracao}
      />
    </div>
  );
}
