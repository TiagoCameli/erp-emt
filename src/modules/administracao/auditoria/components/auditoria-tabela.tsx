"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarDataHora } from "@/lib/formatadores";
import type {
  AcaoAuditoria,
  RegistroAuditoria,
  UsuarioParaFiltro,
} from "@/modules/administracao/auditoria/queries";
import { DiffAuditoria } from "./diff-auditoria";

const TAMANHO_PADRAO = 25;
const TAMANHO_TRUNCADO_REGISTRO = 8;

const CONFIG_ACAO: Record<AcaoAuditoria, { rotulo: string; status: string }> = {
  INSERT: { rotulo: "Criação", status: "aprovado" },
  UPDATE: { rotulo: "Edição", status: "pendente_aprovacao" },
  DELETE: { rotulo: "Exclusão", status: "rejeitado" },
};

export const OPCOES_ACAO_AUDITORIA = (
  Object.keys(CONFIG_ACAO) as AcaoAuditoria[]
).map((acao) => ({ valor: acao, rotulo: CONFIG_ACAO[acao].rotulo }));

function configDaAcao(acao: string): { rotulo: string; status: string } {
  if (acao in CONFIG_ACAO) return CONFIG_ACAO[acao as AcaoAuditoria];
  return { rotulo: acao, status: "rascunho" };
}

function BadgeAcao({ acao }: { acao: string }) {
  const config = configDaAcao(acao);
  return <StatusBadge status={config.status} rotulo={config.rotulo} />;
}

/** Rótulos amigáveis para os nomes de tabela do banco na auditoria. */
const ROTULO_TABELA: Record<string, string> = {
  usuarios: "Usuários",
  usuario_permissoes: "Permissões de usuário",
  perfis: "Perfis",
  perfil_permissoes: "Permissões de perfil",
  ordens_compra: "Ordens de compra",
  oc_itens: "Itens de OC",
  cotacoes: "Cotações",
  cotacao_fornecedores: "Fornecedores da cotação",
  cotacao_itens: "Itens da cotação",
  lancamentos: "Lançamentos",
  lancamento_parcelas: "Parcelas do lançamento",
  lancamento_rateios: "Rateios do lançamento",
  contas_bancarias: "Contas bancárias",
  categorias_financeiras: "Categorias financeiras",
  condicoes_pagamento: "Condições de pagamento",
  condicao_parcelas: "Parcelas da condição",
  fornecedores: "Fornecedores",
  clientes: "Clientes",
  obras: "Obras",
  insumos: "Insumos",
  centros_custo: "Centros de custo",
  colaboradores: "Colaboradores",
  funcoes: "Funções",
  jornadas: "Jornadas",
  rh_pontos: "Ponto",
  rh_apontamentos: "Apontamentos",
  rh_diarias: "Diárias",
  rh_adiantamentos: "Adiantamentos",
  rh_ferias: "Férias",
  rh_ocorrencias: "Ocorrências",
  rh_epis: "EPIs",
  rh_documentos: "Documentos de RH",
  rh_dependentes: "Dependentes",
  folhas: "Folhas",
  folha_itens: "Itens da folha",
  folha_encargos: "Encargos da folha",
  folha_item_encargos: "Encargos por colaborador",
  folha_inss_faixas: "Faixas de INSS",
  folha_irrf_faixas: "Faixas de IRRF",
  folha_parametros: "Parâmetros da folha",
  recebimentos: "Recebimentos",
  extratos_ofx: "Extratos OFX",
  extrato_transacoes: "Transações do extrato",
  unidades_medida: "Unidades de medida",
  categorias_insumo: "Categorias de insumo",
  configuracoes: "Configurações",
  banco_horas_movimentos: "Banco de horas",
  equipamentos: "Equipamentos",
  equipamento_documentos: "Documentos de equipamento",
  anexos: "Anexos",
  lixeira: "Lixeira",
};

function rotuloTabela(tabela: string): string {
  if (tabela in ROTULO_TABELA) return ROTULO_TABELA[tabela];
  const espacos = tabela.replace(/^rh_/, "").replace(/_/g, " ");
  return espacos.charAt(0).toUpperCase() + espacos.slice(1);
}

