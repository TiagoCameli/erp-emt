import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import {
  observacoesSchema,
  paraLitros,
  TETO_NUMERIC_14_4,
} from "@/modules/combustivel/transferencias/schemas";

/**
 * Cadastro de tanque. Só as colunas que o grant deixa gravar: nome, apelido,
 * capacidade, externo, proprietário, observações e ativo. Nível e combustível
 * atuais são cache do gatilho e a tela nunca escreve.
 *
 * Externo = tanque de terceiro (Transterra/Areacre, Posto Progresso): tem dono,
 * não tem estoque. O banco exige `eh_externo = (proprietario_id is not null)`,
 * e os dois schemas dizem o mesmo antes de chegar lá.
 */

const MENSAGEM_CAPACIDADE = `Informe a capacidade em litros, zero ou mais, com até ${CASAS_TAXA} casas`;
const MENSAGEM_DONO = "Selecione o dono do tanque de terceiro";

// Como a origem (e o CHECK tanques_nome_nao_vazio): só não pode ser vazio.
const nomeSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o nome do tanque" })
  .max(120, { error: "O nome pode ter no máximo 120 caracteres" });

const apelidoSchema = z.string().trim().max(60, { error: "O apelido pode ter no máximo 60 caracteres" });

/** Casas decimais de um número pela sua representação. */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  if (texto.includes("e")) return Number.POSITIVE_INFINITY;
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/** Capacidade na action: zero (sem trava de capacidade) ou mais, até 4 casas. */
export const capacidadeNumero = z
  .number({ error: MENSAGEM_CAPACIDADE })
  .min(0, { error: MENSAGEM_CAPACIDADE })
  .max(TETO_NUMERIC_14_4, { error: "Capacidade acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, { error: MENSAGEM_CAPACIDADE });

/** Texto da capacidade em número, ou null se não for válido. */
export function capacidadeParaNumero(texto: string): number | null {
  const numero = paraLitros(texto);
  if (numero === null || numero < 0 || numero > TETO_NUMERIC_14_4) return null;
  return numero;
}

export const tanqueFormSchema = z
  .object({
    nome: nomeSchema,
    apelido: apelidoSchema,
    capacidade: z.string().trim().refine((valor) => capacidadeParaNumero(valor) !== null, {
      error: MENSAGEM_CAPACIDADE,
    }),
    ehExterno: z.boolean(),
    proprietarioId: z.string().trim(),
    observacoes: observacoesSchema,
    ativo: z.boolean(),
  })
  .superRefine((dados, contexto) => {
    if (!dados.ehExterno) return;
    if (!z.guid().safeParse(dados.proprietarioId).success) {
      contexto.addIssue({ code: "custom", path: ["proprietarioId"], message: MENSAGEM_DONO });
    }
  });

export type TanqueFormInput = z.infer<typeof tanqueFormSchema>;

/** O que a action grava. `proprietarioId` só existe no tanque externo. */
export const tanqueSchema = z
  .object({
    nome: nomeSchema,
    apelido: apelidoSchema,
    capacidade: capacidadeNumero,
    ehExterno: z.boolean(),
    proprietarioId: z.guid({ error: MENSAGEM_DONO }).nullable(),
    observacoes: observacoesSchema,
    ativo: z.boolean(),
  })
  .refine((dados) => dados.ehExterno === (dados.proprietarioId !== null), {
    error: MENSAGEM_DONO,
    path: ["proprietarioId"],
  });

export type TanqueInput = z.infer<typeof tanqueSchema>;

/** Formulário validado para o contrato da action. Tanque da EMT perde o dono. */
export function tanqueDoForm(form: TanqueFormInput): TanqueInput {
  return {
    nome: form.nome.trim(),
    apelido: form.apelido.trim(),
    capacidade: capacidadeParaNumero(form.capacidade) ?? Number.NaN,
    ehExterno: form.ehExterno,
    proprietarioId: form.ehExterno && form.proprietarioId !== "" ? form.proprietarioId : null,
    observacoes: form.observacoes.trim(),
    ativo: form.ativo,
  };
}

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------

/**
 * Cabeçalho do modelo, na ordem da planilha. A action lê pelos mesmos rótulos.
 *
 * Não há coluna "Externo": o banco amarra externo ao dono, então a planilha
 * pergunta só o dono. Preenchido, o tanque é de terceiro; vazio, é da EMT. Duas
 * colunas deixariam a pessoa escrever "Não" com dono, e a linha seria recusada
 * por uma contradição que a própria planilha criou.
 */
export const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Tanque Comboio 01" },
  { rotulo: "Apelido", exemplo: "Comboio" },
  { rotulo: "Capacidade (L)", exemplo: "15000" },
  { rotulo: "Dono (tanque de terceiro)", exemplo: "" },
  { rotulo: "Observações", exemplo: "" },
] as const;

/**
 * Capacidade lida da planilha: número da célula ou texto pt-BR. Vazio é 0 (sem
 * trava de capacidade). Inválido lança, e a linha é recusada na prévia.
 */
export function capacidadeDaPlanilha(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") {
    const conferido = capacidadeNumero.safeParse(valor);
    if (!conferido.success) throw new Error(MENSAGEM_CAPACIDADE.toLowerCase());
    return valor;
  }
  const numero = capacidadeParaNumero(String(valor));
  if (numero === null) throw new Error(MENSAGEM_CAPACIDADE.toLowerCase());
  return numero;
}

/** Só os dígitos (CNPJ/CPF). */
export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** Chave de comparação de nome: minúscula, sem acento, espaços colapsados. */
export function chaveNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface FornecedorParaCasar {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string | null;
}

/**
 * Casa o dono escrito na planilha com o cadastro de fornecedores. Aceita o
 * CNPJ/CPF (com ou sem pontuação) ou o nome (razão social ou fantasia),
 * normalizando os dois lados. Só aceita casamento único: dois fornecedores com
 * o mesmo nome é ambíguo e a linha pede o CNPJ.
 */
export function casarDono(
  texto: string,
  fornecedores: readonly FornecedorParaCasar[],
): { id: string } | { erro: string } {
  const digitos = soDigitos(texto);
  if (digitos.length >= 11) {
    const achados = fornecedores.filter((f) => f.cnpjCpf && soDigitos(f.cnpjCpf) === digitos);
    if (achados.length === 1) return { id: achados[0]!.id };
    if (achados.length > 1) return { erro: "mais de um fornecedor com este CNPJ/CPF" };
    return { erro: "nenhum fornecedor ativo com este CNPJ/CPF" };
  }
  const chave = chaveNome(texto);
  const achados = fornecedores.filter(
    (f) => chaveNome(f.razaoSocial) === chave || (f.nomeFantasia !== null && chaveNome(f.nomeFantasia) === chave),
  );
  if (achados.length === 1) return { id: achados[0]!.id };
  if (achados.length > 1) return { erro: "mais de um fornecedor com este nome; use o CNPJ" };
  return { erro: "nenhum fornecedor ativo com este nome; use o CNPJ ou cadastre o fornecedor" };
}
