/**
 * Parser de extrato OFX. Sem dependências, server-compatible.
 *
 * Os bancos brasileiros (Caixa, BB, Sicredi) exportam OFX 1.x (SGML, tags sem
 * fechamento) ou 2.x (XML). Este parser é tolerante aos dois: trabalha por
 * regex sobre os campos padrão das transações (STMTTRN), que são iguais nos
 * dois formatos. Cada transação vira { data, valor, memo, fitid, tipo }.
 */

export interface TransacaoOfx {
  /** Data do movimento em ISO yyyy-MM-dd. */
  data: string;
  /** Valor com sinal: positivo crédito, negativo débito. */
  valor: number;
  memo: string | null;
  /** Identificador único da transação no banco (dedup na reimportação). */
  fitid: string | null;
  tipo: "credito" | "debito";
}

export interface ExtratoOfx {
  periodoInicio: string | null;
  periodoFim: string | null;
  /** Número da conta que o banco escreveu no arquivo (ACCTID), cru. */
  contaOfx: string | null;
  /**
   * Saldo final do extrato (LEDGERBAL/BALAMT), com sinal. Null quando o
   * arquivo não traz: nunca inventar, porque é ele que prova o mês.
   */
  saldoFinal: number | null;
  /** Data do saldo final (LEDGERBAL/DTASOF), ISO. */
  saldoFinalData: string | null;
  transacoes: TransacaoOfx[];
}

/**
 * Confere se o arquivo é da conta escolhida, pelos dígitos do ACCTID contra o
 * número cadastrado. Um termina no outro porque cada banco formata de um
 * jeito: o BB manda "102124-9" para a conta "102.124-9", e há banco que põe
 * agência ou operação na frente. Sem número de um dos lados, não dá para
 * conferir e não recusa.
 */
export function contaDoArquivoConfere(
  contaOfx: string | null,
  numeroCadastrado: string | null,
): boolean {
  const doArquivo = (contaOfx ?? "").replace(/\D/g, "");
  const doCadastro = (numeroCadastrado ?? "").replace(/\D/g, "");
  if (doArquivo === "" || doCadastro === "") return true;
  return doArquivo.endsWith(doCadastro) || doCadastro.endsWith(doArquivo);
}

/**
 * De qual conta é o arquivo (Bloco M): o banco (BANKID), a conta como o
 * banco escreveu (ACCTID) e só os dígitos dela, para comparar com o cadastro.
 */
export function contaDoArquivo(conteudo: string): {
  bankId: string | null;
  acctId: string | null;
  digitos: string;
} {
  const acctId = campo(conteudo, "ACCTID");
  return {
    bankId: campo(conteudo, "BANKID"),
    acctId,
    digitos: (acctId ?? "").replace(/\D/g, ""),
  };
}

/** Data ISO yyyy-MM-dd no formato que o Tiago lê: dd/MM/yyyy. */
function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Último dia do mês (1-based) de um ano/mês, contando bissexto. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Confere se o extrato cobre um MÊS FECHADO, do dia 1 ao último dia. É assim
 * que a conferência é feita: um arquivo que começa no meio do mês, ou que
 * atravessa a virada, deixa movimento de fora sem ninguém perceber — o extrato
 * do BB de janeiro/2026 vinha de 30/12/2025 a 31/01/2026, dois dias a mais.
 *
 * Devolve a frase do aviso, ou null quando está fechado. Não bloqueia a
 * importação: o arquivo pode ser o que o banco deu, e quem decide é quem
 * concilia.
 *
 * Só vale para período DECLARADO pelo arquivo (DTSTART/DTEND). Quando o
 * arquivo não declara, o período é deduzido das transações e não diz nada
 * sobre cobertura: um mês inteiro sem movimento no dia 1 pareceria incompleto.
 */
