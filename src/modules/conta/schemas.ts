/**
 * Schema de domínio do perfil do próprio usuário ("Minha conta").
 *
 * Módulo puro (sem "use server" e sem "server-only"): a Server Action valida com
 * ele antes de chamar a RPC, e a tela reusa as listas e os validadores.
 *
 * ONDE A VALIDAÇÃO MORA, e por que em dois lugares:
 *   - AQUI, para a pessoa ler "O celular precisa ter DDD e 10 ou 11 dígitos" em
 *     vez de esperar a ida ao servidor;
 *   - em `fn_salvar_meu_perfil`, que é a última barreira e repete a mesma regra,
 *     porque é ela que a RLS protege e é por ela que qualquer outro caminho
 *     futuro vai passar.
 * As mensagens são as MESMAS nos dois lados de propósito: mensagem diferente para
 * a mesma recusa faz parecer que são dois problemas.
 *
 * A NORMALIZAÇÃO (máscara fora, dígito dentro) também acontece nos dois. O banco
 * guarda dígitos: com máscara gravada, o mesmo celular entra como
 * "(68) 99999-1234" e como "68999991234" e nenhuma busca acha os dois.
 */

import { z } from "zod";

import { dataHojeISO } from "@/lib/formatadores";
import {
  apenasDigitos,
  validarCep,
  validarCpf,
  validarTelefone,
} from "@/lib/documentos";

/** As 27 unidades federativas, na ordem alfabética da sigla. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

export type Uf = (typeof UFS)[number];

/** Tetos de texto. Os mesmos números dos CHECKs da migration 20260827100000. */
export const MAX_CARGO = 60;
export const MAX_RAMAL = 20;
export const MAX_RG = 20;
export const MAX_LOGRADOURO = 120;
export const MAX_NUMERO = 20;
export const MAX_COMPLEMENTO = 60;
export const MAX_BAIRRO = 60;
export const MAX_CIDADE = 60;

/**
 * Texto opcional: apara, e vazio vira null. Mesmo padrão de
 * `cadastros/colaboradores/schemas.ts`.
 *
 * O `trim` do Zod corta os brancos que o `btrim(x, E' \t\r\n')` do banco corta,
 * então uma linha feita só de espaço e quebra de linha chega como null nos dois
 * — e não como uma string "preenchida" com nada dentro, que na tela desenha
 * campo cheio e vazio ao mesmo tempo.
 */
function textoOpcional(max: number, nomeDoCampo: string) {
  return z
    .string()
    .trim()
    .max(max, { error: `${nomeDoCampo} aceita no máximo ${max} caracteres` })
    .transform((valor) => (valor === "" ? null : valor))
    .nullable();
}

/** Só os dígitos, e vazio vira null. Para celular, CPF e CEP. */
function digitosOpcionais() {
  return z
    .string()
    .transform((valor) => apenasDigitos(valor))
    .transform((valor) => (valor === "" ? null : valor))
    .nullable();
}

/**
 * Data de nascimento: "" vira null, e o futuro é recusado.
 *
 * "Hoje" é o de Rio Branco (`dataHojeISO`), não o de UTC. À noite UTC já é
 * amanhã aqui, e comparar contra a data UTC recusaria um nascimento de hoje —
 * caso raro, mas a mesma troca de fuso é o que faz a comparação errar em
 * qualquer data quando o servidor roda em outro lugar.
 *
 * O piso de 1900 é o mesmo da constraint: data de nascimento antes disso é
 * dedo escorregando no ano, não bisavô.
 */
const dataNascimentoSchema = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable()
  .refine((valor) => valor === null || /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Data de nascimento inválida",
  })
  .refine((valor) => valor === null || valor <= dataHojeISO(), {
    error: "A data de nascimento não pode ser no futuro",
  })
  .refine((valor) => valor === null || valor >= "1900-01-01", {
    error: "Confira o ano da data de nascimento",
  });

/** Payload que a Server Action aceita e manda para `fn_salvar_meu_perfil`. */
export const perfilSchema = z.object({
  celular: digitosOpcionais().refine(
    (valor) => valor === null || validarTelefone(valor),
    { error: "O celular precisa ter DDD e 10 ou 11 dígitos" },
  ),
  dataNascimento: dataNascimentoSchema,
  cargo: textoOpcional(MAX_CARGO, "O cargo"),
  ramal: textoOpcional(MAX_RAMAL, "O ramal"),
  cpf: digitosOpcionais().refine(
    (valor) => valor === null || validarCpf(valor),
    { error: "O CPF precisa ter 11 dígitos" },
  ),
  rg: textoOpcional(MAX_RG, "O RG"),
  enderecoCep: digitosOpcionais().refine(
    (valor) => valor === null || validarCep(valor),
    { error: "O CEP precisa ter 8 dígitos" },
  ),
  enderecoLogradouro: textoOpcional(MAX_LOGRADOURO, "O logradouro"),
  enderecoNumero: textoOpcional(MAX_NUMERO, "O número"),
  enderecoComplemento: textoOpcional(MAX_COMPLEMENTO, "O complemento"),
  enderecoBairro: textoOpcional(MAX_BAIRRO, "O bairro"),
  enderecoCidade: textoOpcional(MAX_CIDADE, "A cidade"),
  /**
   * UF em maiúscula antes de validar: quem digita "ac" está informando o Acre, e
   * recusar por causa da caixa é implicância. O `enum` continua sendo a trava —
   * a mesma lista do CHECK do banco.
   */
  enderecoUf: z
    .string()
    .trim()
    .transform((valor) => valor.toUpperCase())
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()
    .refine((valor) => valor === null || (UFS as readonly string[]).includes(valor), {
      error: "UF inválida",
    }),
});

export type PerfilInput = z.infer<typeof perfilSchema>;
