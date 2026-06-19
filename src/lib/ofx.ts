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
  transacoes: TransacaoOfx[];
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
 * ponto de milhar (1.234,56). Detecta pela presença da vírgula: se houver, o
 * ponto é milhar e a vírgula vira o decimal; sem vírgula, segue o padrão OFX.
 * Devolve NaN para entrada inválida (a transação é então ignorada).
 */
function valorOfxParaNumero(bruto: string): number {
  const limpo = bruto.trim();
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  return Number(normalizado);
}

/** Converte data OFX (yyyyMMdd com hora/fuso opcionais) para ISO yyyy-MM-dd. */
function dataOfxParaIso(valor: string | null): string | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
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

  return {
    periodoInicio: dataOfxParaIso(campo(conteudo, "DTSTART")),
    periodoFim: dataOfxParaIso(campo(conteudo, "DTEND")),
    transacoes,
  };
}