export function conferirMesFechado(
  inicio: string | null,
  fim: string | null,
): string | null {
  if (inicio === null || fim === null) {
    return "O arquivo não informa o período (DTSTART/DTEND), então não dá para conferir se ele cobre o mês inteiro. Confira no extrato do banco se falta movimento.";
  }

  const [anoInicio, mesInicio, diaInicio] = inicio.split("-").map(Number);
  const [anoFim, mesFim, diaFim] = fim.split("-").map(Number);

  if (anoInicio !== anoFim || mesInicio !== mesFim) {
    return `O arquivo vai de ${dataBr(inicio)} a ${dataBr(fim)}, que não é um mês fechado. Exporte do dia 1 ao último dia do mês.`;
  }

  const ultimo = ultimoDiaDoMes(anoInicio, mesInicio);
  if (diaInicio !== 1 || diaFim !== ultimo) {
    return `O arquivo cobre de ${dataBr(inicio)} a ${dataBr(fim)}, e o mês vai de 01 a ${String(ultimo).padStart(2, "0")}. Exporte do dia 1 ao último dia do mês.`;
  }

  return null;
}

/**
 * Converte os bytes do arquivo em texto respeitando o charset que o OFX declara.
 *
 * O BB manda OFX 1.x com `CHARSET:1252` (Windows-1252). Lido como UTF-8, todo
 * acento do histórico vira "�": "BB RENDE F�CIL", "TRANSFER�NCIA RECEBIDA" (foi
 * assim que os extratos importados até 02/10/2026 ficaram gravados). Regra:
 * cabeçalho dizendo 1252/ISO-8859-1 decodifica assim; sem declaração, tenta
 * UTF-8 estrito e, se o arquivo não for UTF-8 válido, cai para Windows-1252.
 */
export function decodificarOfx(bytes: ArrayBuffer | Uint8Array): string {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const cabecalho = new TextDecoder("latin1").decode(dados.subarray(0, 600));
  const declarado =
    /CHARSET:\s*(1252|ISO-?8859-?1|WINDOWS-?1252)/i.test(cabecalho) ||
    /encoding=["']?(windows-1252|iso-8859-1)/i.test(cabecalho);
  if (declarado) return new TextDecoder("windows-1252").decode(dados);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(dados);
  } catch {
    return new TextDecoder("windows-1252").decode(dados);
  }
}

