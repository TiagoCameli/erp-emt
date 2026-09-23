import type { ErroDeBanco } from "@/lib/erros-banco";
import { formatarQuantidade } from "@/lib/formatadores";
import { ROTULO_STATUS_OS, STATUS_OS, type StatusOs } from "@/modules/manutencao/_shared/rotulos";

/**
 * Erro das RPCs da OS em frase que a pessoa entende.
 *
 * As RPCs levantam `raise exception` em português (P0001), e a maioria das
 * mensagens já diz o que fazer ("Informe o motivo para reabrir"). Três casos
 * pedem reescrita:
 *
 * - saldo insuficiente, que chega com os números crus do Postgres
 *   ("disponível 2.0000, pedido 3");
 * - "OS concluida não pode ser editada: reabra antes", que traz o status sem
 *   acento e, para a cancelada, manda reabrir o que não reabre;
 * - permissão negada pelo grant ou pela RLS (42501), cujo texto é técnico.
 *
 * Qualquer outro código (conexão, RLS, erro inesperado) cai no `fallback`: texto
 * do Postgres fora do `raise` nosso não vai para a tela.
 *
 * Módulo puro, testado em erros.test.ts.
 */

const RAISE_EXCEPTION = "P0001";
const PERMISSAO_NEGADA = "42501";

const NUMERO = "(-?\\d+(?:\\.\\d+)?)";
const SALDO_COM_NUMEROS = new RegExp(`dispon[ií]vel\\s+${NUMERO},\\s*pedido\\s+${NUMERO}`, "i");
const STATUS_NA_MENSAGEM = /OS\s+([a-z_]+)\s+n[ãa]o\s+(?:pode ser editada|aceita linha nova)/i;

function statusConhecido(valor: string): valor is StatusOs {
  return (STATUS_OS as readonly string[]).includes(valor);
}

export function traduzirErroOs(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if (!erro) return fallback;
  const mensagem = erro.message ?? "";

  if (erro.code === PERMISSAO_NEGADA) {
    return "Você não tem permissão para esta ação na ordem de serviço";
  }

  if (/saldo insuficiente/i.test(mensagem)) {
    const numeros = SALDO_COM_NUMEROS.exec(mensagem);
    if (numeros) {
      const disponivel = formatarQuantidade(Number(numeros[1]));
      const pedido = formatarQuantidade(Number(numeros[2]));
      return `Saldo insuficiente no almoxarifado: há ${disponivel} disponível e foram pedidos ${pedido}. Registre a entrada no almoxarifado ou diminua a quantidade`;
    }
    return "Saldo insuficiente no almoxarifado: a operação deixaria o saldo desta peça negativo";
  }

  if (/reabra antes/i.test(mensagem)) {
    const achado = STATUS_NA_MENSAGEM.exec(mensagem);
    const status = achado && statusConhecido(achado[1]) ? achado[1] : null;
    if (status === "cancelada") {
      return "A OS está cancelada e não aceita alteração";
    }
    if (status) {
      return `A OS está ${ROTULO_STATUS_OS[status].toLowerCase()} e não aceita alteração: reabra a OS antes`;
    }
    return "A OS não aceita alteração neste status: reabra a OS antes";
  }

  if (erro.code === RAISE_EXCEPTION && mensagem) return mensagem;
  return fallback;
}
