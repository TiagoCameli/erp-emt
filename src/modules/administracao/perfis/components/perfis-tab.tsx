"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ShieldCheck } from "lucide-react";

import { DataTable, EmptyState, PageHeader } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type {
  PerfilResumo,
  PermissaoPerfil,
} from "@/modules/administracao/perfis/queries";
import { DetalhePerfilDrawer } from "./detalhe-perfil-drawer";
import { NovoPerfilDrawer } from "./novo-perfil-drawer";

export interface PerfisTabProps {
  perfis: PerfilResumo[];
  /** Permissões de cada perfil, indexadas por id do perfil. */
  permissoesPorPerfil: Record<string, PermissaoPerfil[]>;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

const colunas: ColumnDef<PerfilResumo, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nome}</span>
    ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    cell: ({ row }) => (
      <span className="block max-w-md truncate text-muted-foreground">
        {row.original.descricao ?? ""}
      </span>
    ),
  },
  {
    accessorKey: "totalPermissoes",
    header: "Permissões",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.totalPermissoes}</span>
    ),
  },
  {
    accessorKey: "totalUsuarios",
    header: "Usuários",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.totalUsuarios}</span>
    ),
  },
];

/** Conteúdo client da aba Perfis: listagem, criação e drawer de detalhe. */
export function PerfisTab({
  perfis,
  permissoesPorPerfil,
  podeCriar,
  podeEditar,
  podeExcluir,
}: PerfisTabProps) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);

  const perfilSelecionado =
    perfis.find((perfil) => perfil.id === idSelecionado) ?? null;

  return (
    <>
      <PageHeader
        titulo="Perfis"
        descricao="Conjuntos de permissões prontos para aplicar aos usuários"
        acoes={
          podeCriar ? (
            <Button type="button" onClick={() => setNovoAberto(true)}>
              <Plus />
              Novo perfil
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={colunas}
        data={perfis}
        searchKey="nome"
        searchPlaceholder="Buscar por nome"
        onRowClick={(perfil) => setIdSelecionado(perfil.id)}
        emptyState={
          <EmptyState
            icone={ShieldCheck}
            titulo="Nenhum perfil cadastrado"
            descricao="Crie perfis para padronizar as permissões dos usuários por função"
            acao={
              podeCriar ? (
                <Button type="button" onClick={() => setNovoAberto(true)}>
                  <Plus />
                  Novo perfil
                </Button>
              ) : undefined
            }
            className="border-none bg-transparent"
          />
        }
      />

      <NovoPerfilDrawer aberto={novoAberto} onAbertoChange={setNovoAberto} />

      {perfilSelecionado ? (
        <DetalhePerfilDrawer
          key={perfilSelecionado.id}
          perfil={perfilSelecionado}
          permissoesIniciais={permissoesPorPerfil[perfilSelecionado.id] ?? []}
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setIdSelecionado(null);
          }}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      ) : null}
    </>
  );
}
