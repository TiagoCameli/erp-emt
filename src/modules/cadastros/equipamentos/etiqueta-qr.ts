/**
 * O endereço que o QR da etiqueta de equipamento carrega.
 *
 * MÓDULO PURO: não lê `process.env` nem fala com o banco. Quem lê a variável é
 * a Server Action, e passa o valor para cá. Separado assim para o formato do
 * link ficar preso em teste: a etiqueta vai colada no equipamento e fica lá
 * por anos, então o link impresso hoje tem que continuar abrindo a tela certa.
 * Mudar este formato depois de imprimir é reimprimir a frota inteira.
 */

/**
 * Teto de equipamentos escolhidos numa geração. A frota inteira cabe folgada.
 * Mora aqui, e não no arquivo da action, porque arquivo "use server" só pode
 * exportar função async.
 */
export const MAX_ETIQUETAS = 500;

/** Caminho da tela de campo do equipamento, sem a base. */
export const CAMINHO_EQUIPAMENTO_CAMPO = "/m/equipamento";

/**
 * Normaliza a URL pública do app (`NEXT_PUBLIC_SITE_URL`).
 *
 * Devolve `null` quando ela não serve para ir num QR: vazia, sem `http(s)://`
 * ou que não é URL. Uma etiqueta com link quebrado só é descoberta no pátio,
 * com o celular na mão, então é melhor recusar gerar do que imprimir errado.
 * A barra final sai, para o link não ficar com `//m/equipamento`.
 */
export function basePublica(valor: string | undefined | null): string | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  return texto.replace(/\/+$/, "");
}

/** O link que o QR da etiqueta de um equipamento abre. */
export function urlDoEquipamento(base: string, id: string): string {
  const semBarra = base.trim().replace(/\/+$/, "");
  return `${semBarra}${CAMINHO_EQUIPAMENTO_CAMPO}/${encodeURIComponent(id)}`;
}
