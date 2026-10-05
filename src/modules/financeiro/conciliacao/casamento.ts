/**
 * Motor de casamento da conciliação: decide qual movimento do extrato é qual
 * parcela ou transferência do app. Módulo puro (sem banco, sem React), testado
 * em `casamento.test.ts`.
 *
 * O que o extrato real do BB 102.124-9 de 09/2026 ensinou (508 movimentos):
 * - 415 casam por valor exato no MESMO dia. Valor e dia são o critério.
 * - 67 desses têm mais de uma parcela com o mesmo valor no mesmo dia (folha,
 *   diárias, PIX de valor redondo). Quem desempata é o nome do favorecido, que
 *   o banco escreve no histórico: "PIX - ENVIADO - 01/09 19:22 JOSE AUGUSTO DA
 *   SILVA PRA" (o nome vem cortado, então o último pedaço casa por prefixo).
 * - Dois boletos divergem em R$ 0,01 da parcela. Isso NUNCA casa sozinho: vira
 *   sugestão com a diferença à vista, e quem concilia decide ajustar.
 *
 * O automático só casa o que não muda nada na parcela (paga, nesta conta,
 * valor exato). Trocar conta, dar baixa em parcela aberta ou ajustar centavo
 * fica para a pessoa, pela sugestão.
 */

export type Sentido = "credito" | "debito";

/** Movimento do extrato ainda sem par. `valor` vem com sinal, como no OFX. */
export interface MovimentoCasavel {
  id: string;
  dataMovimento: string;
  valor: number;
  memo: string | null;
}

/** De onde vem o candidato: decide o que o casamento faz com ele. */
export type GrupoCandidato =
  /** Parcela paga nesta conta: só vincula. */
  | "paga_na_conta"
  /** Parcela paga em outra conta: muda a conta e vincula. */
  | "paga_outra_conta"
  /** Parcela ainda não paga: dá baixa na data do movimento e vincula. */
  | "aberta"
  /** Lado livre de uma transferência entre contas. */
  | "transferencia";

export interface CandidatoCasavel {
  especie: "parcela" | "transferencia";
  grupo: GrupoCandidato;
  id: string;
  /** Data de pagamento, vencimento (aberta) ou da transferência. */
  data: string;
  /** Valor em módulo, como o banco debitou/creditou (líquido da parcela). */
  valor: number;
  sentido: Sentido;
  /** Nomes que podem aparecer no histórico (fantasia, razão social, descrição). */
  nomes: (string | null)[];
  /**
   * False quando o banco recusaria a baixa (parcela a pagar ainda não
   * aprovada). Fica de fora das sugestões seguras.
   */
  podeBaixar?: boolean;
  /**
   * Apelidos bancários do favorecido (Bloco I): o cedente que o banco escreve
   * no histórico (FORTBRAS para RONDOBRAS). Igual ao cedente do movimento,
   * o nome bate com pontuação máxima.
   */
  apelidos?: readonly string[];
}

export interface ParCasado {
  transacaoId: string;
  especie: "parcela" | "transferencia";
  alvoId: string;
  dias: number;
  nomeBate: boolean;
  /**
   * Casou pela regra (b): o nome não bate, mas o valor é único nos dois lados
   * dentro da janela. Na tela vira o selo "Confira".
   */
  confira: boolean;
}

export interface Sugestao<C extends CandidatoCasavel = CandidatoCasavel> {
  candidato: C;
  /** Valor do banco menos valor do app (positivo: banco saiu/entrou mais). */
  diferenca: number;
  dias: number;
  nomeBate: boolean;
  /** Pontos de nome (palavras em comum, nome comum vale meia). */
  pontosNome: number;
}

/** Janela do automático: o banco às vezes compensa no dia útil seguinte. */
export const JANELA_AUTOMATICA_DIAS = 3;
/** Janela das sugestões manuais. */
export const JANELA_SUGESTAO_DIAS = 7;
/** Diferença máxima que aparece como sugestão de ajuste (centavos de boleto). */
export const TOLERANCIA_SUGESTAO = 1;

/**
 * Palavras que aparecem no histórico do banco ou em razão social e não
 * identificam ninguém. Sem tirá-las, "PAGAMENTO DE BOLETO - X LTDA" bateria com
 * qualquer outro boleto de qualquer LTDA.
 */
