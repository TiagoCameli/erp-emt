/**
 * Chave de comparação de nome: minúsculo, sem acento, espaços colapsados.
 *
 * Espelha a `fn_chave_nome(text)` do banco, criada na migration
 * 20260804140000 para o casamento de fornecedor e categoria da importação
 * BR-364. Existe em TS porque a importação de centros de custo casa em memória
 * (o supabase-js não abre transação, então a resolução acontece antes de gravar).
 *
 * Motivo de existir: os centros de sistema passaram a ter grafia correta
 * ("Escritório Central", "Manutenção de equipamentos"). Sem normalizar acento,
 * toda planilha antiga escrita "Escritorio Central" passaria a ser recusada.
 * Grafia correta não deve custar compatibilidade.
 */
export function chaveNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
