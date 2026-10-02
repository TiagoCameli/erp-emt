"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Scale } from "lucide-react";

import {
  CelulaVazia,
  colunaData,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { restringirOpcoes, selecao, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";
import { CHAVES_FILTRO_AJUSTES as CHAVE, rotaDoAjuste, type FacetaAjustes } from "@/modules/frete/ajustes/filtros";
import {
  contaNoSaldo,
  ROTULO_SINAL,
  ROTULO_STATUS_AJUSTE,
  rotuloStatusAjuste,
  STATUS_AJUSTE,
} from "@/modules/frete/ajustes/regras";
import { SINAIS_AJUSTE } from "@/modules/frete/ajustes/schemas";
import type { AjusteLista } from "@/modules/frete/ajustes/queries";
import { somar } from "@/modules/frete/conta-corrente/extrato";

const OPCOES_STATUS = STATUS_AJUSTE.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_AJUSTE[s] }));
const OPCOES_SINAL = SINAIS_AJUSTE.map((s) => ({ valor: s, rotulo: ROTULO_SINAL[s] }));

/** Colunas da lista, exportadas para o teste. */
export const colunasAjustes: ColumnDef<AjusteLista, unknown>[] = [
  colunaData<AjusteLista>("data", "Data", formatarData),
  {
    accessorKey: "transportadoraNome",
    header: "Transportadora",
    size: 220,
    meta: { celular: "titulo" },
    cell: ({ row }) => row.original.transportadoraNome || <CelulaVazia />,
  },
  {
    accessorKey: "sinal",
    header: "Sinal",
    size: 100,
    cell: ({ row }) => (
      <span className={row.original.sinal === "credito" ? "text-status-aprovado" : "text-status-rejeitado"}>
        {ROTULO_SINAL[row.original.sinal]}
      </span>
    ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    size: 320,
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.descricao}</span>
        {row.original.motivoStatus ? (
          <span className="text-legenda text-muted-foreground">Motivo: {row.original.motivoStatus}</span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "obraNome",
    header: "Obra",
    size: 180,
    cell: ({ row }) => row.original.obraNome ?? <CelulaVazia />,
  },
  {
    accessorKey: "valor",
    header: "Valor",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original.valor}
        className={row.original.sinal === "credito" ? "text-status-aprovado" : "text-status-rejeitado"}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 180,
    cell: ({ row }) => <StatusBadge status={row.original.status} rotulo={rotuloStatusAjuste(row.original.status)} />,
  },
  {
    accessorKey: "criadoPorNome",
    header: "Criado por",
    size: 160,
    cell: ({ row }) => row.original.criadoPorNome ?? <CelulaVazia />,
  },
];

export interface AjustesTabelaProps {
  ajustes: AjusteLista[];
  transportadoras: { id: string; nome: string }[];
  transportadoraId: string;
  status: string;
  sinal: string;
  de: string;
  ate: string;
  /** Valores que existem na lista filtrada, por filtro de seleção (ver `facetasAjustes`). */
  facetas?: FacetasPresentes<FacetaAjustes>;
}

/**
 * Lista dos ajustes de saldo. Filtros na URL (transportadora, status, sinal e
 * período da data do ajuste). O rodapé separa o que já está no saldo (aprovado)
 * do que ainda espera aprovação.
 */
export function AjustesTabela({ ajustes, transportadoras, transportadoraId, status, sinal, de, ate, facetas }: AjustesTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();

  // Cada filtro só oferece o que existe com os outros aplicados (ver `_shared/filtros-facetados`).
  function facetar(id: FacetaAjustes, base: { valor: string; rotulo: string }[], valor: string) {
    if (!facetas) return base;
    return restringirOpcoes(base, new Set(facetas[id]), selecao(valor));
  }

  const noSaldo = ajustes.filter((a) => contaNoSaldo(a.status));
  const pendentes = ajustes.filter((a) => a.status === "pendente_aprovacao");
  const liquido = (lista: AjusteLista[]) => somar(lista.map((a) => (a.sinal === "credito" ? a.valor : -a.valor)));

  const filtroSelect = (chave: string, valor: string, opcoes: { valor: string; rotulo: string }[], todos: string) => (
    <FiltroSelect
      valor={valor}
      onValorChange={(novo) => setMuitos({ [chave]: novo === "" ? null : novo })}
      opcoes={opcoes}
      todosRotulo={todos}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="frete.ajustes"
        columns={colunasAjustes}
        data={ajustes}
        onRowClick={(a) => router.push(rotaDoAjuste(a.id))}
        onLimparFiltros={limparTodos}
        filtros={[
          {
            id: "transportadora",
            rotulo: "Transportadora",
            fixo: true,
            temValor: transportadoraId !== "",
            onLimpar: () => setMuitos({ [CHAVE.transportadora]: null }),
            elemento: filtroSelect(
              CHAVE.transportadora,
              transportadoraId,
              facetar(
                "transportadora",
                transportadoras.map((t) => ({ valor: t.id, rotulo: t.nome })),
                transportadoraId,
              ),
              "Todas as transportadoras",
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "",
            onLimpar: () => setMuitos({ [CHAVE.status]: null }),
            elemento: filtroSelect(CHAVE.status, status, facetar("status", OPCOES_STATUS, status), "Todos os status"),
          },
          {
            id: "sinal",
            rotulo: "Sinal",
            temValor: sinal !== "",
            onLimpar: () => setMuitos({ [CHAVE.sinal]: null }),
            elemento: filtroSelect(CHAVE.sinal, sinal, facetar("sinal", OPCOES_SINAL, sinal), "Crédito e débito"),
          },
          {
            id: "periodo",
            rotulo: "Período",
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ [CHAVE.de]: null, [CHAVE.ate]: null }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ [CHAVE.de]: novoDe === "" ? null : novoDe, [CHAVE.ate]: novoAte === "" ? null : novoAte })
                }
              />
            ),
          },
        ]}
        acoesLinha={(a) => (
          <DropdownMenuItem onSelect={() => router.push(rotaDoAjuste(a.id))}>
            <ExternalLink />
            Abrir ajuste
          </DropdownMenuItem>
        )}
        emptyState={
          <EmptyState
            icone={Scale}
            titulo="Nenhum ajuste encontrado"
            descricao="Ajuste os filtros ou lance um ajuste pelo botão do cabeçalho"
            className="border-none bg-transparent"
          />
        }
      />

      {ajustes.length > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {ajustes.length} {ajustes.length === 1 ? "ajuste" : "ajustes"} no filtro. No saldo (aprovados):{" "}
          <MoneyText valor={liquido(noSaldo)} className="font-medium text-foreground" />. Pendentes de aprovação, fora do
          saldo: {pendentes.length} (<MoneyText valor={liquido(pendentes)} className="font-medium text-foreground" />)
        </p>
      ) : null}
    </div>
  );
}