const PALAVRAS_VAZIAS = new Set([
  "PIX", "ENVIADO", "RECEBIDO", "PAGAMENTO", "PAGTO", "BOLETO", "TED", "DOC",
  "TRANSF", "TRANSFERENCIA", "ELETR", "DISPONIV", "ENVIADA", "RECEBIDA", "TARIFA",
  "LTDA", "EIRELI", "ME", "EPP", "SA", "S/A", "CIA", "COMERCIO", "SERVICOS",
  "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "PARA", "COM", "REFERENTE", "REF",
  "AUTO", "ATEND", "VIA", "CONTA", "BB", "BANCO", "BRASIL",
]);

/** Tira acento, caixa e pontuação, e quebra em palavras que identificam. */
const cachePalavras = new Map<string, string[]>();

export function palavrasDoNome(texto: string | null | undefined): string[] {
  if (!texto) return [];
  // Os mesmos nomes de fornecedor se repetem em milhares de comparações
  // ("todos os meses"): normalizar uma vez só.
  const guardado = cachePalavras.get(texto);
  if (guardado) return guardado;
  const palavras = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(
      (palavra) =>
        palavra.length >= 3 && !/^\d+$/.test(palavra) && !PALAVRAS_VAZIAS.has(palavra),
    );
  if (cachePalavras.size > 50000) cachePalavras.clear();
  cachePalavras.set(texto, palavras);
  return palavras;
}

/**
 * Nomes e sobrenomes tão comuns que, sozinhos, não identificam ninguém. Caso
 * real (03/10/2026): "PIX - ENVIADO - EDILSON FRANCA DA SILVA" saía com "nome
 * confere" para ANTONIO DA SILVA SOUZA só por causa do SILVA. Valem meia
 * palavra: dois deles juntos contam como uma que identifica.
 */
const NOMES_COMUNS = new Set([
  "SILVA", "SOUZA", "SOUSA", "SANTOS", "OLIVEIRA", "PEREIRA", "LIMA", "COSTA", "FERREIRA",
  "RODRIGUES", "ALVES", "GOMES", "MARTINS", "CARVALHO", "ARAUJO", "RIBEIRO", "NASCIMENTO",
  "BARBOSA", "MELO", "MELLO", "ROCHA", "DIAS", "CASTRO", "CARDOSO", "TEIXEIRA", "MOREIRA",
  "FERNANDES", "LOPES", "SOARES", "VIEIRA", "MENDES", "FREITAS", "BATISTA", "MONTEIRO",
  "JESUS", "NUNES", "MOURA", "CAVALCANTE", "MACHADO", "CORREIA", "PINTO", "REIS", "FILHO",
  "JUNIOR", "NETO", "SOBRINHO",
  "JOSE", "JOAO", "MARIA", "ANTONIO", "FRANCISCO", "CARLOS", "PAULO", "PEDRO", "LUCAS",
  "LUIZ", "LUIS", "MARCOS", "ANA", "RAIMUNDO", "MANOEL", "MANUEL", "FRANCISCA", "ANTONIA",
]);

/**
 * Pontos de nome entre o histórico e os nomes do candidato. Cada palavra do
 * histórico que aparece num nome vale 1 (ou 0,5 se for nome muito comum). A
 * palavra casa se for igual ou se for PREFIXO de uma palavra do nome (o banco
 * corta o nome: "SILVA PRA" de "SILVA PRADO").
 */
export function palavrasEmComum(
  memo: string | null,
  nomes: readonly (string | null)[],
): number {
  const doMemo = palavrasDoNome(memo);
  if (doMemo.length === 0) return 0;
  const doNome = new Set(nomes.flatMap((nome) => palavrasDoNome(nome)));
  if (doNome.size === 0) return 0;
  let pontos = 0;
  for (const palavra of doMemo) {
    // A palavra que casou do lado do cadastro decide se é nome comum: o banco
    // corta o nome ("OLIVEIR" de OLIVEIRA) e o pedaço cortado não está na lista.
    let casada: string | null = doNome.has(palavra) ? palavra : null;
    if (!casada) {
      for (const candidata of doNome) {
        if (candidata.startsWith(palavra) || palavra.startsWith(candidata)) {
          casada = candidata;
          break;
        }
      }
    }
    if (casada) {
      pontos += NOMES_COMUNS.has(palavra) || NOMES_COMUNS.has(casada) ? 0.5 : 1;
    }
  }
  return pontos;
}

