import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /**
   * Texto na esmagadora maioria das telas. Aceita nó para o caso em que o
   * título precisa de tratamento tipográfico próprio, como a competência da
   * folha, que quer `tabular-nums` mas não é código de documento.
   */
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  /** Nome do módulo, ex. "Financeiro". Vira a sobrancelha acima do título. */
  modulo?: string;
  /**
   * Volta para a listagem de onde este registro foi aberto. Só em tela de
   * DETALHE: o botão aparece à esquerda do título, e o `rotulo` vira o
   * `aria-label` (é um botão só de ícone, então sem ele o leitor de tela anuncia
   * "botão" e mais nada). Ex.: `{ rota: "/compras/ordens", rotulo: "Voltar para
   * a lista de ordens" }`.
   */
  voltarPara?: { rota: string; rotulo: string };
  /**
   * Selos que qualificam o título, normalmente StatusBadge. Ficam na mesma linha
   * dele e quebram para a linha de baixo quando não couberem.
   */
  selos?: ReactNode;
  /**
   * Título em fonte monoespaçada, para número de documento (OC-2026-0001).
   * Alinha os dígitos entre uma tela e outra e separa o código do texto comum.
   */
  tituloMono?: boolean;
  /**
   * Ajuste de espaçamento para quem já controla o próprio. O padrão é `mb-4`,
   * que é o respiro certo quando o cabeçalho é irmão direto do conteúdo; telas
   * de detalhe, que empilham em container com `gap`, passam `mb-0` para não
   * somar as duas coisas.
   */
  className?: string;
}

/**
 * Cabeçalho canônico de aba E de detalhe. A sobrancelha existe porque a sidebar
 * é só de ícones e não há breadcrumb: com 9 módulos e 51 abas, "Lançamentos"
 * sozinho não diz de onde a pessoa está lendo. É opcional para não quebrar as
 * telas que já usam o componente sem ela.
 *
 * As telas de detalhe montavam este mesmo cabeçalho na mão, uma cópia cada, e a
 * cópia foi divergindo: umas com sobrancelha e outras sem, `font-medium` em uma
 * e não na outra, badge sem `flex-wrap` estourando a linha em tela estreita. Por
 * isso `voltarPara`, `selos` e `tituloMono` vivem aqui em vez de em um segundo
 * componente: um cabeçalho, um lugar para consertar.
 *
 * O voltar é `Link` e não `router.push` de propósito: continua sendo um link de
 * verdade, então ctrl+clique e clique do meio abrem a lista em outra aba.
 */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  modulo,
  voltarPara,
  selos,
  tituloMono,
  className,
}: PageHeaderProps) {
  const identidade = (
    <div className="min-w-0">
      {modulo ? (
        <p className="text-legenda font-medium tracking-wide text-muted-foreground uppercase">
          {modulo}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className={cn("text-titulo font-semibold", tituloMono && "codigo-doc")}>
          {titulo}
        </h1>
        {selos}
      </div>
      {descricao ? (
        <p className="text-detalhe text-muted-foreground">{descricao}</p>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap justify-between gap-4",
        // Com o botão de voltar, centrar: alinhar pelo topo deixaria o botão
        // pendurado acima da sobrancelha.
        voltarPara ? "items-center" : "items-start",
        className,
      )}
    >
      {voltarPara ? (
        <div className="flex min-w-0 items-center gap-3">
          <Button
            asChild
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={voltarPara.rotulo}
          >
            <Link href={voltarPara.rota}>
              <ArrowLeft />
            </Link>
          </Button>
          {identidade}
        </div>
      ) : (
        identidade
      )}
      {acoes ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>
      ) : null}
    </div>
  );
}
