"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";

import { DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/formatadores";
import type { PerfilOpcao, UsuarioLista } from "@/modules/administracao/usuarios/queries";
import { DetalheUsuarioDrawer } from "./detalhe-usuario-drawer";

const colunas: ColumnDef<UsuarioLista, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nome}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "perfilNome",
    header: "Perfil",
    cell: ({ row }) =>
      row.original.perfilNome ? (
        <Badge variant="outline">{row.original.perfilNome}</Badge>
      ) : (
        <span className="text-muted-foreground">Sem perfil</span>
      ),
  },
  {
    accessorKey: "ativo",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {row.original.ativo ? (
          <StatusBadge status="aprovado" rotulo="Ativo" />
        ) : (
          <StatusBadge status="rascunho" rotulo="Inativo" />
        )}
        {row.original.acessoPendente ? (
          <StatusBadge status="pendente_aprovacao" rotulo="1º acesso pendente" />
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "criadoEm",
    header: "Criado em",
    // Secundária: data de cadastro só interessa em auditoria de acesso.
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.criadoEm)}</span>
    ),
  },
];

export interface UsuariosTabelaProps {
  usuarios: UsuarioLista[];
  perfis: PerfilOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
  usuarioLogadoId: string;
}

/**
 * Listagem de usuários. Clicar numa linha abre o drawer de detalhe
 * com edição, aplicação de perfil e a matriz de permissões.
 */
export function UsuariosTabela({
  usuarios,
  perfis,
  podeEditar,
  podeExcluir,
  usuarioLogadoId,
}: UsuariosTabelaProps) {
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = React.useState(false);

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const usuarioSelecionado =
    usuarios.find((usuario) => usuario.id === selecionadoId) ?? null;

  function abrirDetalhe(usuario: UsuarioLista) {
    setSelecionadoId(usuario.id);
    setDetalheAberto(true);
  }

  return (
    <>
      <DataTable
        idTabela="administracao.usuarios"
        columns={colunas}
        data={usuarios}
        searchKey="nome"
        searchPlaceholder="Buscar por nome"
        onRowClick={abrirDetalhe}
        emptyState={
          <EmptyState
            icone={Users}
            titulo="Nenhum usuário cadastrado"
            descricao="Convide o primeiro usuário para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <DetalheUsuarioDrawer
        key={usuarioSelecionado?.id ?? "nenhum"}
        usuario={usuarioSelecionado}
        aberto={detalheAberto}
        onAbertoChange={setDetalheAberto}
        perfis={perfis}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        usuarioLogadoId={usuarioLogadoId}
      />
    </>
  );
}
