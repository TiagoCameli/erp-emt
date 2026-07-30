"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/formatadores";
import type { PerfilOpcao, UsuarioLista } from "@/modules/administracao/usuarios/queries";
import { DetalheUsuarioDrawer } from "./detalhe-usuario-drawer";

/** Valor do filtro de perfil para "quem ainda não tem perfil aplicado". */
const SEM_PERFIL = "sem-perfil";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const OPCOES_ACESSO = [
  { valor: "pendente", rotulo: "1º acesso pendente" },
  { valor: "concluido", rotulo: "1º acesso feito" },
];

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
 *
 * Filtros em memória: a tela carrega todos os usuários (20 a 30 na EMT, sem
 * paginação server-side), então o total exibido é o total real. A busca virou
 * um filtro configurável (fixo) para entrar no menu "Filtros" junto dos outros.
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

  const [busca, setBusca] = React.useState("");
  const [perfilId, setPerfilId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [acesso, setAcesso] = React.useState("");
  const [criadoDe, setCriadoDe] = React.useState("");
  const [criadoAte, setCriadoAte] = React.useState("");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const usuarioSelecionado =
    usuarios.find((usuario) => usuario.id === selecionadoId) ?? null;

  function abrirDetalhe(usuario: UsuarioLista) {
    setSelecionadoId(usuario.id);
    setDetalheAberto(true);
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((usuario) => {
      if (perfilId === SEM_PERFIL && usuario.perfilId !== null) return false;
      if (
        perfilId !== "" &&
        perfilId !== SEM_PERFIL &&
        usuario.perfilId !== perfilId
      ) {
        return false;
      }
      if (status === "ativos" && !usuario.ativo) return false;
      if (status === "inativos" && usuario.ativo) return false;
      if (acesso === "pendente" && !usuario.acessoPendente) return false;
      if (acesso === "concluido" && usuario.acessoPendente) return false;
      // criadoEm é timestamptz em ISO: o prefixo yyyy-MM-dd compara direto com
      // as pontas do filtro de período.
      const criadoDia = usuario.criadoEm.slice(0, 10);
      if (criadoDe !== "" && criadoDia < criadoDe) return false;
      if (criadoAte !== "" && criadoDia > criadoAte) return false;
      if (termo) {
        const alvo = `${usuario.nome} ${usuario.email}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [usuarios, busca, perfilId, status, acesso, criadoDe, criadoAte]);

  return (
    <>
      <DataTable
        idTabela="administracao.usuarios"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome ou email",
            // A busca é a porta de entrada da tela: não pode ser escondida.
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome ou email"
              />
            ),
          },
          {
            id: "perfil",
            rotulo: "Perfil",
            ocultoPorPadrao: true,
            temValor: perfilId !== "",
            onLimpar: () => setPerfilId(""),
            elemento: (
              <FiltroSelect
                valor={perfilId}
                onValorChange={setPerfilId}
                opcoes={[
                  ...perfis.map((perfil) => ({
                    valor: perfil.id,
                    rotulo: perfil.nome,
                  })),
                  { valor: SEM_PERFIL, rotulo: "Sem perfil" },
                ]}
                placeholder="Perfil"
                todosRotulo="Todos os perfis"
                className="max-w-56"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            ocultoPorPadrao: true,
            temValor: status !== "",
            onLimpar: () => setStatus(""),
            elemento: (
              <FiltroSelect
                valor={status}
                onValorChange={setStatus}
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Ativos e inativos"
              />
            ),
          },
          {
            id: "acesso",
            rotulo: "Primeiro acesso",
            ocultoPorPadrao: true,
            temValor: acesso !== "",
            onLimpar: () => setAcesso(""),
            elemento: (
              <FiltroSelect
                valor={acesso}
                onValorChange={setAcesso}
                opcoes={OPCOES_ACESSO}
                placeholder="Primeiro acesso"
                todosRotulo="Qualquer situação de acesso"
                className="max-w-56"
              />
            ),
          },
          {
            id: "criado",
            rotulo: "Período de criação",
            ocultoPorPadrao: true,
            temValor: criadoDe !== "" || criadoAte !== "",
            onLimpar: () => {
              setCriadoDe("");
              setCriadoAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={criadoDe}
                ate={criadoAte}
                rotulo="Criado em"
                onPeriodoChange={(de, ate) => {
                  setCriadoDe(de);
                  setCriadoAte(ate);
                }}
              />
            ),
          },
        ]}
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
