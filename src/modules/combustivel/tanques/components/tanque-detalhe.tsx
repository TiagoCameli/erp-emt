"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroSelect,
  PageHeader,
  SecaoDetalhe,
  StatusBadge,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { formatarLitros, formatarDataHoraRioBranco } from "@/modules/combustivel/_shared/rotulos";
import {
  ROTULO_MOVIMENTO_TANQUE,
  rotaDoMovimento,
  type MovimentoComNivel,
  type TipoMovimentoTanque,
} from "@/modules/combustivel/tanques/calculo";
import type { TanqueLinha } from "@/modules/combustivel/tanques/queries";
import { SeloCombustivel, TanqueVisual } from "./tanque-visual";

const TIPOS: TipoMovimentoTanque[] = [
  "entrada",
  "abastecimento",
  "transferencia_recebida",
  "transferencia_enviada",
  "esvaziamento",
];

const OPCOES_TIPO = TIPOS.map((tipo) => ({ valor: tipo, rotulo: ROTULO_MOVIMENTO_TANQUE[tipo] }));

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-legenda text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function colunasMovimentos(comNivel: boolean): ColumnDef<MovimentoComNivel, unknown>[] {
  const base: ColumnDef<MovimentoComNivel, unknown>[] = [
    {
      accessorKey: "dataHora",
      header: "Data",
      size: 140,
      meta: { atomico: true },
      cell: ({ row }) => <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.dataHora)}</span>,
    },
    {
      accessorKey: "tipo",
      header: "Movimento",
      size: 180,
      cell: ({ row }) => ROTULO_MOVIMENTO_TANQUE[row.original.tipo],
    },
    {
      accessorKey: "descricao",
      header: "Detalhe",
      size: 320,
      cell: ({ row }) =>
        row.original.descricao ? <span className="truncate">{row.original.descricao}</span> : <CelulaVazia />,
    },
    {
      accessorKey: "delta",
      header: "Litros",
      size: 130,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => {
        const delta = row.original.delta;
        return (
          <span className="tabular-nums">
            {delta > 0 ? "+" : "−"}
            {formatarLitros(Math.abs(delta))}
          </span>
        );
      },
    },
  ];
  if (!comNivel) return base;
  base.push({
    accessorKey: "nivelDepois",
    header: "Nível depois",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.nivelDepois)}</span>,
  });
  return base;
}

export interface TanqueDetalheProps {
  tanque: TanqueLinha;
  /** Linha do tempo com nível corrido, do mais recente para o mais antigo. */
  movimentos: MovimentoComNivel[];
}

/**
 * Detalhe do tanque (somente leitura): o cadastro e todos os movimentos que
 * mexeram no nível, com o nível logo depois de cada um. O nível corrido segue a
 * ordem da trava do banco (no mesmo instante, a saída antes da entrada). Tanque
 * de terceiro não tem estoque: mostra só os abastecimentos, sem nível. O clique no
 * movimento leva ao registro de origem (`rotaDoMovimento`).
 */
export function TanqueDetalhe({ tanque, movimentos }: TanqueDetalheProps) {
  const router = useRouter();
  const [tipo, setTipo] = useFiltroSessao<string>("tipo", "", ["", ...TIPOS]);

  const filtrados = React.useMemo(
    () => (tipo === "" ? movimentos : movimentos.filter((m) => m.tipo === tipo)),
    [movimentos, tipo],
  );

  const colunas = React.useMemo(() => colunasMovimentos(!tanque.ehExterno), [tanque.ehExterno]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo={tanque.nome}
        descricao={tanque.apelido ?? undefined}
        voltarPara={{ rota: "/combustivel/tanques", rotulo: "Voltar para a lista de tanques" }}
        selos={
          <>
            {tanque.ativo ? (
              <StatusBadge status="aprovado" rotulo="Ativo" />
            ) : (
              <StatusBadge status="rascunho" rotulo="Inativo" />
            )}
            {tanque.ehExterno ? <StatusBadge status="rascunho" rotulo="De terceiro" /> : null}
          </>
        }
        className="mb-0"
      />

      <SecaoDetalhe titulo="Tanque" card>
        <div
          className={
            tanque.ehExterno ? undefined : "grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
          }
        >
          {tanque.ehExterno ? null : (
            <TanqueVisual
              id={tanque.id}
              nome={tanque.nome}
              capacidade={tanque.capacidade}
              nivel={tanque.nivel}
              combustivelNome={tanque.combustivelNome}
              comCabecalho={false}
            />
          )}
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Dado rotulo="Dono">{tanque.ehExterno ? tanque.proprietarioNome ?? "Terceiro" : "EMT"}</Dado>
            <Dado rotulo="Capacidade">
              {tanque.capacidade > 0 ? (
                <span className="tabular-nums">{formatarLitros(tanque.capacidade)}</span>
              ) : (
                <span className="text-muted-foreground">Sem trava de capacidade</span>
              )}
            </Dado>
            <Dado rotulo="Nível atual">
              {tanque.ehExterno ? (
                <span className="text-muted-foreground">Tanque de terceiro, sem estoque</span>
              ) : (
                <span className="tabular-nums">{formatarLitros(tanque.nivel)}</span>
              )}
            </Dado>
            <Dado rotulo="Combustível atual">
              {tanque.ehExterno ? (
                <span className="text-muted-foreground">Sem controle de estoque</span>
              ) : (
                <SeloCombustivel nome={tanque.combustivelNome} vazio={tanque.nivel <= 0} />
              )}
            </Dado>
            {tanque.observacoes ? (
              <div className="sm:col-span-2">
                <Dado rotulo="Observações">
                  <span className="whitespace-pre-line">{tanque.observacoes}</span>
                </Dado>
              </div>
            ) : null}
          </dl>
        </div>
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Movimentos">
        <DataTable
          idTabela="combustivel.tanques.movimentos"
          columns={colunas}
          data={filtrados}
          onRowClick={(movimento) => router.push(rotaDoMovimento(movimento))}
          filtros={[
            {
              id: "tipo",
              rotulo: "Movimento",
              fixo: true,
              temValor: tipo !== "",
              onLimpar: () => setTipo(""),
              elemento: (
                <FiltroSelect
                  valor={tipo}
                  onValorChange={setTipo}
                  opcoes={OPCOES_TIPO}
                  placeholder="Movimento"
                  todosRotulo="Todos os movimentos"
                />
              ),
            },
          ]}
          emptyState={
            <EmptyState
              icone={History}
              titulo={movimentos.length === 0 ? "Nenhum movimento neste tanque" : "Nenhum movimento deste tipo"}
              descricao={
                movimentos.length === 0
                  ? "Entradas, abastecimentos, transferências e esvaziamentos aparecem aqui"
                  : "Escolha outro tipo de movimento"
              }
              className="border-none bg-transparent"
            />
          }
        />
      </SecaoDetalhe>
    </div>
  );
}
