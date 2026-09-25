"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, ArrowRight, Eye, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelectMulti,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import {
  BadgeCombustivel,
  FaixaResumo,
  formatarDataHoraCurta,
} from "@/modules/combustivel/_shared/components/lista-operacional";
import { useDetalheDaUrl } from "@/modules/combustivel/_shared/use-detalhe-da-url";
import { useNovoDaUrl } from "@/modules/combustivel/_shared/use-novo-da-url";
import { excluirTransferencia, restaurarTransferencia } from "@/modules/combustivel/transferencias/actions";
import {
  CHAVES_FILTRO_TRANSFERENCIAS as CHAVE,
  filtrarTransferencias,
  type FiltrosTransferenciasUrl,
} from "@/modules/combustivel/transferencias/filtros";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { TransferenciaDetalheDrawer } from "./transferencia-detalhe-drawer";
import { TransferenciaFormDrawer, type TanqueOpcao } from "./transferencia-form-drawer";

/** O modo do cabeçalho é navegação: o "Limpar filtros" não o derruba. */
const NAO_SAO_FILTRO = ["modo"] as const;

/**
 * Colunas da TransferenciaListV2 da origem: Data/Hora, Origem → Destino, Combustível,
 * Litros e Valor. Exportadas para o teste desenhar célula por célula.
 */
export const colunas: ColumnDef<TransferenciaLinha, unknown>[] = [
  {
    accessorKey: "dataHora",
    header: "Data/Hora",
    size: 150,
    meta: { atomico: true },
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{formatarDataHoraCurta(row.original.dataHora)}</span>
        {row.original.excluidoEm ? <StatusBadge status="cancelado" rotulo="Excluída" /> : null}
      </span>
    ),
  },
  {
    id: "origemDestino",
    accessorFn: (t) => `${t.origemNome} → ${t.destinoNome}`,
    header: "Origem → Destino",
    size: 300,
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="max-w-[140px] truncate font-medium">{row.original.origemNome}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="para" />
        <span className="max-w-[140px] truncate text-muted-foreground">{row.original.destinoNome}</span>
      </span>
    ),
  },
  {
    accessorKey: "insumoNome",
    header: "Combustível",
    size: 160,
    meta: { esconderAte: "sm", naoTruncar: true },
    cell: ({ row }) => <BadgeCombustivel nome={row.original.insumoNome} />,
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} className="font-semibold" />,
  },
];

export interface TransferenciasTabelaProps {
  transferencias: TransferenciaLinha[];
  /** O recorte da URL (período, tanque, combustível). Sem ele, nada filtrado. */
  filtrosUrl?: FiltrosTransferenciasUrl;
  /** Tanques da EMT ativos, para o formulário. */
  tanques: TanqueOpcao[];
  /** Todos os tanques da EMT (inclusive inativos), para o filtro. */
  tanquesFiltro: { id: string; nome: string }[];
  podeCriar?: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** `administracao.lixeira`/editar e excluir do recurso: mostra os excluídos e o "Restaurar". */
  podeRestaurar?: boolean;
}

const SEM_RECORTE: FiltrosTransferenciasUrl = { de: "", ate: "", tanqueIds: [], insumoIds: [] };

/**
 * Transferências entre tanques: a TransferenciaListV2 da origem. A página traz todas
 * (via `todasAsLinhas`) e a tabela filtra e pagina em memória; a faixa acima soma o que o
 * filtro acha. O clique na linha abre o detalhe; `?novo=1` abre o formulário.
 */