/** Extrai o conteúdo de uma tag OFX (SGML ou XML): valor até a próxima tag. */
function campo(bloco: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Converte o valor de TRNAMT para number. O padrão OFX usa ponto como decimal
 * (1234.56), mas exportadores brasileiros às vezes mandam vírgula decimal e
 * ponto de milhar (1.234,56). Regras:
 * - Com vírgula: o ponto é milhar e a vírgula vira o decimal (1.234,56).
 * - Sem vírgula e com 2+ pontos: todos os pontos são milhar e não há decimal
 *   (1.234.567), então removemos os pontos.
 * - Sem vírgula e com no máximo 1 ponto: padrão OFX, o ponto é o decimal.
 * Devolve NaN para entrada inválida (a transação é então ignorada).
 */
function valorOfxParaNumero(bruto: string): number {
  const limpo = bruto.trim();
  if (limpo.includes(",")) {
    return Number(limpo.replace(/\./g, "").replace(",", "."));
  }
  // Sem vírgula: 2+ pontos só pode ser separador de milhar (sem casas decimais).
  if ((limpo.match(/\./g)?.length ?? 0) >= 2) {
    return Number(limpo.replace(/\./g, ""));
  }
  return Number(limpo);
}

/** Converte data OFX (yyyyMMdd com hora/fuso opcionais) para ISO yyyy-MM-dd. */
function dataOfxParaIso(valor: string | null): string | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Saldo final do extrato: o bloco LEDGERBAL com BALAMT e DTASOF. Caixa, BB e
 * Sicredi mandam igual no SGML (tags sem fechamento) e no XML; o bloco termina
 * no </LEDGERBAL> ou, no SGML sem fechamento, na próxima tag de bloco
 * (AVAILBAL, </STMTRS>).
 */
function lerSaldoFinal(conteudo: string): {
  valor: number | null;
  data: string | null;
} {
  const bloco = conteudo.match(
    /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i,
  );
  if (!bloco) return { valor: null, data: null };
  const bruto = campo(bloco[1], "BALAMT");
  const valor = bruto === null ? null : valorOfxParaNumero(bruto);
  return {
    valor: valor === null || Number.isNaN(valor) ? null : valor,
    data: dataOfxParaIso(campo(bloco[1], "DTASOF")),
  };
}

/** Lê o conteúdo de um arquivo OFX e retorna período e transações. */
export function parseOfx(conteudo: string): ExtratoOfx {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  // Fallback para arquivos SGML sem </STMTTRN>: divide pelos <STMTTRN>.
  const fonte =
    blocos.length > 0
      ? blocos
      : conteudo
          .split(/<STMTTRN>/i)
          .slice(1)
          .map((parte) => `<STMTTRN>${parte}`);

  const transacoes: TransacaoOfx[] = [];
  for (const bloco of fonte) {
    const valorBruto = campo(bloco, "TRNAMT");
    const dataIso = dataOfxParaIso(campo(bloco, "DTPOSTED"));
    if (valorBruto === null || dataIso === null) continue;

    const valor = valorOfxParaNumero(valorBruto);
    if (Number.isNaN(valor)) continue;

    transacoes.push({
      data: dataIso,
      valor,
      memo: campo(bloco, "MEMO") ?? campo(bloco, "NAME"),
      fitid: campo(bloco, "FITID"),
      tipo: valor >= 0 ? "credito" : "debito",
    });
  }

  // Período é INTERVALO, e intervalo não tem ordem: quando o exportador manda
  // DTSTART depois de DTEND, o que existe é um par trocado, não um período que
  // anda para trás. A Caixa mandou assim em 01/2025 e 02/2025, e o extrato foi
  // gravado com início 31/01 e fim 01/01. Normalizar aqui conserta a gravação e
  // a conferência de mês fechado de uma vez.
  const inicioBruto = dataOfxParaIso(campo(conteudo, "DTSTART"));
  const fimBruto = dataOfxParaIso(campo(conteudo, "DTEND"));
  const trocado =
    inicioBruto !== null && fimBruto !== null && inicioBruto > fimBruto;
  const saldo = lerSaldoFinal(conteudo);

  return {
    periodoInicio: trocado ? fimBruto : inicioBruto,
    periodoFim: trocado ? inicioBruto : fimBruto,
    contaOfx: campo(conteudo, "ACCTID"),
    saldoFinal: saldo.valor,
    saldoFinalData: saldo.data,
    transacoes,
  };
}

/**
 * Posição de cada movimento SEM FITID entre os iguais (mesma data, valor e
 * histórico) dentro do MESMO arquivo: 1, 2, 3... Vira parte da chave de
 * duplicidade. Sem isso, duas diárias de R$ 150,00 no mesmo dia para a mesma
 * pessoa viravam uma só e a segunda era descartada como "já importada".
 * Reimportar o mesmo arquivo continua deduplicando, porque as posições se
 * repetem.
 *
 * FITID só identifica quando é único no arquivo e não é só zeros. A Caixa
 * repete o FITID em movimentos diferentes (06/10/2026: "000000" em sete,
 * "374751" nos cinco consórcios do dia 15/09, "081108" no PIX e na tarifa
 * dele), e 11 dos 23 movimentos de setembro foram descartados como
 * repetidos. Nesses casos o movimento segue sem FITID, pela posição.
 */
export function numerarRepetidos<
  T extends {
    data: string;
    valor: number;
    memo: string | null;
    fitid: string | null;
  },
>(transacoes: readonly T[]): (T & { n: number | null })[] {
  const vezesDoFitid = new Map<string, number>();
  for (const t of transacoes) {
    if (t.fitid) vezesDoFitid.set(t.fitid, (vezesDoFitid.get(t.fitid) ?? 0) + 1);
  }
  const identifica = (fitid: string | null): fitid is string =>
    !!fitid && !/^0+$/.test(fitid) && vezesDoFitid.get(fitid) === 1;

  const contagem = new Map<string, number>();
  return transacoes.map((t) => {
    if (identifica(t.fitid)) return { ...t, n: null };
    const chave = `${t.data}|${t.valor.toFixed(2)}|${t.memo ?? ""}`;
    const n = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, n);
    return { ...t, fitid: null, n };
  });
}

