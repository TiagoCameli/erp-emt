/**
 * Relatório "Sócios e ligadas" (PR 2 do controle total, D3 e D4 de 09/10/2026).
 *
 * Uma linha por centro raiz de tipo `socio` ou `empresa_ligada`: o que foi
 * enviado (rateios a pagar), o que voltou (a receber) e o saldo. Para sócio, o
 * enviado é a distribuição; para empresa ligada, o saldo é o mútuo em aberto.
 * O cálculo mora em `fn_rel_socios_ligadas`; aqui só o formato.
 */
export interface SocioLigadaLinha {
  centroId: string;
  centro: string;
  tipo: "socio" | "empresa_ligada";
  ativo: boolean;
  enviado: number;
  devolvido: number;
  saldo: number;
}

export const ROTULO_TIPO_SOCIO_LIGADA: Record<SocioLigadaLinha["tipo"], string> = {
  socio: "Sócio",
  empresa_ligada: "Empresa ligada",
};
