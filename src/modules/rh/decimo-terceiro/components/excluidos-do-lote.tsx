import Link from "next/link";
import { UserX } from "lucide-react";

import type { ForaDoLote } from "@/modules/rh/decimo-terceiro/queries";

export interface ExcluidosDoLoteProps {
  fora: ForaDoLote[];
}

/**
 * Quem NÃO entrou no lote, e por quê.
 *
 * Aparece sempre que houver alguém de fora, inclusive com o lote já aprovado:
 * um CLT que ficou sem 13º é exatamente o tipo de coisa que ninguém percebe
 * olhando um total. O caminho do conserto (o cadastro do colaborador) vai
 * junto, porque o aviso sem a saída só irrita.
 */
export function ExcluidosDoLote({ fora }: ExcluidosDoLoteProps) {
  if (fora.length === 0) return null;

  const plural = fora.length > 1;

  return (
    <section
      // Âmbar, não vermelho: não é erro, é cadastro incompleto que dá para
      // resolver. Vermelho aqui competiria com o aviso de custo em dobro,
      // que é o que de fato faz alguém pagar errado.
      className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4"
      aria-labelledby="fora-do-lote-titulo"
    >
      <div className="flex items-start gap-2">
        <UserX className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <div className="flex-1">
          <h2 id="fora-do-lote-titulo" className="text-secao font-semibold">
            {fora.length}{" "}
            {plural ? "colaboradores fora do lote" : "colaborador fora do lote"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sem data de admissão não há como contar os avos, então{" "}
            {plural ? "estes CLT não entraram" : "este CLT não entrou"} no 13º.
            Preencha a data no cadastro e gere o lote de novo.
          </p>

          <ul className="mt-3 flex flex-col gap-1">
            {fora.map((pessoa) => (
              <li
                key={pessoa.colaboradorId}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
              >
                <Link
                  href={`/cadastros/colaboradores/${pessoa.colaboradorId}`}
                  className="font-medium underline underline-offset-2"
                >
                  {pessoa.colaboradorNome}
                </Link>
                <span className="text-muted-foreground">{pessoa.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
