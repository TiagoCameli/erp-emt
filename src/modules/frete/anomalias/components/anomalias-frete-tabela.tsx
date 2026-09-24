"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";

import {
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
import { formatarDataHora } from "@/lib/formatadores";
import { conferirAnomaliaFrete } from "@/modules/frete/anomalias/actions";
import {
  DETECTORES,
  FRETE_DETECTOR_LABEL,
  SEVERIDADES,
  SEVERITY_LABEL,
  type DetectorId,
  type Severidade,
} from "@/modules/frete/anomalias/detect";
import { linkDoFrete } from "@/modules/frete/anomalias/links";
import type { AnomaliaFreteLista, FreteDaAnomalia } from "@/modules/frete/anomalias/queries";
import { MAXIMO_MOTIVO, type Situacao } from "@/modules/frete/anomalias/schemas";

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
const OPCOES_SEVERIDADE = SEVERIDADES.map((s) => ({ valor: s, rotulo: SEVERITY_LABEL[s] }));
const OPCOES_REGRA = DETECTORES.map((d) => ({ valor: d, rotulo: `${d} ${FRETE_DETECTOR_LABEL[d]}` }));

function diaBR(dia: string): string {
  return dia.split("-").reverse().join("/");
}

function toneladas(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} t`;
}

export interface AnomaliasFreteTabelaProps {
  anomalias: AnomaliaFreteLista[];
  situacao: Situacao;
  severidade: Severidade | "";
  regra: DetectorId | "";
  /** Recorte pela data da anomalia (yyyy-MM-dd), vazio = sem limite. */
  de: string;
  ate: string;
  podeEditar: boolean;
  /** A pessoa abre o frete? Sem isso o link seria para um 404. */
  veFretes: boolean;
}

/**
 * A aba Anomalias da origem (AnomaliasFreteTab + AnomaliaFreteDrawer). A detecção roda no
 * servidor e chega pronta; aqui só se filtra e se confere. Conferir pede
 * frete.anomalias/editar e aceita um motivo (a origem nunca gravava o motivo).
 */
export function AnomaliasFreteTabela({
  anomalias,
  situacao,
  severidade,
  regra,
  de,
  ate,
  podeEditar,
  veFretes,
}: AnomaliasFreteTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const [busca, setBusca] = React.useState("");
  const [conferindo, setConferindo] = React.useState<AnomaliaFreteLista | null>(null);
  const [desmarcando, setDesmarcando] = React.useState<AnomaliaFreteLista | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const visiveis = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return anomalias.filter((a) => {
      if (situacao === "conferidas" && a.conferencia === null) return false;
      if (situacao === "pendentes" && a.conferencia !== null) return false;
      if (severidade && a.severity !== severidade) return false;
      if (regra && a.detector !== regra) return false;
      if (de && a.data < de) return false;
      if (ate && a.data > ate) return false;
      if (q && !`${a.title} ${a.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [anomalias, situacao, severidade, regra, de, ate, busca]);

  async function aoConfirmarConferencia() {
    if (!conferindo) return;
    const resultado = await conferirAnomaliaFrete({ chave: conferindo.id, conferida: true, motivo });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia marcada como conferida");
    setConferindo(null);
  }

  async function aoConfirmarDesmarcar() {
    if (!desmarcando) return;
    const resultado = await conferirAnomaliaFrete({ chave: desmarcando.id, conferida: false });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia voltou para pendentes");
    setDesmarcando(null);
  }

  const colunas = React.useMemo<ColumnDef<AnomaliaFreteLista, unknown>[]>(() => {
    const base: ColumnDef<AnomaliaFreteLista, unknown>[] = [
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
        header: "Regra",
        size: 220,
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
        size: 440,
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
        id: "fretes",
        header: "Fretes afetados",
        size: 160,
        cell: ({ row }) => {
          const ids = row.original.affectedFreteIds;
          if (ids.length === 0) return <span className="text-muted-foreground">Agregada</span>;
          if (!veFretes) return <span className="tabular-nums">{ids.length}</span>;
          return (
            <span className="flex flex-wrap gap-x-2">
              {ids.map((id, indice) => (
                <Link key={id} href={linkDoFrete(id)} className="font-medium hover:underline">
                  {ids.length === 1 ? "Abrir frete" : `Abrir ${indice + 1}`}
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
          const detalhe = [`Conferida em ${formatarDataHora(conferencia.conferidoEm)}`, conferencia.motivo]
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
      size: 200,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) =>
        row.original.conferencia ? (
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
        ),
    });
    return base;
  }, [podeEditar, veFretes]);

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        onLimparFiltros={() => {
          setBusca("");
          setMuitos({ de: null, ate: null, situacao: null, severidade: null, regra: null });
        }}
        idTabela="frete.anomalias"
        columns={colunas}
        data={visiveis}
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
            id: "regra",
            rotulo: "Regra",
            fixo: true,
            temValor: regra !== "",
            onLimpar: () => setMuitos({ regra: null }),
            elemento: (
              <FiltroSelect
                valor={regra}
                onValorChange={(valor) => setMuitos({ regra: valor === "" ? null : valor })}
                opcoes={OPCOES_REGRA}
                todosRotulo="Todas as regras"
              />
            ),
          },
          {
            id: "severidade",
            rotulo: "Severidade",
            fixo: true,
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
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ de: null, ate: null }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data da anomalia"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })
                }
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
                onValorChange={(valor) =>
                  setMuitos({ situacao: valor === "" ? "todas" : valor === "pendentes" ? null : valor })
                }
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
                ? "Sem anomalias detectadas no período."
                : situacao === "conferidas"
                  ? "Nenhuma anomalia conferida bate com os filtros"
                  : "Nenhuma anomalia pendente bate com os filtros"
            }
            descricao={
              anomalias.length === 0
                ? "As 6 regras (preço, sem pedido, saldo na pedreira, duplicidade, cadastro e chegada) rodaram sobre todos os fretes"
                : "Limpe os filtros ou mude a situação para ver as outras"
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
              <div className="grid gap-3">
                {conferindo ? <ListaFretes anomalia={conferindo} veFretes={veFretes} /> : null}
                <div className="grid gap-2">
                  <Label htmlFor="motivo-conferencia-frete">Por que essa anomalia está OK? (opcional)</Label>
                  <Textarea
                    id="motivo-conferencia-frete"
                    value={motivo}
                    maxLength={MAXIMO_MOTIVO}
                    onChange={(evento) => setMotivo(evento.target.value)}
                    placeholder="Ex.: a pedreira confirmou o preço da nota"
                    rows={3}
                  />
                </div>
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
        </>
      ) : null}
    </div>
  );
}

