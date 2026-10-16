"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Undo2 } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { dataLocalISO, formatarData, formatarDataHora } from "@/lib/formatadores";
import {
  TIPOS_MOVIMENTACAO,
  resumirMovimentacao,
  rotuloTipoMovimentacao,
  type MovimentacaoMapa,
} from "@/modules/mapa/historico";
import { desfazerMovimentacao } from "@/modules/mapa/historico-actions";
import type { MaquinaOpcao } from "@/modules/mapa/historico-queries";

interface Linha extends MovimentacaoMapa {
  de: string;
  para: string;
  trocouObra: boolean;
}

const colunas: ColumnDef<Linha, unknown>[] = [
  {
    id: "quando",
    header: "Quando",
    size: 150,
    meta: { atomico: true },
    cell: ({ row }) => {
      const m = row.original;
      const registro = formatarDataHora(m.criadoEm);
      // A data efetiva só aparece quando é outra (transferência lançada com data passada).
      const efetivaDiferente = dataLocalISO(m.criadoEm) !== m.dataEfetiva;
      return (
        <div className="flex flex-col tabular-nums">
          <span>{registro}</span>
          {efetivaDiferente ? (
            <span className="text-legenda text-muted-foreground">
              vale de {formatarData(m.dataEfetiva)}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "maquina",
    header: "Máquina",
    size: 220,
    meta: { fixa: true },
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">
          {row.original.alvoCodigo || row.original.alvoNome || "–"}
        </span>
        {row.original.alvoCodigo && row.original.alvoNome ? (
          <span className="text-legenda text-muted-foreground">
            {row.original.alvoNome}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 140,
    cell: ({ row }) => {
      const m = row.original;
      if (m.desfeitaEm)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge variant="secondary">
              {rotuloTipoMovimentacao(m.tipo)} desfeita
            </Badge>
            <span className="text-legenda text-muted-foreground">
              {m.desfeitaPorNome || "–"}, {formatarDataHora(m.desfeitaEm)}
              {m.desfeitaMotivo ? ` · ${m.desfeitaMotivo}` : ""}
            </span>
          </div>
        );
      return (
        <Badge
          variant={m.trocouObra ? "default" : "outline"}
          title={m.trocouObra ? "Trocou de obra" : undefined}
        >
          {rotuloTipoMovimentacao(m.tipo)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "de",
    header: "De",
    size: 260,
    cell: ({ row }) => <Riscado linha={row.original} texto={row.original.de} />,
  },
  {
    accessorKey: "para",
    header: "Para",
    size: 260,
    cell: ({ row }) => (
      <Riscado linha={row.original} texto={row.original.para} />
    ),
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    size: 220,
    cell: ({ row }) => row.original.motivo || "–",
  },
  {
    accessorKey: "usuarioNome",
    header: "Quem",
    size: 160,
    cell: ({ row }) => row.original.usuarioNome || "–",
  },
];

/** A movimentação desfeita continua na trilha, riscada: não vale mais. */
function Riscado({ linha, texto }: { linha: Linha; texto: string }) {
  return linha.desfeitaEm ? (
    <span className="text-muted-foreground line-through">{texto}</span>
  ) : (
    <>{texto}</>
  );
}

function idDaLinha(m: Linha): string {
  return String(m.id);
}

export interface HistoricoTabelaProps {
  linhas: MovimentacaoMapa[];
  maquinas: MaquinaOpcao[];
  /** Vindo da ficha da máquina: já abre filtrado nela. */
  maquinaInicial: string;
  /** A RPC devolve até 2000: avisar quando bateu no teto. */
  noTeto: boolean;
  /** mapa.mapa/editar: mostra "Desfazer" na última movimentação de cada máquina. */
  podeDesfazer: boolean;
}

/**
 * A trilha do Mapa: cada transferência, posição, estado, operador, locação e acoplamento, com
 * quem fez e quando. Transferência que trocou de obra sai com o selo cheio. Filtros na própria
 * tela (a trilha inteira já veio do servidor, até 2000 linhas).
 */
export function HistoricoTabela({
  linhas,
  maquinas,
  maquinaInicial,
  noTeto,
  podeDesfazer,
}: HistoricoTabelaProps) {
  const router = useRouter();
  const [desfazendo, setDesfazendo] = React.useState<Linha | null>(null);
  const [busca, setBusca] = React.useState("");
  const [maquina, setMaquina] = React.useState(maquinaInicial);
  const [tipo, setTipo] = React.useState("");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");

  const comResumo = React.useMemo(
    () => linhas.map((m): Linha => ({ ...m, ...resumirMovimentacao(m) })),
    [linhas],
  );

  // O cadastro dá as máquinas; quem não o lê ainda filtra pelas que aparecem na trilha.
  const opcoesMaquina = React.useMemo(() => {
    const vistas = new Map<string, string>();
    for (const m of maquinas)
      vistas.set(m.id, m.descricao ? `${m.codigo} · ${m.descricao}` : m.codigo);
    for (const l of linhas)
      if (!vistas.has(l.alvoId))
        vistas.set(l.alvoId, l.alvoCodigo || l.alvoNome || "Sem código");
    return [...vistas]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [maquinas, linhas]);

  const dados = React.useMemo(
    () =>
      comResumo.filter((l) => {
        if (maquina && l.alvoId !== maquina) return false;
        if (tipo && l.tipo !== tipo) return false;
        if (de && l.dataEfetiva < de) return false;
        if (ate && l.dataEfetiva > ate) return false;
        return casaBusca(
          textoPesquisavel(
            l.alvoCodigo,
            l.alvoNome,
            rotuloTipoMovimentacao(l.tipo),
            l.de,
            l.para,
            l.motivo,
            l.usuarioNome,
          ),
          busca,
        );
      }),
    [comResumo, maquina, tipo, de, ate, busca],
  );

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="mapa.historico"
        columns={
          podeDesfazer
            ? [
                ...colunas,
                {
                  id: "acoes",
                  header: "",
                  size: 120,
                  enableSorting: false,
                  cell: ({ row }) =>
                    row.original.podeDesfazer ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDesfazendo(row.original)}
                        title="Desfaz esta movimentação e volta a máquina para como estava antes"
                      >
                        <Undo2 />
                        Desfazer
                      </Button>
                    ) : null,
                },
              ]
            : colunas
        }
        data={dados}
        idDaLinha={idDaLinha}
        cabecalhoFixo
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Máquina, obra, lugar, motivo ou quem fez"
              />
            ),
          },
          {
            id: "maquina",
            rotulo: "Máquina",
            temValor: maquina !== "",
            onLimpar: () => setMaquina(""),
            elemento: (
              <FiltroSelect
                valor={maquina}
                onValorChange={setMaquina}
                opcoes={opcoesMaquina}
                placeholder="Máquina"
                todosRotulo="Todas as máquinas"
                className="max-w-72"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo",
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={TIPOS_MOVIMENTACAO.map((t) => ({
                  valor: t,
                  rotulo: rotuloTipoMovimentacao(t),
                }))}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período",
            temValor: de !== "" || ate !== "",
            onLimpar: () => {
              setDe("");
              setAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data efetiva"
                onPeriodoChange={(novoDe, novoAte) => {
                  setDe(novoDe);
                  setAte(novoAte);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={History}
            titulo="Nenhuma movimentação"
            descricao="Transferências, ajustes e mudanças de estado feitas no mapa aparecem aqui"
            className="border-none bg-transparent"
          />
        }
      />
      {desfazendo ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setDesfazendo(null);
          }}
          titulo={`Desfazer ${rotuloTipoMovimentacao(desfazendo.tipo).toLowerCase()} de ${desfazendo.alvoCodigo || desfazendo.alvoNome}?`}
          descricao={`A máquina volta para como estava antes: ${desfazendo.de}. A linha fica no histórico, riscada, com o motivo.`}
          textoConfirmar="Desfazer movimentação"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={async (motivo) => {
            const r = await desfazerMovimentacao({
              id: desfazendo.id,
              motivo: motivo ?? "",
            });
            if ("erro" in r) {
              toast.error(r.erro);
              return false;
            }
            toast.success(
              `${desfazendo.alvoCodigo || "Máquina"} voltou para como estava antes`,
            );
            setDesfazendo(null);
            router.refresh();
            return true;
          }}
        />
      ) : null}
      {noTeto ? (
        <p className="text-detalhe text-muted-foreground">
          Mostrando as 2000 movimentações mais recentes.
        </p>
      ) : null}
    </div>
  );
}
