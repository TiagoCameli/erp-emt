import { permanentRedirect } from "next/navigation";

/**
 * A aba de Férias virou "13º e Férias" em 12/09/2026, e a rota mudou junto
 * com o recurso (`rh.ferias` -> `rh.decimo-terceiro-ferias`).
 *
 * O redirect fica: existe link salvo para cá no navegador das pessoas, e a
 * ficha do colaborador e o painel de alertas apontavam para esta rota.
 * `permanentRedirect` (308) em vez de 307 porque a mudança não volta atrás.
 */
export default function FeriasRotaAntiga(): never {
  permanentRedirect("/rh/decimo-terceiro-e-ferias");
}
