import Link from "next/link";

import { formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

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

const COR_PONTO: Record<TipoEventoTrilha, string> = {
  criacao: "bg-status-rascunho",
  edicao: "bg-faixa",
  aprovacao: "bg-status-aprovado",
  rejeicao: "bg-status-rejeitado",
  desaprovacao: "bg-status-rejeitado",
  exclusao: "bg-status-rejeitado",
  restauracao: "bg-status-aprovado",
  documento: "bg-primary",
  outro: "bg-status-rascunho",
};

function emMilissegundos(data: string | Date): number {
  const d = typeof data === "string" ? new Date(data) : data;
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function Trilha({ eventos }: { eventos: EventoTrilha[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-detalhe text-muted-foreground">
        Sem eventos registrados
      </p>
    );
  }

  const ordenados = [...eventos].sort(
    (a, b) => emMilissegundos(b.data) - emMilissegundos(a.data),
  );

  return (
    <ol>
      {ordenados.map((evento) => {
        const dataHora = formatarDataHora(evento.data);
        const rodape = evento.usuario
          ? `${evento.usuario} · ${dataHora}`
          : dataHora;

        return (
          <li
            key={evento.id}
            className="relative border-l border-border pb-5 pl-5 last:border-l-transparent last:pb-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-2 ring-background",
                COR_PONTO[evento.tipo],
              )}
            />
            {evento.href ? (
              <Link
                href={evento.href}
                className="text-detalhe font-medium text-foreground hover:underline"
              >
                {evento.titulo}
              </Link>
            ) : (
              <p className="text-detalhe font-medium text-foreground">
                {evento.titulo}
              </p>
            )}
            {evento.descricao ? (
              <p className="text-detalhe text-muted-foreground">
                {evento.descricao}
              </p>
            ) : null}
            <p className="mt-0.5 text-legenda text-muted-foreground">
              {rodape}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