const colunas: ColumnDef<RegistroAuditoria, unknown>[] = [
  {
    accessorKey: "criadoEm",
    header: "Quando",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatarDataHora(row.original.criadoEm)}
      </span>
    ),
  },
  {
    accessorKey: "usuarioNome",
    header: "Usuário",
  },
  {
    accessorKey: "tabela",
    header: "Tabela",
    cell: ({ row }) => <span>{rotuloTabela(row.original.tabela)}</span>,
  },
  {
    accessorKey: "registroId",
    header: "Registro",
    cell: ({ row }) => {
      const registroId = row.original.registroId;
      if (!registroId) {
        return <span className="text-muted-foreground">-</span>;
      }
      const truncado =
        registroId.length > TAMANHO_TRUNCADO_REGISTRO
          ? `${registroId.slice(0, TAMANHO_TRUNCADO_REGISTRO)}…`
          : registroId;
      return (
        <span className="codigo-doc" title={registroId}>
          {truncado}
        </span>
      );
    },
  },
  {
    accessorKey: "acao",
    header: "Ação",
    cell: ({ row }) => <BadgeAcao acao={row.original.acao} />,
  },
];

export interface AuditoriaTabelaProps {
  registros: RegistroAuditoria[];
  total: number;
  /** Página atual, base 1 (mesma da URL). */
  pagina: number;
  tamanho: number;
  filtroTabela: string;
  filtroUsuario: string;
  filtroAcao: string;
  tabelas: string[];
  usuarios: UsuarioParaFiltro[];
  /** Nome resolvido (id -> nome) dos campos FK, pro diff exibir nome em vez de UUID. */
  nomes: Record<string, string>;
}

/**
 * Listagem da auditoria com filtros e paginação na URL.
 * A página é Server Component e relê os searchParams a cada mudança.
 */
export function AuditoriaTabela({
  registros,
  total,
  pagina,
  tamanho,
  filtroTabela,
  filtroUsuario,
  filtroAcao,
  tabelas,
  usuarios,
  nomes,
}: AuditoriaTabelaProps) {
  const { setMuitos: atualizarParams } = useFiltrosUrl();

  const [selecionado, setSelecionado] =
    React.useState<RegistroAuditoria | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroSelect
          valor={filtroTabela}
          onValorChange={(valor) =>
            atualizarParams({ tabela: valor, pagina: null })
          }
          opcoes={tabelas.map((tabela) => ({
            valor: tabela,
            rotulo: rotuloTabela(tabela),
          }))}
          todosRotulo="Todas as tabelas"
        />
        <FiltroSelect
          valor={filtroUsuario}
          onValorChange={(valor) =>
            atualizarParams({ usuario: valor, pagina: null })
          }
          opcoes={usuarios.map((usuario) => ({
            valor: usuario.id,
            rotulo: usuario.nome,
          }))}
          todosRotulo="Todos os usuários"
        />
        <FiltroSelect
          valor={filtroAcao}
          onValorChange={(valor) =>
            atualizarParams({ acao: valor, pagina: null })
          }
          opcoes={OPCOES_ACAO_AUDITORIA}
          todosRotulo="Todas as ações"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={registros}
        total={total}
        pageIndex={pagina - 1}
        pageSize={tamanho}
        onPaginationChange={(paginacao) =>
          atualizarParams({
            pagina:
              paginacao.pageIndex > 0 ? String(paginacao.pageIndex + 1) : null,
            tamanho:
              paginacao.pageSize !== TAMANHO_PADRAO
                ? String(paginacao.pageSize)
                : null,
          })
        }
        onRowClick={(registro) => setSelecionado(registro)}
        emptyState={
          <EmptyState
            icone={History}
            titulo="Nenhum registro de auditoria"
            descricao="Ajuste os filtros ou aguarde novas alterações no sistema."
            className="border-none bg-transparent"
          />
        }
      />

      <Dialog
        open={selecionado !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setSelecionado(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          {selecionado ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Detalhe da alteração
                  <BadgeAcao acao={selecionado.acao} />
                </DialogTitle>
                <DialogDescription>
                  Valores antes e depois da alteração registrada na auditoria.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-detalhe sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Quando: </span>
                  <span className="tabular-nums">
                    {formatarDataHora(selecionado.criadoEm)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuário: </span>
                  {selecionado.usuarioNome}
                </div>
                <div>
                  <span className="text-muted-foreground">Tabela: </span>
                  <span>{rotuloTabela(selecionado.tabela)}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">Registro: </span>
                  {selecionado.registroId ? (
                    <span className="codigo-doc break-all">
                      {selecionado.registroId}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                <DiffAuditoria
                  dadosAntes={selecionado.dadosAntes}
                  dadosDepois={selecionado.dadosDepois}
                  nomes={nomes}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
