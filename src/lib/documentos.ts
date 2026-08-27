/**
 * Normalização e validação de CNPJ/CPF. Módulo puro (sem "use server" e
 * sem "server-only"): pode ser usado tanto por Server Actions e pelo
 * framework de importação quanto por schemas de formulário no cliente.
 */

/** Remove tudo que não é dígito do valor informado. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Aplica a máscara de CNPJ (14 dígitos → 00.000.000/0000-00) ou de CPF
 * (11 dígitos → 000.000.000-00). Quando a contagem de dígitos não bate,
 * devolve o valor original com trim — não força uma máscara sobre um
 * documento parcial ou estrangeiro.
 */
export function formatarCnpjCpf(valor: string): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 14) {
    return digitos.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  if (digitos.length === 11) {
    return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return valor.trim();
}

/**
 * Valida CNPJ/CPF como campo opcional: string vazia ou só espaços é
 * considerada válida. Caso contrário exige exatamente 11 (CPF) ou 14
 * (CNPJ) dígitos — sem checar o dígito verificador, apenas a contagem.
 */
export function validarCnpjCpf(valor: string): boolean {
  if (valor.trim() === "") return true;
  const quantidade = apenasDigitos(valor).length;
  return quantidade === 11 || quantidade === 14;
}

/**
 * Valida CPF de PESSOA como campo opcional: vazio é válido, senão exige
 * exatamente 11 dígitos.
 *
 * Existe ao lado de `validarCnpjCpf` (que aceita 11 ou 14) porque em campo de
 * pessoa o CNPJ não é uma alternativa válida: 14 dígitos ali é erro de digitação
 * ou campo trocado, e aceitar calado grava um CNPJ na coluna de CPF.
 *
 * Sem dígito verificador, pela mesma razão de `validarCnpjCpf`: a contagem pega
 * o erro comum (faltou um número) e não recusa documento que a pessoa tem na
 * mão.
 */
export function validarCpf(valor: string): boolean {
  if (valor.trim() === "") return true;
  return apenasDigitos(valor).length === 11;
}

/**
 * Aplica a máscara de telefone brasileiro: 11 dígitos viram
 * (00) 00000-0000 (celular com nono dígito) e 10 dígitos viram
 * (00) 0000-0000 (fixo). Fora dessas contagens, devolve o valor com trim.
 *
 * O DDD é obrigatório de propósito: número sem DDD não se liga de outro estado,
 * e metade da equipe está em obra fora de Rio Branco.
 */
export function formatarTelefone(valor: string): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) {
    return digitos.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }
  if (digitos.length === 10) {
    return digitos.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  return valor.trim();
}

/** Telefone opcional: vazio é válido, senão exige 10 (fixo) ou 11 (celular). */
export function validarTelefone(valor: string): boolean {
  if (valor.trim() === "") return true;
  const quantidade = apenasDigitos(valor).length;
  return quantidade === 10 || quantidade === 11;
}

/** Máscara de CEP: 8 dígitos viram 00000-000. Fora disso, valor com trim. */
export function formatarCep(valor: string): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 8) {
    return digitos.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  }
  return valor.trim();
}

/** CEP opcional: vazio é válido, senão exige exatamente 8 dígitos. */
export function validarCep(valor: string): boolean {
  if (valor.trim() === "") return true;
  return apenasDigitos(valor).length === 8;
}
