"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";

import {
  BarraSelecao,
  CelulaVazia,
  Combobox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { atribuirEquipamento, conferirAnomalia } from "@/modules/combustivel/anomalias/actions";
import {
  DETECTOR_LABEL,
  SEVERITY_LABEL,
  type DetectorId,
  type Severidade,
} from "@/modules/combustivel/anomalias/detect";
import { linkDaSaida } from "@/modules/combustivel/anomalias/links";
import type { AnomaliaLista, SaidaDaAnomalia } from "@/modules/combustivel/anomalias/queries";
import { MAXIMO_MOTIVO, type Situacao } from "@/modules/combustivel/anomalias/schemas";

/** Severidade no selo canônico: crítica no vermelho, atenção no âmbar, informação no cinza. */
const STATUS_DA_SEVERIDADE: Record<Severidade, string> = {
  critical: "rejeitado",
  warning: "pendente_aprovacao",
  info: "rascunho",
};

const OPCOES_SITUACAO = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "conferidas", rotulo: "Conferidas" },
];

const OPCOES_SEVERIDADE = (["critical", "warning", "info"] as const).map((s) => ({ valor: s, rotulo: SEVERITY_LABEL[s] }));
const OPCOES_DETECTOR = (["D1", "D2", "D3", "D4", "D5"] as const).map((d) => ({
  valor: d,
  rotulo: `${d} ${DETECTOR_LABEL[d]}`,
}));

function diaBR(dia: string): string {
  return dia.split("-").reverse().join("/");
}

/** Relógio de parede ("AAAA-MM-DDTHH:MM:SS") -> "dd/mm/aaaa hh:mm". */
function dataHoraDeParede(valor: string): string {
  const [data, hora] = valor.split("T");
  return `${diaBR(data ?? "")} ${(hora ?? "").slice(0, 5)}`.trim();
}

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

/** Saídas que ainda podem receber equipamento: as das anomalias D1 marcadas. */
function saidasDaSelecao(anomalias: readonly AnomaliaLista[], ids: readonly string[]): SaidaDaAnomalia[] {
  const marcadas = new Set(ids);
  return anomalias.filter((a) => a.detector === "D1" && marcadas.has(a.id)).flatMap((a) => a.saidas);
}

export interface AnomaliasTabelaProps {
  anomalias: AnomaliaLista[];
  situacao: Situacao;
  severidade: Severidade | "";
  detector: DetectorId | "";
  /** Período (yyyy-MM-dd) já resolvido pela página, com o padrão aplicado. */
  de: string;
  ate: string;
  podeEditar: boolean;
  /** A pessoa abre a tela de abastecimentos? Sem isso o link seria para um 404. */
  veAbastecimentos: boolean;
  /** Opções do seletor de equipamento (ativos, sem o "Outros"). */
  equipamentos: { valor: string; rotulo: string }[];
}

/**
 * A aba Anomalias da origem. A detecção roda no servidor e chega pronta; aqui só se
 * filtra (situação, severidade, detector, busca) e se age: conferir e, nas D1,
 * atribuir o equipamento a uma ou várias saídas (AtribuirSentinelModal da origem).
 */