/** Os fretes afetados, como a FretesAfetadosList da origem (compacta). */
function ListaFretes({ anomalia, veFretes }: { anomalia: AnomaliaFreteLista; veFretes: boolean }) {
  if (anomalia.fretes.length === 0) {
    return (
      <p className="text-detalhe text-muted-foreground">
        Anomalia agregada por material e fornecedor (sem fretes específicos).
      </p>
    );
  }
  return (
    <div className="grid gap-1">
      <p className="text-detalhe font-medium">Fretes afetados ({anomalia.fretes.length})</p>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border text-detalhe">
        {anomalia.fretes.map((f: FreteDaAnomalia) => (
          <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
            <span className="flex flex-col">
              <span>
                <span className="tabular-nums">{diaBR(f.data)}</span> · {f.origem} → {f.destino}
              </span>
              <span className="text-legenda text-muted-foreground">
                {[f.material, toneladas(f.peso), f.placa, f.notaFiscal ? `NF ${f.notaFiscal}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="text-right">
              <MoneyText valor={f.valorMaterial} />
              {f.peso > 0 ? (
                <span className="block text-legenda text-muted-foreground">
                  <MoneyText valor={f.valorMaterial / f.peso} />/t
                </span>
              ) : null}
              {veFretes ? (
                <Link href={linkDoFrete(f.id)} className="block text-legenda font-medium hover:underline">
                  Abrir frete
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
