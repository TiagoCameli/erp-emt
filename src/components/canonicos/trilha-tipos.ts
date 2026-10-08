// Tipos da trilha num arquivo sem "use client": queries e Server Actions
// montam eventos no servidor e não podem alcançar o componente (trilha.tsx).
export type TipoEventoTrilha =
  | "criacao"
  | "edicao"
  | "aprovacao"
  | "rejeicao"
  | "desaprovacao"
  | "exclusao"
  | "restauracao"
  | "documento"
  | "outro";

export interface EventoTrilha {
  id: string;
  data: string | Date;
  titulo: string;
  descricao?: string;
  usuario?: string;
  tipo: TipoEventoTrilha;
  href?: string;
}