/**
 * Arquivo que declara o período (DTSTART/DTEND) e não tem nenhum movimento
 * dentro dele: quase sempre é exportação errada (outro mês, filtro do banco).
 * Devolve a mensagem de recusa, ou null.
 */
export function conferirMovimentosNoPeriodo(
  extrato: ExtratoOfx,
): string | null {
  if (!extrato.periodoInicio || !extrato.periodoFim) return null;
  const dentro = extrato.transacoes.some(
    (t) => t.data >= extrato.periodoInicio! && t.data <= extrato.periodoFim!,
  );
  if (dentro) return null;
  return `O arquivo declara o período de ${dataBr(extrato.periodoInicio)} a ${dataBr(extrato.periodoFim)}, mas nenhum movimento cai nesse período. Confira se exportou o mês certo.`;
}

/** Último dia (ISO) do mês de uma data ISO. */
function fimDoMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, "0")}`;
}

/**
 * O intervalo que a importação sugere usar: o período do arquivo quando ele
 * já é um mês só; quando atravessa meses (o BB manda de 30/12 a 31/01), o mês
 * que o arquivo mais cobre, recortado ao arquivo. Empate fica com o mais
 * recente. Sem período declarado, as datas dos próprios movimentos.
 */
export function sugerirIntervalo(extrato: ExtratoOfx): { de: string; ate: string } | null {
  const datas = extrato.transacoes.map((t) => t.data).sort();
  const inicio = extrato.periodoInicio ?? datas[0];
  const fim = extrato.periodoFim ?? datas[datas.length - 1];
  if (!inicio || !fim) return null;
  if (inicio.slice(0, 7) === fim.slice(0, 7)) return { de: inicio, ate: fim };

  let melhor = { de: inicio, ate: fim, dias: -1 };
  let cursor = `${inicio.slice(0, 7)}-01`;
  while (cursor <= fim) {
    const de = cursor < inicio ? inicio : cursor;
    const fimMes = fimDoMes(cursor);
    const ate = fimMes > fim ? fim : fimMes;
    const dias = Number(ate.slice(8, 10)) - Number(de.slice(8, 10)) + 1;
    if (dias >= melhor.dias) melhor = { de, ate, dias };
    const [ano, mes] = cursor.split("-").map(Number);
    cursor = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  }
  return { de: melhor.de, ate: melhor.ate };
}

/**
 * O extrato recortado ao intervalo escolhido na importação: só os movimentos
 * de `de` a `ate`, e o período passa a ser o intervalo. O saldo final do
 * arquivo só vale se o intervalo termina no último dia do arquivo: o saldo é
 * o do fim do extrato, e num recorte que para antes ele não confere.
 */
export function recortarExtrato(extrato: ExtratoOfx, de: string, ate: string): ExtratoOfx {
  const fimDoArquivo =
    extrato.periodoFim ?? extrato.transacoes.map((t) => t.data).sort().at(-1) ?? null;
  const saldoVale = fimDoArquivo !== null && ate >= fimDoArquivo;
  return {
    ...extrato,
    periodoInicio: de,
    periodoFim: ate,
    saldoFinal: saldoVale ? extrato.saldoFinal : null,
    saldoFinalData: saldoVale ? extrato.saldoFinalData : null,
    transacoes: extrato.transacoes.filter((t) => t.data >= de && t.data <= ate),
  };
}