export function TransferenciasTabela({
  transferencias,
  filtrosUrl = SEM_RECORTE,
  tanques,
  tanquesFiltro,
  podeCriar = false,
  podeEditar,
  podeExcluir,
  podeRestaurar = false,
}: TransferenciasTabelaProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl({ naoSaoFiltro: NAO_SAO_FILTRO });
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [excluidos, setExcluidos] = useFiltroSessao<"" | "1">("excluidos", "", ["", "1"]);
  const mostrarExcluidos = podeRestaurar && excluidos === "1";
  const [novoAberto, setNovoAberto] = useNovoDaUrl(podeCriar);
  const [detalhe, setDetalhe] = useDetalheDaUrl(transferencias);
  const [editando, setEditando] = React.useState<TransferenciaLinha | null>(null);
  const [excluindo, setExcluindo] = React.useState<TransferenciaLinha | null>(null);

  const filtradas = React.useMemo(
    () => filtrarTransferencias(transferencias, { ...filtrosUrl, busca, mostrarExcluidos }),
    [transferencias, filtrosUrl, busca, mostrarExcluidos],
  );

  const opcoesCombustivel = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const t of transferencias) if (t.insumoId && t.insumoNome) vistos.set(t.insumoId, t.insumoNome);
    return [...vistos.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [transferencias]);

  const totalLitros = somarValoresOperacionais(filtradas.map((t) => t.litros));
  const totalValor = somarValoresOperacionais(filtradas.map((t) => t.valorTotal));

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirTransferencia(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência excluída");
    setExcluindo(null);
    setDetalhe(null);
  }

  async function aoRestaurar(transferencia: TransferenciaLinha) {
    const resultado = await restaurarTransferencia(transferencia.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência restaurada");
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
  const temAcoes = podeEditar || podeExcluir || podeRestaurar;

  return (
    <div className="flex flex-col gap-3">
      {filtradas.length > 0 ? (
        <FaixaResumo
          quantidade={filtradas.length}
          singular="transferência"
          plural="transferências"
          litros={totalLitros}
          valor={totalValor}
        />
      ) : null}

      <DataTable
        idTabela="combustivel.transferencias"
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
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por tanque ou observação" />
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
          {
            ...filtroMulti(
              "combustivel",
              "Combustível",
              CHAVE.combustivel,
              filtrosUrl.insumoIds,
              opcoesCombustivel,
              "Todos os combustíveis",
            ),
            ocultoPorPadrao: true,
          },
          ...(podeRestaurar
            ? [
                {
                  id: "excluidos",
                  rotulo: "Mostrar excluídos",
                  fixo: true,
                  temValor: mostrarExcluidos,
                  onLimpar: () => setExcluidos(""),
                  elemento: (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="transferencias-mostrar-excluidos"
                        checked={mostrarExcluidos}
                        onCheckedChange={(marcado) => setExcluidos(marcado ? "1" : "")}
                      />
                      <Label htmlFor="transferencias-mostrar-excluidos" className="text-detalhe text-muted-foreground">
                        Mostrar excluídos
                      </Label>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
        acoesLinha={
          temAcoes
            ? (transferencia) =>
                transferencia.excluidoEm ? (
                  podeRestaurar ? (
                    <DropdownMenuItem onSelect={() => void aoRestaurar(transferencia)}>
                      <RotateCcw />
                      Restaurar
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => setDetalhe(transferencia)}>
                      <Eye />
                      Ver detalhe
                    </DropdownMenuItem>
                    {podeEditar ? (
                      <DropdownMenuItem onSelect={() => setEditando(transferencia)}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(transferencia)}>
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
            icone={ArrowLeftRight}
            titulo={transferencias.length === 0 ? "Nenhuma transferência lançada" : "Nenhuma transferência encontrada"}
            descricao={
              transferencias.length === 0
                ? "Lance a passagem de combustível de um tanque da EMT para outro"
                : "Ajuste a busca, o período ou o tanque"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <TransferenciaDetalheDrawer
        transferencia={detalhe}
        onFechar={() => setDetalhe(null)}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={(transferencia) => {
          setDetalhe(null);
          setEditando(transferencia);
        }}
        onExcluir={setExcluindo}
      />

      {podeCriar ? <TransferenciaFormDrawer aberto={novoAberto} onAbertoChange={setNovoAberto} tanques={tanques} /> : null}

      {podeEditar && editando ? (
        <TransferenciaFormDrawer
          key={editando.id}
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          transferencia={editando}
          tanques={tanques}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir transferência"
        descricao={
          excluindo
            ? `A transferência de ${formatarLitros(excluindo.litros)} de ${excluindo.origemNome} para ${excluindo.destinoNome} vai para a lixeira, e o nível dos dois tanques é refeito. Se o destino já usou esse combustível, a exclusão é recusada.`
            : ""
        }
        textoConfirmar="Excluir transferência"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </div>
  );
}
