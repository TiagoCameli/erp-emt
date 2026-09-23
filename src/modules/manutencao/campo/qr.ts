/**
 * O que um QR lido aponta. Módulo puro.
 *
 * - Etiqueta nova do ERP: `<qualquer host>/m/equipamento/<uuid>`.
 * - Adesivo antigo do Gestão Obras: `<qualquer host>/m/eq/<id de lá>`. O host é ignorado
 *   de propósito: 57 adesivos saíram com `localhost` e só o leitor de dentro do app os
 *   salva (a câmera do celular abre um endereço que não existe).
 * - Texto solto: uuid é equipamento do ERP; outro id curto é tentado como id antigo.
 */
export type DestinoQr = { tipo: "equipamento"; id: string } | { tipo: "legado"; id: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NOVO = new RegExp(`/m/equipamento/(${UUID})(?:[/?#]|$)`, "i");
const ANTIGO = /\/m\/eq\/([a-z0-9-]{4,64})(?:[/?#]|$)/i;
const SO_UUID = new RegExp(`^${UUID}$`, "i");
const SO_ID_ANTIGO = /^[a-z0-9-]{4,64}$/i;

export function destinoDoQr(texto: string): DestinoQr | null {
  const limpo = texto.trim();
  if (limpo === "") return null;

  const novo = NOVO.exec(limpo);
  if (novo) return { tipo: "equipamento", id: novo[1]!.toLowerCase() };

  const antigo = ANTIGO.exec(limpo);
  if (antigo) return { tipo: "legado", id: decodeURIComponent(antigo[1]!) };

  if (SO_UUID.test(limpo)) return { tipo: "equipamento", id: limpo.toLowerCase() };
  if (SO_ID_ANTIGO.test(limpo)) return { tipo: "legado", id: limpo };
  return null;
}

/** Rota da tela de campo para o destino lido. */
export function rotaDoDestino(destino: DestinoQr): string {
  return destino.tipo === "equipamento"
    ? `/m/equipamento/${destino.id}`
    : `/m/eq/${encodeURIComponent(destino.id)}`;
}
