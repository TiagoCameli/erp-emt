import type { ItemAlocacao } from "@/modules/mapa/schemas";
import type { EquipamentoMapa, PessoaMapa } from "@/modules/mapa/tipos";

/**
 * Item de `fn_mapa_alocar` como o banco lê: chave ausente não mexe, `null` limpa. Por isso a
 * conversão copia só as chaves presentes no item (inclusive as que valem null) e nunca escreve
 * `undefined`, que o JSON apagaria e viraria "não mexe" sem ninguém pedir.
 */
export type ItemLoteRpc = {
  colaborador_id: string;
  equipamento_id?: string | null;
  localidade_id?: string | null;
  obra_id?: string | null;
  centro_custo_id?: string | null;
};

const CHAVES = [
  ["equipamentoId", "equipamento_id"],
  ["localidadeId", "localidade_id"],
  ["obraId", "obra_id"],
  ["centroCustoId", "centro_custo_id"],
] as const;

export function itemParaRpc(item: ItemAlocacao): ItemLoteRpc {
  const saida: ItemLoteRpc = { colaborador_id: item.colaboradorId };
  for (const [daTela, doBanco] of CHAVES) {
    const valor = item[daTela];
    if (valor !== undefined) saida[doBanco] = valor;
  }
  return saida;
}

/**
 * Junta as edições da tela num lote só, uma linha por pessoa: duas edições da mesma pessoa (a
 * máquina numa célula, o centro na outra) viram um item; a última vence no mesmo campo. Item sem
 * nenhum campo além da pessoa sai (não há o que gravar).
 */
export function montarLote(edicoes: readonly ItemAlocacao[]): ItemAlocacao[] {
  const porPessoa = new Map<string, ItemAlocacao>();
  for (const e of edicoes) {
    const atual = porPessoa.get(e.colaboradorId) ?? {
      colaboradorId: e.colaboradorId,
    };
    porPessoa.set(e.colaboradorId, { ...atual, ...semIndefinidos(e) });
  }
  return [...porPessoa.values()].filter((i) =>
    CHAVES.some(([chave]) => i[chave] !== undefined),
  );
}

function semIndefinidos(item: ItemAlocacao): ItemAlocacao {
  const saida: ItemAlocacao = { colaboradorId: item.colaboradorId };
  for (const [chave] of CHAVES) {
    if (item[chave] !== undefined) saida[chave] = item[chave];
  }
  return saida;
}

/**
 * Uma máquina para duas pessoas no mesmo lote é recusada pelo banco (um operador por máquina).
 * A tela avisa antes de mandar: devolve o id da primeira máquina repetida, ou null.
 */
export function maquinaRepetida(itens: readonly ItemAlocacao[]): string | null {
  const vistas = new Set<string>();
  for (const i of itens) {
    if (!i.equipamentoId) continue;
    if (vistas.has(i.equipamentoId)) return i.equipamentoId;
    vistas.add(i.equipamentoId);
  }
  return null;
}

// ---- Bloco "Alocação" das fichas (v1.30) -------------------------------------------------------

type MaquinaAlocavel = Pick<
  EquipamentoMapa,
  | "id"
  | "codigo"
  | "descricao"
  | "placa"
  | "obraId"
  | "localidadeId"
  | "operadorId"
  | "operadorNome"
>;
type PessoaAlocavel = Pick<
  PessoaMapa,
  | "id"
  | "nome"
  | "funcao"
  | "obraId"
  | "localidadeId"
  | "equipamentoId"
  | "centroCustoId"
>;

export type OpcaoAlocacao = { valor: string; rotulo: string };

const porTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/** Quem é operador pela função do RH ("Operador de máquinas", "Operadora de rolo"...). */
export function ehOperadorPelaFuncao(funcao: string): boolean {
  return /operad/i.test(funcao);
}

/**
 * Máquinas para a pessoa escolher, na ordem do Tiago: primeiro as da mesma obra ou local dela e
 * sem operador, depois as ocupadas (o rótulo diz com quem), depois o resto. Código, placa e
 * descrição no rótulo, porque é por ele que o Combobox busca.
 */
