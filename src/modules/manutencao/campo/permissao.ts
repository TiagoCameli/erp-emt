import { RECURSOS } from "@/config/recursos";
import { temPermissao, type UsuarioLogado } from "@/lib/permissoes";

/**
 * Quem abre a tela do QR: quem vê alguma aba da Manutenção. É o mesmo corte da
 * `fn_ve_manutencao()` do banco, que libera ler equipamento, centro e ficha técnica.
 */
export function veManutencao(usuario: UsuarioLogado | null): boolean {
  return RECURSOS.some(
    (recurso) => recurso.modulo === "manutencao" && temPermissao(usuario, recurso.id, "ver"),
  );
}

export interface PermissoesCampo {
  lancarLeitura: boolean;
  abrirOs: boolean;
}

export function permissoesCampo(usuario: UsuarioLogado | null): PermissoesCampo {
  return {
    lancarLeitura: temPermissao(usuario, "manutencao.medicoes", "criar"),
    abrirOs: temPermissao(usuario, "manutencao.servicos", "criar"),
  };
}
