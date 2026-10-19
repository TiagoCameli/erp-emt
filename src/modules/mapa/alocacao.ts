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

// ---- Quadro de alocação (v1.30) ----------------------------------------------------------------

/** Sem máquina, sem local e sem obra do Mapa: a pessoa ainda não foi alocada. */
export function semAlocacao(
  p: Pick<PessoaMapa, "equipamentoId" | "localidadeId" | "obraMapaId" | "areaId">,
): boolean {
  return !p.equipamentoId && !p.localidadeId && !p.obraMapaId && !p.areaId;
}

/** Valor da opção "nenhum" nas colunas de lista do quadro (a grade não grava texto que não é opção). */
export const NENHUM = "__nenhum__";

/**
 * Uma célula editada no quadro de pessoas vira o campo do lote. "Máquina" e "Centro" com NENHUM
 * limpam (null); "Local/obra" é "local:<id>", "obra:<id>" ou NENHUM (sem local nem obra).
 */
export function edicaoDaCelula(
  colaboradorId: string,
  coluna: "maquina" | "lugar" | "centro",
  texto: string,
): ItemAlocacao | null {
  const item: ItemAlocacao = { colaboradorId };
  if (coluna === "maquina") item.equipamentoId = texto === NENHUM ? null : texto;
  else if (coluna === "centro")
    item.centroCustoId = texto === NENHUM ? null : texto;
  else if (texto === NENHUM) {
    item.localidadeId = null;
    item.obraId = null;
  } else {
    const [tipo, id] = texto.split(":");
    if (!id) return null;
    if (tipo === "local") item.localidadeId = id;
    else if (tipo === "obra") item.obraId = id;
    else return null;
  }
  return item;
}

/** A pessoa como fica depois das edições pendentes (o que a grade mostra antes de salvar). */
export function pessoaComPendente<
  P extends Pick<PessoaMapa, "id" | "equipamentoId" | "localidadeId" | "obraMapaId" | "centroCustoId">,
>(p: P, pendente: ItemAlocacao | undefined): P {
  if (!pendente) return p;
  const novo = { ...p };
  if (pendente.equipamentoId !== undefined) novo.equipamentoId = pendente.equipamentoId;
  if (pendente.localidadeId !== undefined) {
    novo.localidadeId = pendente.localidadeId;
    if (pendente.obraId !== undefined) novo.obraMapaId = pendente.obraId;
  } else if (pendente.obraId !== undefined) {
    novo.localidadeId = null;
    novo.obraMapaId = pendente.obraId;
  }
  if (pendente.centroCustoId !== undefined) novo.centroCustoId = pendente.centroCustoId;
  return novo;
}

/**
 * Quem opera a máquina depois das edições pendentes: quem a pegou no quadro; senão o operador
 * de agora, a menos que o quadro o tenha tirado dela.
 */
export function operadorComPendente(
  maquina: Pick<EquipamentoMapa, "id" | "operadorId">,
  pendentes: ReadonlyMap<string, ItemAlocacao>,
): string | null {
  for (const item of pendentes.values())
    if (item.equipamentoId === maquina.id) return item.colaboradorId;
  if (!maquina.operadorId) return null;
  const doOperador = pendentes.get(maquina.operadorId);
  if (doOperador?.equipamentoId !== undefined) return null;
  return maquina.operadorId;
}

/**
 * O texto do toast de uma alocação de uma pessoa, com o que a troca levou junto ("Jacson opera
 * CB-001 · Ana sai da CB-001"). Lote de várias pessoas é "N pessoas alocadas".
 */
export function textoDaAlocacao(
  itens: readonly ItemAlocacao[],
  ctx: {
    pessoa: (id: string) => PessoaAlocavel | undefined;
    maquina: (id: string) => MaquinaAlocavel | undefined;
    nomeDoLocal: (id: string) => string | undefined;
  },
): string {
  if (itens.length !== 1)
    return `${itens.length.toLocaleString("pt-BR")} pessoas alocadas`;
  const item = itens[0]!;
  const p = ctx.pessoa(item.colaboradorId);
  const nome = p?.nome ?? "Pessoa";
  const partes: string[] = [];
  if (item.equipamentoId) {
    const m = ctx.maquina(item.equipamentoId);
    const atual = p?.equipamentoId ? ctx.maquina(p.equipamentoId) : undefined;
    partes.push(`${nome} opera ${m?.codigo ?? "a máquina"}`);
    if (p && m) partes.push(...avisoDaTrocaPelaPessoa(p, m, atual?.codigo ?? null));
  } else if (item.equipamentoId === null) {
    const atual = p?.equipamentoId ? ctx.maquina(p.equipamentoId) : undefined;
    partes.push(`${nome} saiu da ${atual?.codigo ?? "máquina"}`);
  }
  if (item.localidadeId)
    partes.push(
      `${partes.length ? "trabalha" : `${nome} trabalha`} em ${ctx.nomeDoLocal(item.localidadeId) ?? "local escolhido"}`,
    );
  if (item.centroCustoId !== undefined)
    partes.push(
      item.centroCustoId === null
        ? `${partes.length ? "centro" : `Centro de ${nome}`} pela obra`
        : `${partes.length ? "centro" : `Centro de ${nome}`} trocado`,
    );
  return partes.join(" · ") || `${nome}: nada mudou`;
}

/**
 * O lote do "Desfazer": cada pessoa do lote volta como estava e, quando a máquina que ela pegou
 * tinha outro operador, ele volta para a máquina (o banco o soltou na troca). As pessoas vêm
 * antes: soltam as máquinas que os operadores de antes vão retomar.
 */
export function loteDeVolta(
  itens: readonly ItemAlocacao[],
  pessoasAntes: ReadonlyMap<string, PessoaAlocavel & { obraMapaId: string | null }>,
  operadorAntesDe: ReadonlyMap<string, string | null>,
): ItemAlocacao[] {
  const noLote = new Set(itens.map((i) => i.colaboradorId));
  const volta: ItemAlocacao[] = [];
  const retomadas: ItemAlocacao[] = [];
  for (const item of itens) {
    const antes = pessoasAntes.get(item.colaboradorId);
    if (antes) volta.push(itemDeVolta(antes, item));
    if (!item.equipamentoId) continue;
    const operador = operadorAntesDe.get(item.equipamentoId);
    if (operador && operador !== item.colaboradorId && !noLote.has(operador))
      retomadas.push({ colaboradorId: operador, equipamentoId: item.equipamentoId });
  }
  return [...volta, ...retomadas];
}
