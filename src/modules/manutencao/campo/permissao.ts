import { RECURSOS } from "@/config/recursos";
import { temPermissao, type UsuarioLogado } from "@/lib/permissoes";

function veModulo(usuario: UsuarioLogado | null, modulo: string): boolean {
  return RECURSOS.some((recurso) => recurso.modulo === modulo && temPermissao(usuario, recurso.id, "ver"));
}

/**
 * Quem abre a tela do QR: quem vê alguma aba da Manutenção ou do Combustível. É o mesmo
 * corte da `fn_ve_manutencao()` e da `fn_ve_combustivel()` do banco, que liberam ler
 * equipamento, centro e ficha técnica. O frentista que só abastece também usa o QR.
 */
export function veManutencao(usuario: UsuarioLogado | null): boolean {
  return veModulo(usuario, "manutencao") || veModulo(usuario, "combustivel");
}

export interface PermissoesCampo {
  lancarLeitura: boolean;
  abrirOs: boolean;
  abastecer: boolean;
}

export function permissoesCampo(usuario: UsuarioLogado | null): PermissoesCampo {
  return {
    lancarLeitura: temPermissao(usuario, "manutencao.medicoes", "criar"),
    abrirOs: temPermissao(usuario, "manutencao.servicos", "criar"),
    abastecer: temPermissao(usuario, "combustivel.saidas", "criar"),
  };
}
