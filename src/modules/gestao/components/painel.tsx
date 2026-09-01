import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/canonicos";

interface PainelProps {
  titulo: string;
  /** O que o bloco responde e de que período ele fala. */
  descricao?: string;
  /** Número âncora do bloco (o total), alinhado à direita do cabeçalho. */
  destaque?: ReactNode;
  rotuloDestaque?: string;
  link?: { href: string; rotulo: string };
  /**
   * A linha de rodapé: o que o número quer dizer, ou o que ele não conta.
   *
   * Fica embaixo, e não na `descricao`, porque as duas respondem perguntas
   * diferentes: a descrição diz de que o bloco fala, e a nota diz o que a pessoa
   * precisa saber DEPOIS de olhar o gráfico ("três meses positivos, cinco
   * negativos", "transferências entre contas próprias ficam fora dos dois
   * lados"). Advertência dessas no cabeçalho é lida antes de haver o que
   * advertir, e por isso não é lida.
   */
  nota?: ReactNode;
  children: ReactNode;
}

/**
 * Bloco do painel: cabeçalho com a pergunta que ele responde, o total e o link
 * para a tela que tem o detalhe. Todo gráfico e toda tabela do painel moram
 * dentro de um destes, para os blocos terem sempre a mesma moldura.
 */
export function Painel({
  titulo,
  descricao,
  destaque,
  rotuloDestaque,
  link,
  nota,
  children,
}: PainelProps) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-corpo font-semibold text-foreground">{titulo}</h2>
          {descricao ? (
            <p className="text-legenda text-muted-foreground">{descricao}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {destaque !== undefined ? (
            <>
              <span className="text-corpo font-semibold tabular-nums text-foreground">
                {destaque}
              </span>
              {rotuloDestaque ? (
                <span className="text-legenda text-muted-foreground">
                  {rotuloDestaque}
                </span>
              ) : null}
            </>
          ) : null}
          {link ? (
            <Link
              href={link.href}
              className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
            >
              {link.rotulo}
            </Link>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4">{children}</div>
      {nota ? (
        <p className="border-t border-border px-4 py-2 text-legenda text-muted-foreground">
          {nota}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Falha de um bloco. O painel carrega os blocos em paralelo e um erro em um
 * não pode derrubar os outros, então o erro fica contido aqui dentro.
 */
export function PainelComFalha({ titulo }: { titulo: string }) {
  return (
    <EmptyState
      icone={TriangleAlert}
      titulo={`Não foi possível carregar ${titulo}`}
      descricao="Recarregue a página. Se continuar, avise o administrador."
    />
  );
}
