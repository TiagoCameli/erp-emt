"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
} from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { dataLocalISO, formatarData, formatarDataHora } from "@/lib/formatadores";
import {
  TIPOS_MOVIMENTACAO,
  resumirMovimentacao,
  rotuloTipoMovimentacao,
  type MovimentacaoMapa,
} from "@/modules/mapa/historico";
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
    cell: ({ row }) => (
      <Badge
        variant={row.original.trocouObra ? "default" : "outline"}
        title={row.original.trocouObra ? "Trocou de obra" : undefined}
      >
        {rotuloTipoMovimentacao(row.original.tipo)}
      </Badge>
    ),
  },
  { accessorKey: "de", header: "De", size: 260 },
  { accessorKey: "para", header: "Para", size: 260 },
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
}: HistoricoTabelaProps) {
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
        columns={colunas}
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
      {noTeto ? (
        <p className="text-detalhe text-muted-foreground">
          Mostrando as 2000 movimentações mais recentes.
        </p>
      ) : null}
    </div>
  );
}
