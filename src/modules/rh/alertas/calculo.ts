/**
 * Regras puras do painel de alertas de RH. Sem React, sem Supabase.
 *
 * A `situacao` de documentos e de férias já é calculada e testada nas fontes
 * (`rh/documentos/queries` e `rh/ferias/queries`) — aqui só traduzimos essa
 * situação em urgência visual (crítico/aviso) e resolvemos a regra de
 * cadastro incompleto (salário/dados bancários faltando).
 */
import type { SituacaoDocumento } from "@/modules/rh/documentos/queries";
import type { SituacaoFerias } from "@/modules/rh/ferias/queries";

/** Nível de urgência visual de um alerta: crítico (vermelho) ou aviso (âmbar). */
export type Urgencia = "critico" | "aviso";

/**
 * Urgência de um documento a partir da situação já calculada:
 * vencido é crítico, a_vencer é aviso, os demais não geram alerta.
 */
export function urgenciaDocumento(situacao: SituacaoDocumento): Urgencia | null {
  if (situacao === "vencido") return "critico";
  if (situacao === "a_vencer") return "aviso";
  return null;
}

/**
 * Urgência de férias a partir da situação já calculada:
 * vencida é crítico, a_vencer é aviso, os demais não geram alerta.
 */
export function urgenciaFerias(situacao: SituacaoFerias): Urgencia | null {
  if (situacao === "vencida") return "critico";
  if (situacao === "a_vencer") return "aviso";
  return null;
}

/** Colaborador mínimo para checar cadastro incompleto (salário/dados bancários). */
export interface ColaboradorCadastro {
  ativo: boolean;
  vinculo: string;
  salario: number | null;
  banco: string | null;
  chavePix: string | null;
}

/** Resultado da checagem de cadastro incompleto. */
export interface CadastroFaltando {
  semSalario: boolean;
  semBanco: boolean;
}

/**
 * Vínculos que entram na folha por salário mensal. `fn_gerar_folha` faz o
 * loop de geração de folha só `where ativo and vinculo = 'clt'` — diarista
 * (valor_diaria) e terceiro não entram por salário. Não é regra fiscal
 * inventada, é o que a folha realmente processa.
 */
const VINCULOS_FOLHA_SALARIO = ["clt"] as const;

/**
 * Cadastro incompleto de um colaborador ativo:
 * - semSalario: ativo, vínculo CLT (o único que entra na folha por salário
 *   mensal — ver `VINCULOS_FOLHA_SALARIO`) e sem salário registrado (null ou
 *   zero). Diarista e terceiro nunca acusam semSalario.
 * - semBanco: ativo e sem nenhum meio de recebimento (nem banco, nem chave
 *   Pix), qualquer vínculo.
 * Colaborador inativo nunca acusa (não é alerta de quem já saiu).
 */
export function cadastroFaltando(c: ColaboradorCadastro): CadastroFaltando {
  if (!c.ativo) return { semSalario: false, semBanco: false };

  const semSalario =
    (VINCULOS_FOLHA_SALARIO as readonly string[]).includes(c.vinculo) &&
    (c.salario == null || c.salario === 0);
  const semBanco = !c.banco && !c.chavePix;

  return { semSalario, semBanco };
}

/** Contagem de alertas por urgência, ignorando entradas nulas (sem alerta). */
export interface ContagemUrgencia {
  critico: number;
  aviso: number;
  total: number;
}

/** Conta quantos itens são críticos e quantos são aviso, e o total (soma). */
export function contarPorUrgencia(urgencias: (Urgencia | null)[]): ContagemUrgencia {
  let critico = 0;
  let aviso = 0;

  for (const urgencia of urgencias) {
    if (urgencia === "critico") critico += 1;
    else if (urgencia === "aviso") aviso += 1;
  }

  return { critico, aviso, total: critico + aviso };
}

/**
 * Cor do KPICard a partir da contagem: havendo qualquer crítico, o card é
 * crítico (mesmo com avisos também); sem crítico mas com aviso, é aviso;
 * sem nenhum dos dois, é neutro.
 */
export function corKpi(contagem: {
  critico: number;
  aviso: number;
}): "critico" | "aviso" | "neutro" {
  if (contagem.critico > 0) return "critico";
  if (contagem.aviso > 0) return "aviso";
  return "neutro";
}