export function AnomaliasTabela({
  anomalias,
  situacao,
  severidade,
  detector,
  de,
  ate,
  podeEditar,
  veAbastecimentos,
  equipamentos,
}: AnomaliasTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const [busca, setBusca] = React.useState("");
  const [conferindo, setConferindo] = React.useState<AnomaliaLista | null>(null);
  const [desmarcando, setDesmarcando] = React.useState<AnomaliaLista | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [equipamentoLote, setEquipamentoLote] = React.useState("");
  const [confirmandoLote, setConfirmandoLote] = React.useState(false);
  const [atribuindoUma, setAtribuindoUma] = React.useState<AnomaliaLista | null>(null);
  const [equipamentoUma, setEquipamentoUma] = React.useState("");

  const visiveis = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return anomalias.filter((a) => {
      if (situacao === "conferidas" && a.conferencia === null) return false;
      if (situacao === "pendentes" && a.conferencia !== null) return false;
      if (severidade && a.severity !== severidade) return false;
      if (detector && a.detector !== detector) return false;
      if (q && !`${a.title} ${a.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [anomalias, situacao, severidade, detector, busca]);

  // A seleção só guarda o que ainda está na lista (a anomalia some quando é resolvida).
  const idsVisiveis = React.useMemo(() => new Set(visiveis.map((a) => a.id)), [visiveis]);
  const selecionadosValidos = selecionados.filter((id) => idsVisiveis.has(id));
  const saidasMarcadas = saidasDaSelecao(anomalias, selecionadosValidos);
  const rotuloEquipamentoLote = equipamentos.find((e) => e.valor === equipamentoLote)?.rotulo ?? "";

  async function aoConfirmarConferencia() {
    if (!conferindo) return;
    const resultado = await conferirAnomalia({ chave: conferindo.id, conferida: true, motivo });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia marcada como conferida");
    setConferindo(null);
  }

  async function aoConfirmarDesmarcar() {
    if (!desmarcando) return;
    const resultado = await conferirAnomalia({ chave: desmarcando.id, conferida: false });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia voltou para pendentes");
    setDesmarcando(null);
  }

  async function atribuir(saidaIds: string[], equipamentoId: string): Promise<boolean> {
    const resultado = await atribuirEquipamento({ saidaIds, equipamentoId });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return false;
    }
    const { atualizadas } = resultado;
    if (atualizadas === saidaIds.length) {
      toast.success(`${plural(atualizadas, "saída atualizada", "saídas atualizadas")} com o equipamento`);
    } else {
      toast.warning(
        `${plural(atualizadas, "saída atualizada", "saídas atualizadas")} de ${saidaIds.length}. ` +
          "As outras já tinham sido excluídas ou não são de equipamento próprio",
      );
    }
    return true;
  }

  async function aoConfirmarLote() {
    if (!equipamentoLote || saidasMarcadas.length === 0) {
      toast.error("Escolha o equipamento");
      return;
    }
    const passou = await atribuir(
      saidasMarcadas.map((s) => s.id),
      equipamentoLote,
    );
    if (passou) {
      setSelecionados([]);
      setEquipamentoLote("");
    }
  }

  async function aoConfirmarUma() {
    if (!atribuindoUma) return;
    if (!equipamentoUma) {
      toast.error("Escolha o equipamento");
      return;
    }
    const passou = await atribuir(
      atribuindoUma.saidas.map((s) => s.id),
      equipamentoUma,
    );
    if (passou) setAtribuindoUma(null);
  }

  const colunas = React.useMemo<ColumnDef<AnomaliaLista, unknown>[]>(() => {
    const base: ColumnDef<AnomaliaLista, unknown>[] = [
      {
        accessorKey: "severity",
        header: "Severidade",
        size: 120,
        cell: ({ row }) => (
          <StatusBadge status={STATUS_DA_SEVERIDADE[row.original.severity]} rotulo={SEVERITY_LABEL[row.original.severity]} />
        ),
      },
      {
        accessorKey: "rotuloDetector",
        header: "Detector",
        size: 190,
        cell: ({ row }) => (
          <span>
            <span className="font-mono text-legenda text-muted-foreground">{row.original.detector}</span>{" "}
            {row.original.rotuloDetector}
          </span>
        ),
      },
      {
        accessorKey: "data",
        header: "Data",
        size: 100,
        cell: ({ row }) => <span className="tabular-nums">{diaBR(row.original.data)}</span>,
      },
      {
        id: "anomalia",
        accessorFn: (a) => `${a.title} ${a.description}`,
        header: "Anomalia",
        size: 420,
        cell: ({ row }) => (
          <span className="flex flex-col whitespace-normal">
            <span className="font-medium">{row.original.title}</span>
            <span className="text-muted-foreground">{row.original.description}</span>
            {row.original.acaoSugerida ? (
              <span className="text-legenda text-muted-foreground">{row.original.acaoSugerida}</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "equipamentoRotulo",
        header: "Equipamento",
        size: 200,
        cell: ({ row }) => row.original.equipamentoRotulo ?? <CelulaVazia />,
      },
      {
        id: "saidas",
        header: "Saídas afetadas",
        size: 150,
        cell: ({ row }) => {
          const ids = row.original.affectedSaidaIds;
          if (ids.length === 0) return <CelulaVazia />;
          if (!veAbastecimentos) return <span className="tabular-nums">{ids.length}</span>;
          return (
            <span className="flex flex-wrap gap-x-2">
              {ids.map((id, indice) => (
                <Link key={id} href={linkDaSaida(id)} className="font-medium hover:underline">
                  {ids.length === 1 ? "Abrir" : `Abrir ${indice + 1}`}
                </Link>
              ))}
            </span>
          );
        },
      },
      {
        id: "situacao",
        header: "Situação",
        size: 130,
        cell: ({ row }) => {
          const conferencia = row.original.conferencia;
          if (!conferencia) return <StatusBadge status="pendente_aprovacao" rotulo="Pendente" />;
          const detalhe = [`Conferida em ${formatarDataHoraRioBranco(conferencia.conferidoEm)}`, conferencia.motivo]
            .filter(Boolean)
            .join(". ");
          return (
            <span title={detalhe}>
              <StatusBadge status="aprovado" rotulo="Conferida" />
            </span>
          );
        },
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 290,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => (
        <span className="flex justify-end gap-2">
          {row.original.detector === "D1" && row.original.saidas.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEquipamentoUma("");
                setAtribuindoUma(row.original);
              }}
            >
              Atribuir equipamento
            </Button>
          ) : null}
          {row.original.conferencia ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDesmarcando(row.original)}>
              Desmarcar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMotivo("");
                setConferindo(row.original);
              }}
            >
              Marcar como conferida
            </Button>
          )}
        </span>
      ),
    });
    return base;
  }, [podeEditar, veAbastecimentos]);

  const litrosMarcados = saidasMarcadas.reduce((soma, s) => soma + s.litros, 0);

  return (
    <div className="flex flex-col gap-3">
      {podeEditar ? (
        <BarraSelecao
          quantidade={selecionadosValidos.length}
          onLimpar={() => setSelecionados([])}
          resumo={`${plural(saidasMarcadas.length, "saída", "saídas")} sem equipamento · ${formatarLitros(litrosMarcados)}`}
        >
          <div className="w-72">
            <Combobox
              valor={equipamentoLote}
              onValorChange={setEquipamentoLote}
              opcoes={equipamentos}
              placeholder="Selecionar equipamento"
              buscaPlaceholder="Buscar por código ou nome"
              size="sm"
              ariaLabel="Equipamento para as saídas selecionadas"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!equipamentoLote || saidasMarcadas.length === 0}
            onClick={() => setConfirmandoLote(true)}
          >
            Atribuir a {plural(saidasMarcadas.length, "saída", "saídas")}
          </Button>
        </BarraSelecao>
      ) : null}

      <DataTable
        // Limpa só os filtros DESTA lista: a de sem suprimento, na mesma página, tem o dela.
        onLimparFiltros={() => {
          setBusca("");
          // O modo é do cabeçalho do módulo (vale para todas as abas): limpar a lista não o troca.
          setMuitos({ de: null, ate: null, situacao: null, severidade: null, detector: null });
        }}
        idTabela="combustivel.anomalias"
        columns={colunas}
        data={visiveis}
        selecao={
          podeEditar
            ? {
                idDaLinha: (a: AnomaliaLista) => a.id,
                selecionados: selecionadosValidos,
                onSelecionadosChange: setSelecionados,
                // Só D1 recebe equipamento; as outras não têm o que atribuir.
                habilitada: (a: AnomaliaLista) => a.detector === "D1" && a.saidas.length > 0,
              }
            : undefined
        }
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por título ou descrição" />,
          },
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ de: null, ate: null }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data da saída"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })
                }
              />
            ),
          },
          {
            id: "severidade",
            rotulo: "Severidade",
            temValor: severidade !== "",
            onLimpar: () => setMuitos({ severidade: null }),
            elemento: (
              <FiltroSelect
                valor={severidade}
                onValorChange={(valor) => setMuitos({ severidade: valor === "" ? null : valor })}
                opcoes={OPCOES_SEVERIDADE}
                todosRotulo="Todas as severidades"
              />
            ),
          },
          {
            id: "detector",
            rotulo: "Detector",
            temValor: detector !== "",
            onLimpar: () => setMuitos({ detector: null }),
            elemento: (
              <FiltroSelect
                valor={detector}
                onValorChange={(valor) => setMuitos({ detector: valor === "" ? null : valor })}
                opcoes={OPCOES_DETECTOR}
                todosRotulo="Todos os detectores"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação",
            fixo: true,
            temValor: situacao !== "pendentes",
            onLimpar: () => setMuitos({ situacao: null }),
            elemento: (
              <FiltroSelect
                valor={situacao === "todas" ? "" : situacao}
                // "Todas" é o vazio do filtro; o padrão da tela (sem parâmetro) é "pendentes".
                onValorChange={(valor) => setMuitos({ situacao: valor === "" ? "todas" : valor === "pendentes" ? null : valor })}
                opcoes={OPCOES_SITUACAO}
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={ShieldCheck}
            titulo={
              anomalias.length === 0
                ? "Sem anomalias detectadas no período"
                : situacao === "conferidas"
                  ? "Nenhuma anomalia conferida bate com os filtros"
                  : "Nenhuma anomalia pendente bate com os filtros"
            }
            descricao={
              anomalias.length === 0
                ? "Os 5 detectores (sentinel, R$/L outlier, volume atípico, duplicatas, gap operacional) rodaram e não encontraram problemas"
                : "Amplie o período ou limpe os filtros para ver as outras"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <>
          <ConfirmDialog
            aberto={conferindo !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setConferindo(null);
            }}
            titulo="Marcar como conferida"
            descricao={conferindo ? `${conferindo.title}. ${conferindo.description}` : ""}
            textoConfirmar="Marcar como conferida"
            conteudo={
              <div className="grid gap-2">
                <Label htmlFor="motivo-conferencia">Por que essa anomalia está OK? (opcional)</Label>
                <Textarea
                  id="motivo-conferencia"
                  value={motivo}
                  maxLength={MAXIMO_MOTIVO}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Ex.: o operador confirmou o abastecimento"
                  rows={3}
                />
              </div>
            }
            onConfirmar={aoConfirmarConferencia}
          />
          <ConfirmDialog
            aberto={desmarcando !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setDesmarcando(null);
            }}
            titulo="Desmarcar conferência"
            descricao="A anomalia volta para a lista de pendentes."
            textoConfirmar="Desmarcar"
            onConfirmar={aoConfirmarDesmarcar}
          />
          <ConfirmDialog
            aberto={confirmandoLote}
            onAbertoChange={setConfirmandoLote}
            titulo="Confirmar atribuição"
            descricao={`${plural(saidasMarcadas.length, "saída receberá", "saídas receberão")} o equipamento ${rotuloEquipamentoLote}. A troca fica registrada na auditoria.`}
            textoConfirmar="Confirmar e salvar"
            conteudo={<ListaSaidas saidas={saidasMarcadas} />}
            onConfirmar={aoConfirmarLote}
          />
          <ConfirmDialog
            aberto={atribuindoUma !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setAtribuindoUma(null);
            }}
            titulo="Atribuir equipamento à saída"
            descricao={atribuindoUma ? atribuindoUma.description : ""}
            textoConfirmar="Atribuir"
            conteudo={
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="equipamento-atribuir">Equipamento</Label>
                  <Combobox
                    id="equipamento-atribuir"
                    valor={equipamentoUma}
                    onValorChange={setEquipamentoUma}
                    opcoes={equipamentos}
                    placeholder="Buscar por código ou nome"
                    buscaPlaceholder="Buscar por código ou nome"
                  />
                </div>
                {atribuindoUma ? <ListaSaidas saidas={atribuindoUma.saidas} /> : null}
              </div>
            }
            onConfirmar={aoConfirmarUma}
          />
        </>
      ) : null}
    </div>
  );
}

/** As saídas afetadas, como a SaidasAfetadasList da origem (compacta). */
function ListaSaidas({ saidas }: { saidas: readonly SaidaDaAnomalia[] }) {
  if (saidas.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-md border border-border text-detalhe">
      {saidas.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
          <span className="flex flex-col">
            <span className="tabular-nums">{dataHoraDeParede(s.data)}</span>
            <span className="text-legenda text-muted-foreground">
              {[s.tanque ?? "Sem tanque", s.obra ?? "Sem obra"].join(" · ")}
            </span>
          </span>
          <span className="text-right tabular-nums">
            {formatarLitros(s.litros)} · <MoneyText valor={s.valorTotal} />
          </span>
        </li>
      ))}
    </ul>
  );
}
