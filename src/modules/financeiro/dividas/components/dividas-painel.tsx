"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, Plus } from "lucide-react";

import { DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarPercentual } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import type { EtapaOpcao } from "@/modules/financeiro/dividas/calculo";
import { ContratoFormDrawer } from "@/modules/financeiro/dividas/components/contrato-form-drawer";
import { CotaFormDrawer } from "@/modules/financeiro/dividas/components/cota-form-drawer";
import { SeloContrato, SeloCota } from "@/modules/financeiro/dividas/components/selos";
import type { ConsorcioRelatorio, ContratoRelatorio } from "@/modules/financeiro/dividas/relatorio";
import { ROTULO_SISTEMA, ROTULO_TIPO_CONTRATO, rotulo } from "@/modules/financeiro/dividas/schemas";

export type AbaDividas = "contratos" | "consorcios";

export const colunasContratos: ColumnDef<ContratoRelatorio, unknown>[] = [
  {
    accessorKey: "credor",
    header: "Credor",
    size: 220,
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.credor}</span>
        <span className="text-legenda text-muted-foreground">{row.original.numero}</span>
      </span>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 160,
    cell: ({ row }) => rotulo(ROTULO_TIPO_CONTRATO, row.original.tipo),
  },
  { accessorKey: "centro", header: "Etapa", size: 200, cell: ({ row }) => row.original.centro ?? "-" },
  {
    accessorKey: "valorLiberado",
    header: "Liberado",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorLiberado} />,
  },
  {
    accessorKey: "saldoDevedor",
    header: "Saldo devedor",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.saldoDevedor} />,
  },
  {
    accessorKey: "aPagar",
    header: "A pagar",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.aPagar} />,
  },
  {
    accessorKey: "totalNoPrazo",
    header: "Total no prazo",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.totalNoPrazo} />,
  },
  {
    accessorKey: "quitacaoHoje",
    header: "Quitar hoje",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.quitacaoHoje} />,
  },
  {
    id: "taxa",
    header: "Taxa",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      `${formatarPercentual(row.original.taxaAm, 4)} a.m. · ${rotulo(ROTULO_SISTEMA, row.original.sistema)}`,
  },
  {
    id: "cronograma",
    header: "Cronograma",
    size: 120,
    cell: ({ row }) =>
      row.original.temCronograma ? "Sim" : <span className="text-status-pendente">Falta</span>,
  },
  { accessorKey: "status", header: "Status", size: 120, cell: ({ row }) => <SeloContrato status={row.original.status} /> },
];

export const colunasCotas: ColumnDef<ConsorcioRelatorio, unknown>[] = [
  {
    accessorKey: "administradora",
    header: "Administradora",
    size: 220,
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.administradora}</span>
        <span className="text-legenda text-muted-foreground">
          Grupo {row.original.grupo} · cota {row.original.cota}
        </span>
      </span>
    ),
  },
  { accessorKey: "bem", header: "Bem", size: 220 },
  {
    accessorKey: "valorCredito",
    header: "Crédito",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorCredito} />,
  },
  {
    id: "pagas",
    header: "Pagas",
    size: 100,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => `${row.original.parcelasPagas} de ${row.original.prazo}`,
  },
  {
    accessorKey: "aPagar",
    header: "A pagar",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.aPagar} />,
  },
  { accessorKey: "status", header: "Status", size: 120, cell: ({ row }) => <SeloCota status={row.original.status} /> },
];

export interface DividasPainelProps {
  abaInicial: AbaDividas;
  contratos: ContratoRelatorio[];
  cotas: ConsorcioRelatorio[];
  etapas: EtapaOpcao[];
  centros: readonly CentroCustoOpcao[];
  podeEditar: boolean;
}

/**
 * As duas abas de Dívidas: contratos (empréstimo, capital de giro, FINAME...)
 * e cotas de consórcio. A aba vai para a URL (`?aba=consorcios`) para o
 * "voltar" do detalhe da cota cair nela.
 */
export function DividasPainel({ abaInicial, contratos, cotas, etapas, centros, podeEditar }: DividasPainelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [aba, setAba] = React.useState<AbaDividas>(abaInicial);
  const [novoContrato, setNovoContrato] = React.useState(false);
  const [novaCota, setNovaCota] = React.useState(false);

  function trocarAba(valor: string) {
    const nova: AbaDividas = valor === "consorcios" ? "consorcios" : "contratos";
    setAba(nova);
    router.replace(nova === "consorcios" ? `${pathname}?aba=consorcios` : pathname, { scroll: false });
  }

  return (
    <>
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="contratos">Contratos ({contratos.length})</TabsTrigger>
          <TabsTrigger value="consorcios">Consórcios ({cotas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="contratos" className="mt-4 flex flex-col gap-3">
          {podeEditar ? (
            <div>
              <Button type="button" size="sm" onClick={() => setNovoContrato(true)}>
                <Plus />
                Novo contrato
              </Button>
            </div>
          ) : null}
          <DataTable
            idTabela="financeiro.dividas.contratos"
            columns={colunasContratos}
            data={contratos}
            onRowClick={(c) => router.push(`/financeiro/dividas/contratos/${c.contratoId}`)}
            emptyState={
              <EmptyState
                icone={Landmark}
                titulo="Nenhum contrato de dívida"
                descricao="Cadastre o contrato, ligue o lançamento das prestações e gere ou digite o cronograma."
              />
            }
          />
        </TabsContent>

        <TabsContent value="consorcios" className="mt-4 flex flex-col gap-3">
          {podeEditar ? (
            <div>
              <Button type="button" size="sm" onClick={() => setNovaCota(true)}>
                <Plus />
                Nova cota
              </Button>
            </div>
          ) : null}
          <DataTable
            idTabela="financeiro.dividas.consorcios"
            columns={colunasCotas}
            data={cotas}
            onRowClick={(c) => router.push(`/financeiro/dividas/consorcios/${c.cotaId}`)}
            emptyState={
              <EmptyState
                icone={Landmark}
                titulo="Nenhuma cota de consórcio"
                descricao="Cadastre a cota: o cronograma sai do crédito, do prazo e das taxas."
              />
            }
          />
        </TabsContent>
      </Tabs>

      <ContratoFormDrawer
        aberto={novoContrato}
        onAbertoChange={setNovoContrato}
        contrato={null}
        etapas={etapas}
        podeEditar={podeEditar}
        onSalvo={(id) => router.push(`/financeiro/dividas/contratos/${id}`)}
      />
      <CotaFormDrawer
        aberto={novaCota}
        onAbertoChange={setNovaCota}
        cota={null}
        centros={centros}
        podeEditar={podeEditar}
        onSalvo={(id) => router.push(`/financeiro/dividas/consorcios/${id}`)}
      />
    </>
  );
}