/**
 * "Nome confere": pelo menos uma palavra que identifica, ou dois nomes comuns.
 * Só SILVA (ou só JOSE) não confere.
 */
export function nomeConfere(memo: string | null, nomes: readonly (string | null)[]): boolean {
  return palavrasEmComum(memo, nomes) >= 1;
}

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";

/**
 * Sem acento, maiúsculas, pontuação vira espaço, espaços simples. Igual a
 * `fn_conciliacao_normalizar_cedente`: o apelido gravado no banco e o cedente
 * calculado aqui precisam sair idênticos.
 */
export function normalizarCedente(texto: string | null | undefined): string {
  let saida = "";
  for (const c of texto ?? "") {
    const i = COM_ACENTO.indexOf(c);
    saida += i >= 0 ? SEM_ACENTO[i] : c;
  }
  return saida
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefixos do BB antes do nome de quem recebeu ou pagou. */
const PREFIXOS_DO_CEDENTE = [
  "PIX ENVIADO",
  "PIX RECEBIDO",
  "PAGAMENTO DE BOLETO",
  "PAGTO VIA AUTO ATEND BB",
  "TED TRANSF ELETR DISPONIV",
  "TRANSFERENCIA ENVIADA",
  "TRANSFERIDO PARA POUPANCA",
  "PAGTO CONTA TELEFONE",
  "PAGAMENTO CONTA LUZ",
  "IMPOSTOS",
];

/**
 * O cedente que o banco escreveu no histórico (Bloco I): tira o prefixo do
 * BB, as datas, horas e números soltos (CNPJ, agência) e devolve o resto, com
 * pelo menos 3 letras. Sem prefixo conhecido devolve null: tarifa, DARF e
 * Rende Fácil não têm cedente, e é assim mesmo. Igual a
 * `fn_conciliacao_cedente`.
 *
 * "PAGAMENTO DE BOLETO - FORTBRAS AUTOPECAS S.A." vira "FORTBRAS AUTOPECAS S A".
 */
export function cedenteDoHistorico(memo: string | null): string | null {
  const texto = normalizarCedente(memo);
  const prefixo = PREFIXOS_DO_CEDENTE.find((p) => texto === p || texto.startsWith(`${p} `));
  if (!prefixo) return null;
  const resto = texto
    .slice(prefixo.length)
    .split(" ")
    .filter((w) => w !== "" && !/^\d+$/.test(w))
    .join(" ");
  return resto.replace(/[^A-Z]/g, "").length >= 3 ? resto : null;
}

/** Pontuação máxima: o cedente é um apelido confirmado do favorecido. */
const PONTOS_DO_APELIDO = 99;

/**
 * Pontos de nome entre o movimento e um candidato: o apelido bancário vale o
 * máximo; senão, as palavras em comum com os nomes.
 */
export function pontosDoCandidato(
  memo: string | null,
  candidato: { nomes: readonly (string | null)[]; apelidos?: readonly string[] },
  nomes: readonly (string | null)[] = candidato.nomes,
): number {
  if (candidato.apelidos && candidato.apelidos.length > 0) {
    const cedente = cedenteDoHistorico(memo);
    if (cedente && candidato.apelidos.includes(cedente)) return PONTOS_DO_APELIDO;
  }
  return palavrasEmComum(memo, nomes);
}

/** "Nome confere" com o candidato, contando o apelido bancário. */
export function nomeConfereComCandidato(
  memo: string | null,
  candidato: { nomes: readonly (string | null)[]; apelidos?: readonly string[] },
  nomes: readonly (string | null)[] = candidato.nomes,
): boolean {
  return pontosDoCandidato(memo, candidato, nomes) >= 1;
}

/** Diferença em dias entre duas datas yyyy-MM-dd, em módulo. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round(ms / 86_400_000));
}

function centavos(valor: number): number {
  return Math.round(Math.abs(valor) * 100);
}

function sentidoDo(movimento: MovimentoCasavel): Sentido {
  return movimento.valor >= 0 ? "credito" : "debito";
}

/**
 * Casamento automático: só o que é IMPOSSÍVEL errar (regra do Tiago,
 * 03/10/2026: "100% precisa; se tiver que escolher entre casar mais e errar
 * menos, erre menos e deixe como sugestão").
 *
 * Um par só casa sozinho se for valor exato em centavos, mesmo sentido,
 * dentro da janela, candidato elegível (paga nesta conta ou transferência) E
 * uma das duas:
 *
 * (a) o nome do favorecido aparece no histórico, esse candidato é o ÚNICO com
 *     nome batendo para o movimento, e o movimento é o ÚNICO com nome batendo
 *     para o candidato (dois PIX iguais para a mesma pessoa, com um só
 *     lançado, ficam para a pessoa decidir);
 * (b) o nome não bate, mas o valor é único NOS DOIS LADOS dentro da janela:
 *     um só movimento livre e um só candidato com esse valor e sentido. Sai
 *     com `confira: true`, que na tela vira o selo "Confira".
 *
 * (c) transferência entre contas sem nome no histórico: uma única de mesmo
 *     valor no mesmo dia do movimento, e ela com um único movimento no dia.
 * (d) iguais do mesmo dia (roda antes das outras): ver casarIguaisDoMesmoDia.
 *
 * A disputa é contada pelos dois lados: um candidato disputado por mais de um
 * movimento sem nome nunca casa sozinho, mesmo que sobre só ele. O defeito
 * que isto fecha: dois PIX de R$ 500,00 no mesmo dia, um só lançado, nenhum
 * nome; o primeiro da lista casava e o outro ia para "Faltam no app", onde
 * alguém lançaria de novo.
 *
 * Tudo que não passa continua aparecendo em `sugerirParaMovimento`.
 */
export function casarAutomaticamente(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
  janelaDias: number = JANELA_AUTOMATICA_DIAS,
): ParCasado[] {
  // (d) primeiro: os iguais do mesmo dia. O que sobra segue pelas regras
  // (a), (b) e (c), já sem os que casaram aqui.
  const iguais = casarIguaisDoMesmoDia(movimentos, candidatos);
  const movUsados = new Set(iguais.map((p) => p.transacaoId));
  const candUsados = new Set(iguais.map((p) => `${p.especie}:${p.alvoId}`));
  return [
    ...iguais,
    ...casarPorRegras(
      movimentos.filter((m) => !movUsados.has(m.id)),
      candidatos.filter((c) => !candUsados.has(`${c.especie}:${c.id}`)),
      janelaDias,
    ),
  ];
}

/** O que identifica um candidato: espécie e nomes normalizados (favorecido, descrição). */
function chaveDeEquivalencia(c: CandidatoCasavel): string {
  return `${c.especie}|${c.nomes.map((n) => palavrasDoNome(n).join(" ")).join("|")}`;
}

/** O histórico sem hora, número e pontuação: o que identifica o movimento. */
function chaveDoHistorico(memo: string | null): string {
  return palavrasDoNome(memo).join(" ");
}

/**
 * (d) Iguais do mesmo dia (Tiago, 05/10/2026). Movimentos do banco de mesmo
 * valor, sentido e DIA, com o MESMO histórico (só a hora muda, como os 14 PIX
 * de R$ 198,15 para o DETRAN em 31/03/2026), são indistinguíveis: qualquer
 * pareamento com os lançamentos do app daquele dia dá o mesmo resultado,
 * mesmo que os lançamentos sejam diferentes entre si (uma placa cada).
 *
 * - todo lançamento do dia precisa conferir com o histórico (transferência
 *   entre as mesmas contas dispensa nome);
 * - com tantos ou mais movimentos que lançamentos, casa todos os lançamentos
 *   e os movimentos que sobram ficam em "Faltam no app";
 * - com menos movimentos que lançamentos, só casa se os lançamentos também
 *   forem idênticos (aí tanto faz qual sobra em "fora do banco"); senão
 *   importa qual ficou de fora, e fica para quem concilia.
 * - lançamento cujo favorecido não é o nome do extrato (o nome só aparece na
 *   descrição) sai com `confira`.
 */
function casarIguaisDoMesmoDia(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
): ParCasado[] {
  const elegiveis = candidatos.filter(
    (c) => c.grupo === "paga_na_conta" || c.grupo === "transferencia",
  );
  const chave = (sentido: Sentido, valor: number, dia: string) => `${sentido}|${centavos(valor)}|${dia}`;
  const candPorDia = new Map<string, CandidatoCasavel[]>();
  for (const c of elegiveis) {
    const k = chave(c.sentido, c.valor, c.data);
    const lista = candPorDia.get(k);
    if (lista) lista.push(c);
    else candPorDia.set(k, [c]);
  }
  // Agrupa os movimentos também pelo histórico: só os indistinguíveis.
  const movPorDia = new Map<string, MovimentoCasavel[]>();
  for (const m of movimentos) {
    const k = chave(sentidoDo(m), m.valor, m.dataMovimento);
    const lista = movPorDia.get(k);
    if (lista) lista.push(m);
    else movPorDia.set(k, [m]);
  }

  const pares: ParCasado[] = [];
  for (const [k, movs] of movPorDia) {
    const cands = candPorDia.get(k);
    if (!cands || cands.length === 0) continue;
    const historico = chaveDoHistorico(movs[0].memo);
    if (!movs.every((m) => chaveDoHistorico(m.memo) === historico)) continue;

    const transferencia = cands.every((c) => c.especie === "transferencia");
    if (!transferencia && cands.some((c) => c.especie === "transferencia")) continue;
    if (!transferencia && !cands.every((c) => nomeConfereComCandidato(movs[0].memo, c))) continue;
    // Uma transferência sozinha no dia é coisa das regras (b) e (c).
    if (transferencia && movs.length === 1 && cands.length === 1) continue;

    if (movs.length < cands.length) {
      const referencia = chaveDeEquivalencia(cands[0]);
      if (!cands.every((c) => chaveDeEquivalencia(c) === referencia)) continue;
    }

    const ordenadosMov = [...movs].sort((a, b) => (a.memo ?? "").localeCompare(b.memo ?? "") || a.id.localeCompare(b.id));
    const ordenadosCand = [...cands].sort((a, b) => a.id.localeCompare(b.id));
    const n = Math.min(ordenadosMov.length, ordenadosCand.length);
    for (let i = 0; i < n; i += 1) {
      const m = ordenadosMov[i];
      const c = ordenadosCand[i];
      // Favorecido (nome, razão social) conferindo; só a descrição não basta
      // para dispensar a conferência.
      const favorecidoConfere =
        transferencia || nomeConfereComCandidato(m.memo, c, c.nomes.slice(0, 2));
      pares.push({
        transacaoId: m.id,
        especie: c.especie,
        alvoId: c.id,
        dias: 0,
        nomeBate: !transferencia,
        confira: !favorecidoConfere,
      });
    }
  }
  return pares;
}

function casarPorRegras(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
  janelaDias: number,
): ParCasado[] {
  const elegiveis = candidatos.filter(
    (c) => c.grupo === "paga_na_conta" || c.grupo === "transferencia",
  );

  const porValor = new Map<string, CandidatoCasavel[]>();
  for (const candidato of elegiveis) {
    const chave = `${candidato.sentido}:${centavos(candidato.valor)}`;
    const lista = porValor.get(chave);
    if (lista) lista.push(candidato);
    else porValor.set(chave, [candidato]);
  }

  interface Possivel {
    movimento: MovimentoCasavel;
    candidato: CandidatoCasavel;
    chaveCandidato: string;
    dias: number;
    nomeBate: boolean;
  }
  const porMovimento = new Map<string, Possivel[]>();
  const porCandidato = new Map<string, Possivel[]>();
  for (const movimento of movimentos) {
    const chave = `${sentidoDo(movimento)}:${centavos(movimento.valor)}`;
    for (const candidato of porValor.get(chave) ?? []) {
      const dias = diasEntre(candidato.data, movimento.dataMovimento);
      if (dias > janelaDias) continue;
      const chaveCandidato = `${candidato.especie}:${candidato.id}`;
      const possivel: Possivel = {
        movimento,
        candidato,
        chaveCandidato,
        dias,
        nomeBate: nomeConfereComCandidato(movimento.memo, candidato),
      };
      const doMovimento = porMovimento.get(movimento.id);
      if (doMovimento) doMovimento.push(possivel);
      else porMovimento.set(movimento.id, [possivel]);
      const doCandidato = porCandidato.get(chaveCandidato);
      if (doCandidato) doCandidato.push(possivel);
      else porCandidato.set(chaveCandidato, [possivel]);
    }
  }

  const pares: ParCasado[] = [];
  const candidatoUsado = new Set<string>();
  for (const movimento of movimentos) {
    const opcoes = porMovimento.get(movimento.id) ?? [];
    if (opcoes.length === 0) continue;

    let escolhido: Possivel | null = null;
    let confira = false;

    const comNome = opcoes.filter((o) => o.nomeBate);
    if (comNome.length === 1) {
      // (a) nome único dos dois lados.
      const unico = comNome[0];
      const disputaComNome = (porCandidato.get(unico.chaveCandidato) ?? []).filter(
        (o) => o.nomeBate,
      ).length;
      if (disputaComNome === 1) escolhido = unico;
    } else if (comNome.length === 0 && opcoes.length === 1) {
      // (b) sem nome: valor único nos dois lados.
      const unico = opcoes[0];
      if ((porCandidato.get(unico.chaveCandidato) ?? []).length === 1) {
        escolhido = unico;
        confira = true;
      }
    }

    if (!escolhido && comNome.length === 0) {
      // (c) transferência entre contas no MESMO dia (Tiago, 03/10/2026:
      // "transferências entre contas no mesmo dia e com o mesmo valor são bem
      // raras"): uma só de mesmo valor no dia do movimento, e ela com um só
      // movimento de mesmo valor no dia dela. Vale só para transferência:
      // pagamento de mesmo valor no mesmo dia é comum (salários).
      const noDia = opcoes.filter((o) => o.dias === 0);
      if (noDia.length === 1 && noDia[0].candidato.especie === "transferencia") {
        const doDia = (porCandidato.get(noDia[0].chaveCandidato) ?? []).filter((o) => o.dias === 0);
        if (doDia.length === 1) escolhido = noDia[0];
      }
    }

    if (!escolhido || candidatoUsado.has(escolhido.chaveCandidato)) continue;
    candidatoUsado.add(escolhido.chaveCandidato);
    pares.push({
      transacaoId: movimento.id,
      especie: escolhido.candidato.especie,
      alvoId: escolhido.candidato.id,
      dias: escolhido.dias,
      nomeBate: escolhido.nomeBate,
      confira,
    });
  }
  return pares;
}

/**
 * Sugestões para o casamento manual de UM movimento, de todos os grupos, em
 * ordem de quem concilia escolheria: valor exato antes de valor com diferença,
 * nome que bate, data mais próxima, e entre iguais o que muda menos no app
 * (paga na conta, transferência, outra conta, aberta).
 */
export function sugerirParaMovimento<C extends CandidatoCasavel>(
  movimento: MovimentoCasavel,
  candidatos: readonly C[],
  {
    janelaDias = JANELA_SUGESTAO_DIAS,
    janelaAbertaDias = 45,
    tolerancia = TOLERANCIA_SUGESTAO,
  }: { janelaDias?: number; janelaAbertaDias?: number; tolerancia?: number } = {},
): Sugestao<C>[] {
  const sentido = sentidoDo(movimento);
  const banco = centavos(movimento.valor);
  const peso: Record<GrupoCandidato, number> = {
    paga_na_conta: 0,
    transferencia: 1,
    paga_outra_conta: 2,
    aberta: 3,
  };

  // Os filtros baratos (sentido, valor, data) vêm antes da comparação de
  // nomes: com todos os meses abertos são milhares de candidatos por movimento.
  return candidatos
    .filter((candidato) => candidato.sentido === sentido)
    .map((candidato) => ({
      candidato,
      diferenca: (banco - centavos(candidato.valor)) / 100,
      dias: diasEntre(candidato.data, movimento.dataMovimento),
      nomeBate: false,
      pontosNome: 0,
    }))
    .filter((sugestao) => {
      const janela =
        sugestao.candidato.grupo === "aberta" ? janelaAbertaDias : janelaDias;
      if (sugestao.dias > janela) return false;
      // Diferença só se oferece para parcela: transferência casa no valor exato.
      const limite = sugestao.candidato.especie === "transferencia" ? 0 : tolerancia;
      return Math.abs(sugestao.diferenca) <= limite + 1e-9;
    })
    .map((sugestao) => ({
      ...sugestao,
      pontosNome: pontosDoCandidato(movimento.memo, sugestao.candidato),
      nomeBate: nomeConfereComCandidato(movimento.memo, sugestao.candidato),
    }))
    .sort(
      (a, b) =>
        Number(a.diferenca !== 0) - Number(b.diferenca !== 0) ||
        Number(b.nomeBate) - Number(a.nomeBate) ||
        b.pontosNome - a.pontosNome ||
        a.dias - b.dias ||
        peso[a.candidato.grupo] - peso[b.candidato.grupo],
    );
}

/**
 * Histórico que o banco usa para a aplicação/resgate automático. Movimento
 * assim não é despesa nem receita: é transferência para a subconta de
 * investimentos, e a tela oferece esse caminho primeiro.
 */
export function pareceAplicacaoAutomatica(memo: string | null): boolean {
  if (!memo) return false;
  const texto = memo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return (
    texto.includes("RENDE FACIL") ||
    texto.includes("APLICACAO") ||
    texto.includes("RESGATE")
  );
}

/** Uma sugestão que dá para aceitar em lote, revisando a lista. */
export interface SugestaoSegura<C extends CandidatoCasavel = CandidatoCasavel> {
  movimento: MovimentoCasavel;
  candidato: C;
}

/**
 * Sugestões que dá para aceitar em lote com um clique de revisão (faixa 2 da
 * regra do Tiago, 03/10/2026). Segura é a que não tem outra leitura:
 *
 * - valor exato, mesmo sentido, nome do favorecido no histórico;
 * - UM único candidato com nome batendo para o movimento (em qualquer grupo);
 * - o candidato é de "paga em outra conta" ou "em aberto" (paga nesta conta e
 *   transferência o automático já trata) e o banco aceitaria a baixa;
 * - e esse candidato não é a melhor sugestão de nenhum outro movimento.
 *
 * Sem nome nunca é segura, dois candidatos com nome nunca é segura, candidato
 * disputado nunca é seguro.
 */
export function sugestoesSeguras<C extends CandidatoCasavel>(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly C[],
): SugestaoSegura<C>[] {
  const chave = (c: CandidatoCasavel) => `${c.especie}:${c.id}`;
  const listas = movimentos.map((movimento) => ({
    movimento,
    sugestoes: sugerirParaMovimento(movimento, candidatos),
  }));

  // Quantas vezes cada candidato é a melhor sugestão de algum movimento, ou
  // aparece com nome e valor exato para ele: é a disputa.
  const disputa = new Map<string, number>();
  for (const { sugestoes } of listas) {
    const vistos = new Set<string>();
    const melhor = sugestoes[0];
    if (melhor) vistos.add(chave(melhor.candidato));
    for (const s of sugestoes) {
      if (s.diferenca === 0 && s.nomeBate) vistos.add(chave(s.candidato));
    }
    for (const k of vistos) disputa.set(k, (disputa.get(k) ?? 0) + 1);
  }

  const seguras: SugestaoSegura<C>[] = [];
  for (const { movimento, sugestoes } of listas) {
    const comNome = sugestoes.filter((s) => s.diferenca === 0 && s.nomeBate);
    if (comNome.length !== 1) continue;
    const unica = comNome[0];
    if (unica.candidato.grupo !== "paga_outra_conta" && unica.candidato.grupo !== "aberta") continue;
    if (unica.candidato.podeBaixar === false) continue;
    if ((disputa.get(chave(unica.candidato)) ?? 0) !== 1) continue;
    seguras.push({ movimento, candidato: unica.candidato });
  }
  return seguras;
}

/** Um par dentro de um grupo equivalente. */
export interface ParDoGrupo {
  transacaoId: string;
  alvoId: string;
  /** O nome do candidato aparece no histórico; senão é só equivalente. */
  nomeBate: boolean;
}

/** N movimentos e N parcelas de mesmo valor, sentido e dia (Bloco J). */
export interface GrupoEquivalente {
  /** sentido|centavos|dia */
  chave: string;
  pares: ParDoGrupo[];
}

/** "dd/mm hh:mm" do histórico em minutos, para ordenar os PIX do dia. */
function minutosDoHistorico(memo: string | null): number {
  const m = /(\d{2}):(\d{2})/.exec(memo ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Grupos equivalentes N:N (Bloco J, 05/10/2026): roda sobre o que sobrou
 * livre depois do automático. N movimentos e N parcelas pagas nesta conta de
 * mesmo valor, sentido e DIA, N ≥ 2, e ninguém do grupo com nome batendo em
 * alguém de fora (folha de valores iguais, diárias, PIX redondo). Os valores e
 * o dia são iguais, então a ordem não muda saldo nem resultado.
 *
 * Dentro do grupo, os pares com nome batendo (um para um) ficam fixos; o
 * resto pareia pela hora do histórico contra a ordem dos candidatos.
 *
 * NÃO é automático: é faixa 2, um clique com revisão. Mais movimentos que
 * parcelas (ou o contrário) não é grupo: é lançamento faltando ou sobrando.
 */
export function gruposEquivalentes(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
): GrupoEquivalente[] {
  const chaveDe = (sentido: Sentido, valor: number, dia: string) =>
    `${sentido}|${centavos(valor)}|${dia}`;
  const movPorChave = new Map<string, MovimentoCasavel[]>();
  for (const m of movimentos) {
    const k = chaveDe(sentidoDo(m), m.valor, m.dataMovimento);
    movPorChave.set(k, [...(movPorChave.get(k) ?? []), m]);
  }
  const candPorChave = new Map<string, CandidatoCasavel[]>();
  for (const c of candidatos) {
    const k = chaveDe(c.sentido, c.valor, c.data);
    candPorChave.set(k, [...(candPorChave.get(k) ?? []), c]);
  }

  const grupos: GrupoEquivalente[] = [];
  for (const [chave, movs] of movPorChave) {
    const cands = candPorChave.get(chave) ?? [];
    if (movs.length < 2 || movs.length !== cands.length) continue;
    if (!cands.every((c) => c.grupo === "paga_na_conta")) continue;

    // Ninguém do grupo pode ter nome batendo com alguém de fora: aí a
    // equivalência é falsa, o par certo está fora.
    const idsMov = new Set(movs.map((m) => m.id));
    const idsCand = new Set(cands.map((c) => c.id));
    const candsFora = candidatos.filter((c) => !idsCand.has(c.id));
    const movimentoTemNomeFora = movs.some((m) =>
      sugerirParaMovimento(m, candsFora).some((s) => s.nomeBate),
    );
    if (movimentoTemNomeFora) continue;
    const candidatoTemNomeFora = movimentos
      .filter((m) => !idsMov.has(m.id))
      .some((m) => sugerirParaMovimento(m, cands).some((s) => s.nomeBate));
    if (candidatoTemNomeFora) continue;

    // Fixa os pares de nome único nos dois sentidos.
    const pares: ParDoGrupo[] = [];
    const usadosMov = new Set<string>();
    const usadosCand = new Set<string>();
    const batem = new Map(
      movs.map((m) => [m.id, cands.filter((c) => nomeConfereComCandidato(m.memo, c))]),
    );
    for (const m of movs) {
      const lista = batem.get(m.id) ?? [];
      if (lista.length !== 1) continue;
      const c = lista[0];
      const disputado = movs.filter((outro) => (batem.get(outro.id) ?? []).some((x) => x.id === c.id));
      if (disputado.length !== 1) continue;
      pares.push({ transacaoId: m.id, alvoId: c.id, nomeBate: true });
      usadosMov.add(m.id);
      usadosCand.add(c.id);
    }
    const restoMov = movs
      .filter((m) => !usadosMov.has(m.id))
      .sort((a, b) => minutosDoHistorico(a.memo) - minutosDoHistorico(b.memo) || a.id.localeCompare(b.id));
    const restoCand = cands.filter((c) => !usadosCand.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
    restoMov.forEach((m, i) => {
      pares.push({ transacaoId: m.id, alvoId: restoCand[i].id, nomeBate: false });
    });
    grupos.push({ chave, pares });
  }
  return grupos;
}
