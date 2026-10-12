"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Hammer, Pencil, Plus } from "lucide-react";

import { DataTable, EmptyState, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { ServicoDrawer } from "@/modules/execucao/modelos/components/servico-drawer";
import type { Servico } from "@/modules/execucao/modelos/queries";

const colunas: ColumnDef<Servico, unknown>[] = [
  { accessorKey: "codigo", header: "Código", size: 120, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
  { accessorKey: "nome", header: "Nome", size: 280 },
  { id: "unidade", header: "Unidade", size: 100, cell: ({ row }) => row.original.unidadeSigla ?? "" },
  {
    id: "produtividade",
    header: "Produtividade padrão",
    size: 170,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (row.original.produtividadePadrao === null ? "" : formatarQuantidade(row.original.produtividadePadrao)),
  },
  { id: "ceu", header: "Céu aberto", size: 110, meta: { atomico: true }, cell: ({ row }) => (row.original.ceuAberto ? "Sim" : "Não") },
  {
    id: "situacao",
    header: "Situação",
    size: 110,
    meta: { atomico: true },
    cell: ({ row }) => (row.original.ativo ? "Ativo" : <span className="text-muted-foreground">Inativo</span>),
  },
];

export interface ServicosTabelaProps {
  servicos: Servico[];
  unidades: { id: string; sigla: string; nome: string }[];
  podeCriar: boolean;
  podeEditar: boolean;
}

export function ServicosTabela({ servicos, unidades, podeCriar, podeEditar }: ServicosTabelaProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Servico | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setAberto(true);
  }

  const botaoNovo = podeCriar ? (
    <Button type="button" size="sm" variant="outline" onClick={abrirNovo}>
      <Plus />
      Novo serviço
    </Button>
  ) : undefined;

  return (
    <SecaoDetalhe titulo="Serviços" acao={botaoNovo}>
      <DataTable<Servico>
        idTabela="execucao.modelos.servicos"
        columns={colunas}
        data={servicos}
        idDaLinha={(s) => s.id}
        searchKey="nome"
        searchPlaceholder="Buscar serviço"
        acoesLinha={
          podeEditar
            ? (s) => (
                <DropdownMenuItem
                  onSelect={() => {
                    setEmEdicao(s);
                    setAberto(true);
                  }}
                >
                  <Pencil />
                  Editar
                </DropdownMenuItem>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={Hammer}
            titulo="Nenhum serviço na biblioteca"
            descricao="Cadastre os serviços que as atividades dos cronogramas vão usar"
            acao={botaoNovo}
            className="border-none bg-transparent"
          />
        }
      />
      <ServicoDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        unidades={unidades}
        servico={emEdicao}
        onSalvo={() => semDerrubarSucesso("execucao.modelos.servico.refresh", () => router.refresh())}
      />
    </SecaoDetalhe>
  );
}
