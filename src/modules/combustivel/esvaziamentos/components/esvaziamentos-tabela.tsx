"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DropletOff, Trash2 } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { excluirEsvaziamento } from "@/modules/combustivel/esvaziamentos/actions";
import type { EsvaziamentoLinha } from "@/modules/combustivel/esvaziamentos/queries";

/** Colunas da lista. Exportadas para o teste desenhar célula por célula. */
export const colunas: ColumnDef<EsvaziamentoLinha, unknown>[] = [
  {
    accessorKey: "dataHora",
    header: "Data",
    size: 140,
    meta: { atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.dataHora)}</span>,
  },
  {
    accessorKey: "tanqueNome",
    header: "Tanque",
    size: 220,
    cell: ({ row }) => <span className="font-medium">{row.original.tanqueNome}</span>,
  },
  {
    accessorKey: "litros",
    header: "Litros",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span>,
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    size: 360,
    cell: ({ row }) => <span className="truncate">{row.original.motivo}</span>,
  },
  {
    accessorKey: "valorPerda",
    header: "Valor da perda",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorPerda} />,
  },
];

export interface EsvaziamentosTabelaProps {
  esvaziamentos: EsvaziamentoLinha[];
  /** Tanques da EMT (inclusive inativos), para o filtro. */
  tanquesFiltro: { id: string; nome: string }[];
  podeExcluir: boolean;
}

/** Esvaziamentos fora da lixeira. Sem edição: só exclusão com motivo. */
export function EsvaziamentosTabela({ esvaziamentos, tanquesFiltro, podeExcluir }: EsvaziamentosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [tanque, setTanque] = useFiltroSessao("tanque", "");
  const [excluindo, setExcluindo] = React.useState<EsvaziamentoLinha | null>(null);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return esvaziamentos.filter((e) => {
      if (tanque && e.tanqueId !== tanque) return false;
      if (!termo) return true;
      return e.tanqueNome.toLowerCase().includes(termo) || e.motivo.toLowerCase().includes(termo);
    });
  }, [esvaziamentos, busca, tanque]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluirEsvaziamento(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Esvaziamento excluído");
    setExcluindo(null);
  }

  return (
    <>
      <DataTable
        idTabela="combustivel.esvaziamentos"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Buscar por tanque ou motivo" />,
          },
          {
            id: "tanque",
            rotulo: "Tanque",
            temValor: tanque !== "",
            onLimpar: () => setTanque(""),
            elemento: (
              <FiltroSelect
                valor={tanque}
                onValorChange={setTanque}
                opcoes={tanquesFiltro.map((t) => ({ valor: t.id, rotulo: t.nome }))}
                placeholder="Tanque"
                todosRotulo="Todos os tanques"
              />
            ),
          },
        ]}
        acoesLinha={
          podeExcluir
            ? (esvaziamento) => (
                <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(esvaziamento)}>
                  <Trash2 />
                  Excluir esvaziamento
                </DropdownMenuItem>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={DropletOff}
            titulo={esvaziamentos.length === 0 ? "Nenhum esvaziamento registrado" : "Nenhum esvaziamento encontrado"}
            descricao={
              esvaziamentos.length === 0
                ? "Registre aqui o combustível descartado ou retirado de um tanque da EMT"
                : "Ajuste a busca ou o tanque"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir esvaziamento"
        descricao={
          excluindo
            ? `O esvaziamento de ${formatarLitros(excluindo.litros)} do tanque ${excluindo.tanqueNome} vai para a lixeira, e os litros voltam para o nível do tanque.`
            : ""
        }
        textoConfirmar="Excluir esvaziamento"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
