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
