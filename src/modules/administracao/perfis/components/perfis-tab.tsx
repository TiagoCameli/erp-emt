"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ShieldCheck } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  PageHeader,
} from "@/components/canonicos";
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

const OPCOES_USUARIOS = [
  { valor: "com", rotulo: "Com usuários" },
  { valor: "sem", rotulo: "Sem usuários" },
];

const OPCOES_PERMISSOES = [
  { valor: "com", rotulo: "Com permissões" },
  { valor: "sem", rotulo: "Sem permissões" },
];

/**
 * Conteúdo client da aba Perfis: listagem, criação e drawer de detalhe.
 *
 * Filtros em memória: a tela carrega todos os perfis (meia dúzia, sem paginação
 * server-side), então o total exibido é o total real.
 */
export function PerfisTab({
  perfis,
  permissoesPorPerfil,
  podeCriar,
  podeEditar,
  podeExcluir,
}: PerfisTabProps) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [comUsuarios, setComUsuarios] = useState("");
  const [comPermissoes, setComPermissoes] = useState("");

  const perfilSelecionado =
    perfis.find((perfil) => perfil.id === idSelecionado) ?? null;

  const dados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return perfis.filter((perfil) => {
      if (comUsuarios === "com" && perfil.totalUsuarios === 0) return false;
      if (comUsuarios === "sem" && perfil.totalUsuarios > 0) return false;
      if (comPermissoes === "com" && perfil.totalPermissoes === 0) return false;
      if (comPermissoes === "sem" && perfil.totalPermissoes > 0) return false;
      if (termo) {
        const alvo = `${perfil.nome} ${perfil.descricao ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [perfis, busca, comUsuarios, comPermissoes]);

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
        idTabela="administracao.perfis"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome ou descrição",
            // A busca é a porta de entrada da tela: não pode ser escondida.
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome ou descrição"
              />
            ),
          },
          {
            id: "usuarios",
            rotulo: "Usuários vinculados",
            ocultoPorPadrao: true,
            temValor: comUsuarios !== "",
            onLimpar: () => setComUsuarios(""),
            elemento: (
              <FiltroSelect
                valor={comUsuarios}
                onValorChange={setComUsuarios}
                opcoes={OPCOES_USUARIOS}
                placeholder="Usuários"
                todosRotulo="Com ou sem usuários"
                className="max-w-56"
              />
            ),
          },
          {
            id: "permissoes",
            rotulo: "Permissões",
            ocultoPorPadrao: true,
            temValor: comPermissoes !== "",
            onLimpar: () => setComPermissoes(""),
            elemento: (
              <FiltroSelect
                valor={comPermissoes}
                onValorChange={setComPermissoes}
                opcoes={OPCOES_PERMISSOES}
                placeholder="Permissões"
                todosRotulo="Com ou sem permissões"
                className="max-w-56"
              />
            ),
          },
        ]}
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
