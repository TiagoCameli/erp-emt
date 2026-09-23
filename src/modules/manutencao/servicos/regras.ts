import { osEditavel, type StatusOs } from "@/modules/manutencao/_shared/rotulos";

/**
 * Quais ações a tela oferece em cada status da OS, para quem tem qual permissão.
 *
 * Espelha as travas das RPCs (fn_os_iniciar, fn_os_concluir, fn_os_reabrir,
 * fn_os_cancelar, fn_os_excluir, fn_os_exigir_editavel). O banco continua sendo a
 * barreira; aqui é para não mostrar botão que o banco vai recusar.
 *
 * Módulo puro, testado em regras.test.ts.
 */

export interface PermissoesOs {
  editar: boolean;
  excluir: boolean;
}

export interface AcoesOs {
  editarCabecalho: boolean;
  adicionarLinha: boolean;
  removerLinha: boolean;
  iniciar: boolean;
  concluir: boolean;
  reabrir: boolean;
  cancelar: boolean;
  excluir: boolean;
}

export function acoesDaOs(status: StatusOs, permissoes: PermissoesOs): AcoesOs {
  const editavel = osEditavel(status);
  const podeEditar = permissoes.editar;
  return {
    editarCabecalho: editavel && podeEditar,
    adicionarLinha: editavel && podeEditar,
    removerLinha: editavel && podeEditar,
    iniciar: status === "aberta" && podeEditar,
    concluir: editavel && podeEditar,
    reabrir: status === "concluida" && podeEditar,
    cancelar: editavel && podeEditar,
    // Concluída precisa ser reaberta antes; em execução precisa ser cancelada.
    excluir: (status === "aberta" || status === "cancelada") && permissoes.excluir,
  };
}

/**
 * A OS pede a obra (centro de custo) só quando o equipamento não tem etapa
 * própria no centro de custo, que é o caso do alugado. Próprio e Colorado usam a
 * etapa do equipamento, decidida pelo banco em fn_os_salvar.
 */
export function osExigeCentroCusto(equipamento: { temEtapa: boolean } | null | undefined): boolean {
  if (!equipamento) return false;
  return !equipamento.temEtapa;
}
