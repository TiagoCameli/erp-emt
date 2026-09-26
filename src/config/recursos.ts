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

/**
 * Módulos na ordem de exibição da sidebar. Frete, Combustível e Manutenção ficam
 * entre RH e Administração (pedido do Tiago em 24/09/2026). Medição de Contratos
 * fica depois da Manutenção (25/09/2026).
 */
export const MODULOS = [
  { id: "gestao", nome: "Gestão", rota: "/gestao" },
  { id: "cadastros", nome: "Cadastros", rota: "/cadastros" },
  { id: "compras", nome: "Compras", rota: "/compras" },
  { id: "financeiro", nome: "Financeiro", rota: "/financeiro" },
  { id: "rh", nome: "RH", rota: "/rh" },
  { id: "frete", nome: "Frete", rota: "/frete" },
  { id: "combustivel", nome: "Combustível", rota: "/combustivel" },
  { id: "manutencao", nome: "Manutenção", rota: "/manutencao" },
  { id: "medicao", nome: "Medição", rota: "/medicao" },
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
  // Gestão
  {
    id: "gestao.painel",
    nome: "Painel",
    modulo: "gestao",
    rota: "/gestao",
    acoes: ["ver"],
  },
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
    // Origem e destino do frete (pedreira, usina, canteiro). Entrou na Fase 1 da
    // migração do Gestão Obras (22/09/2026), antes do módulo Frete, porque é
    // cadastro compartilhado: o Frete lê daqui e não mantém lista própria.
    id: "cadastros.localidades",
    nome: "Localidades",
    modulo: "cadastros",
    rota: "/cadastros/localidades",
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
  /**
   * Duas abas de categoria vivem aqui, e são cadastros de coisas diferentes: uma
   * classifica INSUMO (Material, Mão de obra, Equipamentos, Outros e as
   * subcategorias), a outra é o PLANO DE CONTAS de receitas e despesas, que veio
   * do Financeiro em 20/08/2026 a pedido do Tiago.
   *
   * Por isso as duas ganharam sobrenome no menu: "Categorias" sozinho, com as
   * duas lado a lado, não diz qual é qual — e escolher a errada classifica um
   * custo no lugar errado do relatório.
   */
  {
    id: "cadastros.categorias",
    nome: "Categorias de insumo",
    modulo: "cadastros",
    rota: "/cadastros/categorias",
    acoes: CRUD,
  },
  {
    id: "cadastros.categorias-financeiras",
    nome: "Categorias financeiras",
    modulo: "cadastros",
    rota: "/cadastros/categorias-financeiras",
    acoes: CRUD,
  },
  {
    id: "cadastros.funcoes",
    nome: "Funções",
    modulo: "cadastros",
    rota: "/cadastros/funcoes",
    acoes: CRUD,
  },
  {
    id: "cadastros.jornadas",
    nome: "Jornadas",
    modulo: "cadastros",
    rota: "/cadastros/jornadas",
    acoes: CRUD,
  },
  {
    id: "cadastros.condicoes-pagamento",
    nome: "Condições de pagamento",
    modulo: "cadastros",
    rota: "/cadastros/condicoes-pagamento",
    acoes: CRUD,
  },
  {
    id: "cadastros.formas-pagamento",
    nome: "Formas de pagamento",
    modulo: "cadastros",
    rota: "/cadastros/formas-pagamento",
    // Sem 'excluir': forma usada em OC e lançamento não sai do catálogo, ela
    // é desativada (o histórico continua apontando para ela).
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "cadastros.cartoes",
    nome: "Cartões de crédito",
    modulo: "cadastros",
    rota: "/cadastros/cartoes",
    // Logo depois de Formas de pagamento porque é onde se procura: o cartão é
    // atributo do pagamento em cartão, não uma forma de pagar diferente.
    // Sem 'excluir', pela mesma razão da forma: documento aponta para o cartão,
    // e apagar deixaria o histórico apontando para nada. Desativar basta.
    acoes: ["ver", "criar", "editar"],
  },
  // Compras
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
  // Frete (Fase 4 da migração do Gestão Obras, plano seção 4.1). Não gera lançamento,
  // parcela nem rateio: frete, pagamento e ajuste mexem só na conta corrente da
  // transportadora. O pagamento lançado no Financeiro é manual (decisão f do plano).
  {
    // Configurar os cards pede também frete.pagamentos/criar (regra de tela do plano).
    id: "frete.painel",
    nome: "Painel",
    modulo: "frete",
    rota: "/frete",
    acoes: ["ver"],
  },
  {
    id: "frete.fretes",
    nome: "Fretes",
    modulo: "frete",
    rota: "/frete/fretes",
    acoes: CRUD,
  },
  {
    // Pedido na pedreira: base do saldo na pedreira.
    id: "frete.pedidos-material",
    nome: "Pedidos de material",
    modulo: "frete",
    rota: "/frete/pedidos-material",
    acoes: CRUD,
  },
  {
    // Extrato por transportadora, só leitura: nasce dos fretes, pagamentos, ajustes e abastecimentos.
    id: "frete.conta-corrente",
    nome: "Conta corrente",
    modulo: "frete",
    rota: "/frete/conta-corrente",
    acoes: ["ver"],
  },
  {
    id: "frete.pagamentos",
    nome: "Pagamentos de frete",
    modulo: "frete",
    rota: "/frete/pagamentos",
    acoes: CRUD,
  },
  {
    // O ajuste só mexe no saldo depois de aprovado (decisão do Tiago, 24/09). Sem editar:
    // o pendente se corrige com 'criar'; o aprovado se desaprova.
    id: "frete.ajustes",
    nome: "Ajustes de saldo",
    modulo: "frete",
    rota: "/frete/ajustes",
    acoes: ["ver", "criar", "aprovar", "desaprovar"],
  },
  {
    // "editar" = marcar como conferida.
    id: "frete.anomalias",
    nome: "Anomalias",
    modulo: "frete",
    rota: "/frete/anomalias",
    acoes: ["ver", "editar"],
  },
  // Combustível (Fase 3 da migração do Gestão Obras, plano seção 4.1). Não gera
  // lançamento, parcela nem rateio: o abastecimento de carreta vira débito na conta
  // corrente da transportadora (Frete), nunca no Financeiro.
  {
    id: "combustivel.painel",
    nome: "Visão geral",
    modulo: "combustivel",
    rota: "/combustivel",
    acoes: ["ver"],
  },
  {
    id: "combustivel.tanques",
    nome: "Tanques",
    modulo: "combustivel",
    rota: "/combustivel/tanques",
    acoes: CRUD,
  },
  {
    id: "combustivel.entradas",
    nome: "Entradas",
    modulo: "combustivel",
    rota: "/combustivel/entradas",
    acoes: CRUD,
  },
  {
    // Equipamento próprio e carreta de transportadora. É também a tela do celular.
    id: "combustivel.saidas",
    nome: "Abastecimentos",
    modulo: "combustivel",
    rota: "/combustivel/abastecimentos",
    acoes: CRUD,
  },
  {
    id: "combustivel.transferencias",
    nome: "Transferências",
    modulo: "combustivel",
    rota: "/combustivel/transferencias",
    acoes: CRUD,
  },
  {
    // Perda com valor: ação separada de propósito, sem editar.
    id: "combustivel.esvaziamentos",
    nome: "Esvaziamentos",
    modulo: "combustivel",
    rota: "/combustivel/esvaziamentos",
    acoes: ["ver", "criar", "excluir"],
  },
  {
    // "editar" = marcar como conferida. Inclui as saídas sem suprimento.
    id: "combustivel.anomalias",
    nome: "Anomalias",
    modulo: "combustivel",
    rota: "/combustivel/anomalias",
    acoes: ["ver", "editar"],
  },
  {
    id: "combustivel.relatorios",
    nome: "Relatórios",
    modulo: "combustivel",
    rota: "/combustivel/relatorios",
    acoes: ["ver"],
  },
  // Manutenção (Fase 2 da migração do Gestão Obras, plano seção 4.1). Não gera
  // lançamento, parcela nem rateio: diz para onde foi a peça, o óleo e o serviço.
  {
    id: "manutencao.painel",
    nome: "Painel",
    modulo: "manutencao",
    rota: "/manutencao",
    acoes: ["ver"],
  },
  {
    // A OS. Peça, óleo e terceiro são linhas da OS, cobertas por "editar".
    id: "manutencao.servicos",
    nome: "Caderno de serviços",
    modulo: "manutencao",
    rota: "/manutencao/servicos",
    acoes: CRUD,
  },
  {
    id: "manutencao.almoxarifado",
    nome: "Almoxarifado de peças",
    modulo: "manutencao",
    rota: "/manutencao/almoxarifado",
    acoes: CRUD,
  },
  {
    // Horímetro e km. É também a tela do celular, com fila offline.
    id: "manutencao.medicoes",
    nome: "Horímetro e km",
    modulo: "manutencao",
    rota: "/manutencao/medicoes",
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "manutencao.tipos-oleo",
    nome: "Tipos de óleo",
    modulo: "manutencao",
    rota: "/manutencao/tipos-oleo",
    acoes: CRUD,
  },
  // Financeiro
  {
    id: "financeiro.lancamentos",
    nome: "Lançamentos",
    modulo: "financeiro",
    rota: "/financeiro/lancamentos",
    acoes: CRUD,
  },
  {
    id: "financeiro.aprovacao-pagamentos",
    nome: "Aprovação de pagamentos",
    modulo: "financeiro",
    rota: "/financeiro/aprovacao-pagamentos",
    acoes: ["ver", "aprovar", "desaprovar"],
  },
  {
    id: "financeiro.pagamentos",
    nome: "Pagamentos",
    modulo: "financeiro",
    rota: "/financeiro/pagamentos",
    acoes: ["ver", "criar", "excluir"],
  },
  /**
   * Recebimentos vem logo depois de Pagamentos porque é o par dele: o dinheiro
   * que sai e o dinheiro que entra, lidos na mesma sequência. A ordem desta
   * lista É a ordem do submenu da sidebar (`abasVisiveis` só filtra por
   * permissão, não reordena), então mover o item aqui é o que move a aba na tela.
   */
  {
    id: "financeiro.recebimentos",
    nome: "Recebimentos",
    modulo: "financeiro",
    rota: "/financeiro/recebimentos",
    // `editar` da a baixa ("dar como recebido"), `excluir` a desfaz (estorno),
    // na mesma divisao que Pagamentos usa. Sao acoes separadas de proposito:
    // quem lanca o recebimento do dia nao precisa poder desfazer o de ontem.
    acoes: ["ver", "criar", "editar", "excluir"],
  },
  /**
   * Transferencia entre contas vem logo depois de Recebimentos porque fecha o
   * trio do dinheiro: o que sai, o que entra e o que so muda de conta. Nao ha
   * acao de aprovar: por decisao do Tiago em 20/08/2026 a transferencia e
   * registro direto (movimentacao entre contas da propria empresa).
   */
  {
    id: "financeiro.transferencias",
    nome: "Transferências",
    modulo: "financeiro",
    rota: "/financeiro/transferencias",
    acoes: CRUD,
  },
  {
    id: "financeiro.competencias",
    nome: "Fechamento de competência",
    modulo: "financeiro",
    rota: "/financeiro/competencias",
    // 'aprovar' = fechar o mês, 'desaprovar' = reabrir (e é a permissão que
    // libera lançar dentro de mês fechado, com registro na auditoria).
    acoes: ["ver", "aprovar", "desaprovar"],
  },
  {
    id: "financeiro.programados",
    nome: "Programados",
    modulo: "financeiro",
    rota: "/financeiro/programados",
    acoes: ["ver", "editar"],
  },
  {
    id: "financeiro.contas-bancarias",
    nome: "Contas bancárias",
    modulo: "financeiro",
    rota: "/financeiro/contas-bancarias",
    acoes: CRUD,
  },
  /**
   * Aplicações financeiras (CDB, fundo): posição do extrato, rendimento e
   * rentabilidade. "editar" grava e exclui posição e mexe no cadastro da
   * aplicação. Aplicar e resgatar continuam sendo transferência, com a
   * permissão de Transferências.
   */
  {
    id: "financeiro.aplicacoes",
    nome: "Aplicações",
    modulo: "financeiro",
    rota: "/financeiro/aplicacoes",
    acoes: ["ver", "editar"],
  },
  {
    id: "financeiro.conciliacao",
    nome: "Conciliação",
    modulo: "financeiro",
    rota: "/financeiro/conciliacao",
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "financeiro.relatorios",
    nome: "Relatórios",
    modulo: "financeiro",
    rota: "/financeiro/relatorios",
    acoes: ["ver"],
  },
  // RH
  {
    id: "rh.alertas",
    nome: "Alertas",
    modulo: "rh",
    rota: "/rh/alertas",
    acoes: ["ver"],
  },
  {
    id: "rh.apontamentos",
    nome: "Ponto e apontamentos",
    modulo: "rh",
    rota: "/rh/apontamentos",
    acoes: ["ver", "criar", "editar", "aprovar"],
  },
  {
    id: "rh.adiantamentos",
    nome: "Adiantamentos",
    modulo: "rh",
    rota: "/rh/adiantamentos",
    acoes: CRUD,
  },
  {
    id: "rh.diaristas",
    nome: "Diaristas",
    modulo: "rh",
    rota: "/rh/diaristas",
    acoes: ["ver", "criar", "editar"],
  },
  {
    id: "rh.folha",
    nome: "Folha gerencial",
    modulo: "rh",
    rota: "/rh/folha",
    acoes: ["ver", "criar", "editar", "aprovar", "desaprovar"],
  },
  {
    id: "rh.rescisoes",
    nome: "Rescisões",
    modulo: "rh",
    rota: "/rh/rescisoes",
    acoes: ["ver", "criar", "editar", "excluir", "aprovar", "desaprovar"],
  },
  {
    id: "rh.encargos",
    nome: "Encargos da folha",
    modulo: "rh",
    rota: "/rh/encargos",
    acoes: CRUD,
  },
  {
    id: "rh.parametros-folha",
    nome: "Parâmetros da folha",
    modulo: "rh",
    rota: "/rh/parametros-folha",
    acoes: CRUD,
  },
  {
    id: "rh.decimo-terceiro-ferias",
    nome: "13º e Férias",
    modulo: "rh",
    rota: "/rh/decimo-terceiro-e-ferias",
    acoes: CRUD_APROVA,
  },
  {
    id: "rh.ocorrencias",
    nome: "Ausências e ocorrências",
    modulo: "rh",
    rota: "/rh/ocorrencias",
    acoes: CRUD,
  },
  {
    id: "rh.epis",
    nome: "EPI",
    modulo: "rh",
    rota: "/rh/epis",
    acoes: CRUD,
  },
  {
    id: "rh.documentos",
    nome: "Documentos e ASO",
    modulo: "rh",
    rota: "/rh/documentos",
    acoes: CRUD,
  },
  {
    id: "rh.banco-horas",
    nome: "Banco de horas",
    modulo: "rh",
    rota: "/rh/banco-horas",
    acoes: ["ver", "criar", "editar"],
  },
  // Medição de Contratos (spec 2026-09-25). As outras abas entram nas fases delas, cada uma com o
  // seu backfill: registrar aba sem tela deixaria link morto no menu.
  {
    id: "medicao.contratos",
    nome: "Contratos",
    modulo: "medicao",
    rota: "/medicao/contratos",
    acoes: CRUD,
  },
  {
    id: "medicao.planilha",
    nome: "Planilha contratual",
    modulo: "medicao",
    rota: "/medicao/planilha",
    acoes: ["ver", "criar", "excluir", "aprovar", "desaprovar"],
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
