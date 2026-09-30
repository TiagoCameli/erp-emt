"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Pencil, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  SeloAnexos,
  useBuscaUrl,
  useFiltrosUrl,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import { ColarLancamentos } from "@/modules/medicao/lancamentos/components/colar-lancamentos";
import { ExcluirLancamento } from "@/modules/medicao/lancamentos/components/excluir-lancamento";
import { LancamentoDrawer } from "@/modules/medicao/lancamentos/components/lancamento-drawer";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import type { LancamentoLista, ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

export interface MedicaoParaFiltro {
  numero: number;
  periodoInicio: string;
  periodoFim: string;
}

function localizacao(l: LancamentoLista): string {
  if (l.kmInicial !== null || l.kmFinal !== null) {
    return `${numeroExibicao(l.kmInicial)} a ${numeroExibicao(l.kmFinal)}`;
  }
  return [l.estaca, l.localTexto].filter((v) => v && v.trim() !== "").join(" · ");
}

const colunas: ColumnDef<LancamentoLista, unknown>[] = [
  {
    accessorKey: "data",
    header: "Data",
    size: 130,
    enableSorting: false,
    meta: { atomico: true },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{formatarData(row.original.data)}</span>
        <SeloAnexos quantidade={row.original.anexos} />
      </span>
    ),
  },
  {
    id: "item",
    header: "Item",
    size: 260,
    enableSorting: false,
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.original.codigo ?? "-"}</span>
        <span className="truncate text-legenda text-muted-foreground">{row.original.descricao ?? ""}</span>
      </span>
    ),
  },
  {
    accessorKey: "unidade",
    header: "Unid.",
    size: 90,
    enableSorting: false,
    meta: { esconderAte: "md" },
    cell: ({ row }) => row.original.unidade ?? <CelulaVazia />,
  },
  {
    id: "quantidade",
    header: "Quantidade",
    size: 130,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{numeroExibicao(row.original.quantidade)}</span>,
  },
  {
    id: "localizacao",
    header: "Km / Local",
    size: 200,
    enableSorting: false,
    meta: { esconderAte: "md" },
    cell: ({ row }) => {
      const texto = localizacao(row.original);
      return texto ? <span className="truncate tabular-nums">{texto}</span> : <CelulaVazia />;
    },
  },
  {
    accessorKey: "observacao",
    header: "Observação",
    size: 220,
    enableSorting: false,
    meta: { esconderAte: "lg", ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.observacao ? (
        <span className="truncate text-legenda text-muted-foreground">{row.original.observacao}</span>
      ) : (
        <CelulaVazia />
      ),
  },
  {
    id: "excesso",
    header: "Excesso",
    size: 90,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.motivoExcesso ? (
        <span
          title={row.original.motivoExcesso}
          aria-label={`Excesso sobre o previsto: ${row.original.motivoExcesso}`}
          className="inline-flex items-center text-status-pendente"
        >
          <TriangleAlert className="size-4" aria-hidden />
        </span>
      ) : null,
  },
  {
    id: "medicao",
    header: "Medição",
    size: 100,
    enableSorting: false,
    meta: { atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{row.original.medicaoNumero}ª</span>,
  },
];

function idDaLinha(l: LancamentoLista): string {
  return l.id;
}

export interface LancamentosTabelaProps {
  lancamentos: LancamentoLista[];
  contratoId: string;
  tipoLocalizacao: "rodovia" | "texto";
  /** Serviços das medições ABERTAS do contrato (servicosParaLancar). */
  servicos: ServicoParaLancar[];
  medicoesParaFiltro: MedicaoParaFiltro[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Lista de Lançamentos: filtros (medição, período, item, busca) na URL, editar/excluir só para
 * quem tem a permissão E a medição do lançamento está aberta (o banco também trava isso — a
 * checagem aqui só evita abrir um formulário que a RPC vai recusar).
 */
export function LancamentosTabela({
  lancamentos,
  contratoId,
  tipoLocalizacao,
  servicos,
  medicoesParaFiltro,
  podeCriar,
  podeEditar,
  podeExcluir,
}: LancamentosTabelaProps) {
  const router = useRouter();
  const { get, setMuitos, limparTodos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(get("busca") ?? "", "busca");

  const [novoAberto, setNovoAberto] = React.useState(false);
  const [colarAberto, setColarAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<LancamentoLista | null>(null);
  const [excluindo, setExcluindo] = React.useState<LancamentoLista | null>(null);

  const medicaoAtual = get("medicao") ?? "";
  const de = get("de") ?? "";
  const ate = get("ate") ?? "";
  const itemAtual = get("item") ?? "";

  const itensParaFiltro = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const s of servicos) mapa.set(s.itemId, `${s.codigo} · ${s.descricao}`);
    for (const l of lancamentos) {
      if (l.itemId && !mapa.has(l.itemId)) mapa.set(l.itemId, `${l.codigo ?? "-"} · ${l.descricao ?? ""}`);
    }
    return [...mapa.entries()].map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [servicos, lancamentos]);

  const atualizar = () => router.refresh();

  const filtros: FiltroConfiguravel[] = [
    {
      id: "medicao",
      rotulo: "Medição",
      temValor: medicaoAtual !== "",
      onLimpar: () => setMuitos({ medicao: null }),
      elemento: (
        <FiltroSelect
          valor={medicaoAtual}
          onValorChange={(v) => setMuitos({ medicao: v === "" ? null : v })}
          opcoes={medicoesParaFiltro.map((m) => ({
            valor: String(m.numero),
            rotulo: `${m.numero}ª (${periodoMedicao(m.periodoInicio, m.periodoFim)})`,
          }))}
          todosRotulo="Todas as medições"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período",
      temValor: de !== "" || ate !== "",
      onLimpar: () => setMuitos({ de: null, ate: null }),
      elemento: (
        <FiltroPeriodo
          de={de}
          ate={ate}
          onPeriodoChange={(novoDe, novoAte) => setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })}
        />
      ),
    },
    {
      id: "item",
      rotulo: "Item",
      ocultoPorPadrao: true,
      temValor: itemAtual !== "",
      onLimpar: () => setMuitos({ item: null }),
      elemento: (
        <FiltroSelect
          valor={itemAtual}
          onValorChange={(v) => setMuitos({ item: v === "" ? null : v })}
          opcoes={itensParaFiltro}
          todosRotulo="Todos os itens"
        />
      ),
    },
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: busca.trim() !== "",
      onLimpar: () => setBusca(""),
      elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Item, estaca, local ou observação" />,
    },
  ];

  function podeEditarLinha(l: LancamentoLista): boolean {
    return podeEditar && l.medicaoStatus === "aberta";
  }
  function podeExcluirLinha(l: LancamentoLista): boolean {
    return podeExcluir && l.medicaoStatus === "aberta";
  }
  const temAlgumaAcao = podeEditar || podeExcluir;

  return (
    <div className="flex flex-col gap-3">
      {podeCriar ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setColarAberto(true)}>
            <Upload />
            Colar do Excel
          </Button>
          <Button type="button" size="sm" onClick={() => setNovoAberto(true)}>
            <Plus />
            Lançar
          </Button>
        </div>
      ) : null}

      <DataTable
        idTabela="medicao.lancamentos"
        columns={colunas}
        data={lancamentos}
        idDaLinha={idDaLinha}
        onLimparFiltros={limparTodos}
        cabecalhoFixo
        filtros={filtros}
        acoesLinha={
          temAlgumaAcao
            ? (l) =>
                podeEditarLinha(l) || podeExcluirLinha(l) ? (
                  <>
                    {podeEditarLinha(l) ? (
                      <DropdownMenuItem onSelect={() => setEditando(l)}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluirLinha(l) ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(l)}>
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null
            : undefined
        }
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhum lançamento"
            descricao={podeCriar ? "Lance o primeiro serviço executado, no botão acima" : "Nenhum lançamento para os filtros atuais"}
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar ? (
        <LancamentoDrawer
          aberto={novoAberto}
          onAbertoChange={setNovoAberto}
          lancamento={null}
          contratoId={contratoId}
          tipoLocalizacao={tipoLocalizacao}
          servicos={servicos}
          onSalvo={atualizar}
        />
      ) : null}

      {editando ? (
        <LancamentoDrawer
          key={editando.id}
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setEditando(null);
          }}
          lancamento={editando}
          contratoId={contratoId}
          tipoLocalizacao={tipoLocalizacao}
          servicos={servicos}
          onSalvo={() => {
            setEditando(null);
            atualizar();
          }}
        />
      ) : null}

      <ExcluirLancamento
        lancamento={excluindo}
        onFechar={() => setExcluindo(null)}
        onExcluido={() => {
          setExcluindo(null);
          atualizar();
        }}
      />

      {podeCriar ? (
        <ColarLancamentos
          aberto={colarAberto}
          onAbertoChange={setColarAberto}
          contratoId={contratoId}
          tipoLocalizacao={tipoLocalizacao}
          servicos={servicos}
          onGravado={atualizar}
        />
      ) : null}
    </div>
  );
}