export function opcoesMaquinaParaPessoa(
  pessoa: PessoaAlocavel,
  maquinas: readonly MaquinaAlocavel[],
): OpcaoAlocacao[] {
  const perto = (m: MaquinaAlocavel) =>
    (!!pessoa.localidadeId && m.localidadeId === pessoa.localidadeId) ||
    (!!pessoa.obraId && m.obraId === pessoa.obraId);
  const faixa = (m: MaquinaAlocavel) => {
    if (m.operadorId && m.operadorId !== pessoa.id) return 1;
    return perto(m) ? 0 : 2;
  };
  return [...maquinas]
    .sort((a, b) => faixa(a) - faixa(b) || porTexto(a.codigo, b.codigo))
    .map((m) => ({
      valor: m.id,
      rotulo: [
        m.codigo,
        m.descricao,
        m.placa,
        m.operadorId && m.operadorId !== pessoa.id
          ? `com ${m.operadorNome || "outro operador"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    }));
}

/**
 * Pessoas para operar a máquina: primeiro operadores (pela função) da obra da máquina e livres,
 * depois os demais livres da obra, depois quem já opera outra máquina (o rótulo diz qual), e o
 * resto por último.
 */
export function opcoesOperadorParaMaquina(
  maquina: MaquinaAlocavel,
  pessoas: readonly PessoaAlocavel[],
  codigoDe: ReadonlyMap<string, string>,
): OpcaoAlocacao[] {
  const faixa = (p: PessoaAlocavel) => {
    if (p.equipamentoId && p.equipamentoId !== maquina.id) return 2;
    const daObra =
      (!!maquina.obraId && p.obraId === maquina.obraId) ||
      (!!maquina.localidadeId && p.localidadeId === maquina.localidadeId);
    if (daObra) return ehOperadorPelaFuncao(p.funcao) ? 0 : 1;
    return 3;
  };
  return [...pessoas]
    .sort((a, b) => faixa(a) - faixa(b) || porTexto(a.nome, b.nome))
    .map((p) => ({
      valor: p.id,
      rotulo: [
        p.nome,
        p.funcao,
        p.equipamentoId && p.equipamentoId !== maquina.id
          ? `opera ${codigoDe.get(p.equipamentoId) ?? "outra máquina"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    }));
}

/**
 * A linha que avisa o que a troca leva junto ("Fulano sai da CB-001"). A troca é uma ação só; o
 * aviso é para ninguém se surpreender depois.
 */
export function avisoDaTrocaPelaPessoa(
  pessoa: PessoaAlocavel,
  maquina: MaquinaAlocavel | null,
  codigoAtual: string | null,
): string[] {
  const avisos: string[] = [];
  if (maquina?.operadorId && maquina.operadorId !== pessoa.id)
    avisos.push(
      `${maquina.operadorNome || "O operador atual"} sai da ${maquina.codigo}`,
    );
  if (pessoa.equipamentoId && pessoa.equipamentoId !== maquina?.id)
    avisos.push(`${pessoa.nome} deixa a ${codigoAtual ?? "máquina de agora"}`);
  return avisos;
}

export function avisoDaTrocaPelaMaquina(
  maquina: MaquinaAlocavel,
  pessoa: PessoaAlocavel | null,
  codigoDe: ReadonlyMap<string, string>,
): string[] {
  const avisos: string[] = [];
  if (pessoa?.equipamentoId && pessoa.equipamentoId !== maquina.id)
    avisos.push(
      `${pessoa.nome} sai da ${codigoDe.get(pessoa.equipamentoId) ?? "outra máquina"}`,
    );
  if (maquina.operadorId && maquina.operadorId !== pessoa?.id)
    avisos.push(
      `${maquina.operadorNome || "O operador atual"} fica sem máquina`,
    );
  return avisos;
}

/**
 * Sugestão de um clique depois de pôr a pessoa numa máquina: o local da máquina e, quando a
 * pessoa tem centro escolhido, voltar ao centro pela obra (a máquina leva a obra junto). Só
 * sugere: o centro nunca muda sozinho (Tiago, 17/10/2026).
 */
export function sugestaoDaMaquina(
  pessoa: PessoaAlocavel,
  maquina: MaquinaAlocavel,
): ItemAlocacao | null {
  const item: ItemAlocacao = { colaboradorId: pessoa.id };
  if (maquina.localidadeId && maquina.localidadeId !== pessoa.localidadeId)
    item.localidadeId = maquina.localidadeId;
  if (pessoa.centroCustoId) item.centroCustoId = null;
  return item.localidadeId !== undefined || item.centroCustoId !== undefined
    ? item
    : null;
}

/**
 * Depois de escolher o local: "Centro da obra deste local". Sem centro escolhido, os dias já
 * contam na obra; com centro escolhido, o chip tira a escolha e o centro volta a ser o da obra.
 */
export function sugestaoDoLocal(
  pessoa: PessoaAlocavel,
  local: { obraId: string | null } | null,
): ItemAlocacao | null {
  if (!local?.obraId || !pessoa.centroCustoId) return null;
  return { colaboradorId: pessoa.id, centroCustoId: null };
}

/**
 * O "Desfazer" do toast: o item que devolve a pessoa como estava, só nos campos que o item
 * mexeu. Se a máquina de antes ganhou outro operador nesse meio-tempo, o banco solta quem estiver
 * nela, como numa troca normal.
 */
export function itemDeVolta(
  antes: PessoaAlocavel & { obraMapaId: string | null },
  item: ItemAlocacao,
): ItemAlocacao {
  const volta: ItemAlocacao = { colaboradorId: antes.id };
  if (item.equipamentoId !== undefined)
    volta.equipamentoId = antes.equipamentoId;
  // Pôr numa máquina também traz a obra dela para a pessoa (trigger do espelho): volta junto.
  if (
    item.equipamentoId !== undefined ||
    item.localidadeId !== undefined ||
    item.obraId !== undefined
  ) {
    if (antes.localidadeId) volta.localidadeId = antes.localidadeId;
    volta.obraId = antes.obraMapaId;
  }
  if (item.centroCustoId !== undefined)
    volta.centroCustoId = antes.centroCustoId;
  return volta;
}
