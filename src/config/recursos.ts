/**
 * Catálogo tipado de recursos do sistema.
 * Recurso = aba de módulo. É a unidade de permissão.
 *
 * Este catálogo cresce a cada fase do roadmap. O banco guarda
 * recurso e ação como texto; este arquivo é a fonte de verdade
 * do que existe e mantém o TypeScript honesto.
 */

export const ACOES = [
  "ver",
  "criar",
  "editar",
  "excluir",
  "aprovar",
  "desaprovar",
] as const;

export type Acao = (typeof ACOES)[number];

export interface RecursoDef {
  /** Identificador estável: modulo.aba */
  id: string;
  /** Nome da aba exibido na UI */
  nome: string;
  /** Módulo a que pertence */
  modulo: string;
  /** Rota da aba no app */
  rota: string;
  /** Ações que existem nesta aba */
  acoes: readonly Acao[];
}

/** Módulos na ordem de exibição da sidebar */
export const MODULOS = [
  { id: "cadastros", nome: "Cadastros", rota: "/cadastros" },
  { id: "compras", nome: "Compras", rota: "/compras" },
  { id: "administracao", nome: "Administração", rota: "/administracao" },
] as const;

export type ModuloId = (typeof MODULOS)[number]["id"];

const CRUD = ["ver", "criar", "editar", "excluir"] as const;
const CRUD_APROVA = [
  "ver",
  "criar",
  "editar",
  "excluir",
  "aprovar",
  "desaprovar",
] as const;

export const RECURSOS = [
  // Cadastros
  {
    id: "cadastros.obras",
    nome: "Obras",
    modulo: "cadastros",
    rota: "/cadastros/obras",
    acoes: CRUD,
  },
  {
    id: "cadastros.centros-custo",
    nome: "Centros de custo",
    modulo: "cadastros",
    rota: "/cadastros/centros-custo",
    acoes: CRUD,
  },
  {
    id: "cadastros.clientes",
    nome: "Clientes",
    modulo: "cadastros",
    rota: "/cadastros/clientes",
    acoes: CRUD,
  },
  {
    id: "cadastros.fornecedores",
    nome: "Fornecedores",
    modulo: "cadastros",
    rota: "/cadastros/fornecedores",
    acoes: CRUD,
  },
  {
    id: "cadastros.insumos",
    nome: "Insumos",
    modulo: "cadastros",
    rota: "/cadastros/insumos",
    acoes: CRUD,
  },
  {
    id: "cadastros.equipamentos",
    nome: "Equipamentos",
    modulo: "cadastros",
    rota: "/cadastros/equipamentos",
    acoes: CRUD,
  },
  {
    id: "cadastros.depositos",
    nome: "Depósitos e tanques",
    modulo: "cadastros",
    rota: "/cadastros/depositos",
    acoes: CRUD,
  },
  {
    id: "cadastros.colaboradores",
    nome: "Colaboradores",
    modulo: "cadastros",
    rota: "/cadastros/colaboradores",
    acoes: CRUD,
  },
  {
    id: "cadastros.unidades",
    nome: "Unidades de medida",
    modulo: "cadastros",
    rota: "/cadastros/unidades",
    acoes: CRUD,
  },
  {
    id: "cadastros.categorias",
    nome: "Categorias",
    modulo: "cadastros",
    rota: "/cadastros/categorias",
    acoes: CRUD,
  },
  // Compras
  {
    id: "compras.pedidos",
    nome: "Pedidos",
    modulo: "compras",
    rota: "/compras/pedidos",
    acoes: CRUD_APROVA,
  },
  {
    id: "compras.cotacoes",
    nome: "Cotações",
    modulo: "compras",
    rota: "/compras/cotacoes",
    acoes: CRUD,
  },
  {
    id: "compras.ordens",
    nome: "Ordens de compra",
    modulo: "compras",
    rota: "/compras/ordens",
    acoes: CRUD_APROVA,
  },
  {
    id: "compras.recebimentos",
    nome: "Recebimentos",
    modulo: "compras",
    rota: "/compras/recebimentos",
    acoes: CRUD,
  },
  {
    id: "compras.painel",
    nome: "Painel de compras",
    modulo: "compras",
    rota: "/compras/painel",
    acoes: ["ver"],
  },
  // Administração
  {
    id: "administracao.usuarios",
    nome: "Usuários e permissões",
    modulo: "administracao",
    rota: "/administracao/usuarios",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "administracao.perfis",
    nome: "Perfis",
    modulo: "administracao",
    rota: "/administracao/perfis",
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  {
    id: "administracao.auditoria",
    nome: "Auditoria",
    modulo: "administracao",
    rota: "/administracao/auditoria",
    acoes: ["ver"],
  },
  {
    id: "administracao.lixeira",
    nome: "Lixeira",
    modulo: "administracao",
    rota: "/administracao/lixeira",
    acoes: ["ver", "editar"],
  },
  {
    id: "administracao.configuracoes",
    nome: "Configurações",
    modulo: "administracao",
    rota: "/administracao/configuracoes",
    acoes: ["ver", "editar"],
  },
] as const satisfies readonly RecursoDef[];

export type RecursoId = (typeof RECURSOS)[number]["id"];

export function recursosDoModulo(modulo: ModuloId): readonly RecursoDef[] {
  return RECURSOS.filter((r) => r.modulo === modulo);
}

export function recursoPorId(id: RecursoId): RecursoDef {
  const recurso = RECURSOS.find((r) => r.id === id);
  if (!recurso) throw new Error(`Recurso desconhecido: ${id}`);
  return recurso;
}
