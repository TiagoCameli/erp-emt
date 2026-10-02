/**
 * Formato da tela de Medições (Fase 4, Task 4): lista do contrato e sugestão da próxima.
 */

/**
 * Uma linha da lista de medições do contrato, montada em `queries.ts` a partir de `mc_medicoes`
 * (tabela), `mc_v_medicao_totais.valor` (D7: só EXIBIDO, nunca somado nem arredondado aqui — por
 * isso chega como TEXTO) e a contagem de `mc_lancamentos` não excluídos.
 */
export interface MedicaoLista {
  id: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  /** Texto do numeric; nulo é contrato ainda sem regra de arredondamento (spec 6.2). */
  valor: string | null;
  /** Lançamentos não excluídos desta medição. */
  lancamentos: number;
}

/**
 * jsonb de `fn_mc_medicao_sugestao`, passado como veio do banco (mesmo padrão de `MedicaoBoletim`
 * em boletim/tipos.ts): os nomes dos campos são os da RPC.
 */
export interface SugestaoMedicao {
  numero: number;
  /** Nulos quando o contrato informa o período à mão (`periodo_manual`): o banco não sugere datas. */
  periodo_inicio: string | null;
  periodo_fim: string | null;
  /** Contrato em que o período é digitado a cada medição. */
  periodo_manual: boolean;
  /** Nulo quando o contrato ainda não tem planilha vigente (a abertura vai recusar). */
  versao_numero: number | null;
  /** Fim da medição anterior; nulo na primeira medição do contrato. */
  depois_de: string | null;
}

/** Uma revisão da medição (`mc_medicao_revisoes`), na ordem do número. */
export interface RevisaoMedicao {
  id: string;
  numero: number;
  /** "antes_aprovacao" | "pos_aprovacao" (check do banco). */
  fase: string;
  /** "em_aberto" | "enviada" | "aprovada" | "substituida" (check do banco). */
  status: string;
  /** Nulo só na REV00 (o banco exige motivo nas outras). */
  motivo: string | null;
  criadoEm: string;
}

/**
 * Uma linha da tabela de itens do detalhe: `mc_v_medicao_itens` (números como TEXTO, D7: só
 * exibidos) com código, descrição e unidade da linha da planilha que a view apontou
 * (`planilha_item_id`: a da versão da medição, ou a da última versão em que o item aparece).
 */
export interface ItemMedicaoDetalhe {
  itemId: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  qtdMedida: string | null;
  /** Soma exata dos ajustes da revisão corrente (ou da última, sem corrente); nulo sem ajuste. */
  ajustes: string | null;
  /** Nulos enquanto a medição não está aprovada. */
  qtdAprovada: string | null;
  glosa: string | null;
  /** Nulo quando o contrato ainda não tem regra de arredondamento (spec 6.2). */
  valor: string | null;
}

/** Serviço da versão da medição que pode receber ajuste. */
export interface ServicoAjuste {
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
}

/** Tudo que o detalhe da medição mostra, montado em `detalhe-queries.ts`. */
export interface MedicaoDetalhe {
  id: string;
  contratoId: string;
  contratoCodigo: string;
  contratoNome: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  versaoNumero: number | null;
  /** `mc_v_medicao_totais.valor` como texto; nulo é contrato sem regra de arredondamento. */
  valor: string | null;
  revisoes: RevisaoMedicao[];
  /** A revisão em aberto ou enviada de maior número (a que o ciclo mexe agora); nula se não há. */
  revisaoCorrente: RevisaoMedicao | null;
  itens: ItemMedicaoDetalhe[];
  servicos: ServicoAjuste[];
  eventos: EventoMedicao[];
}

/** Uma linha de `mc_medicao_eventos`, já com o nome de quem fez. */
export interface EventoMedicao {
  id: string;
  evento: string;
  deStatus: string | null;
  paraStatus: string | null;
  motivo: string | null;
  criadoEm: string;
  usuarioNome: string | null;
}
