import * as React from "react";
import type { ReactNode } from "react";

import {
  GradePersonalizavel,
  type ItemGradeDados,
  type VaoGrade,
} from "@/components/canonicos/grade-personalizavel";
import { idDoTitulo } from "@/components/canonicos/layout-grade";
import { cn } from "@/lib/utils";

export interface GradeKpisProps {
  children: ReactNode;
  /** Espaçamento externo da grade, ex. "mb-4". Não mexa nas colunas por aqui. */
  className?: string;
  /**
   * Liga a personalização: cada pessoa reordena, redimensiona, tira e coloca de
   * volta os cards, e o layout fica salvo com esta chave. Formato dos recursos,
   * `modulo.aba[.area]`, único no app. Sem `id` a grade é fixa, como sempre foi.
   */
  id?: string;
  /** Nome da área na barra do modo de edição, ex. "Saldos". */
  titulo?: string;
  /** Vão entre os cards. Grade de gráficos usa `amplo` (1rem). */
  vao?: VaoGrade;
}

/** Props que a grade lê dos filhos para identificar cada card. */
export interface PropsItemDaGrade {
  /** Id estável do card na grade. Ausente = derivado do `titulo`. */
  idCard?: string;
  /** Colunas de 12 quando a pessoa não escolheu. Ausente = automática. */
  larguraPadrao?: number;
}

export interface ItemGradeProps extends PropsItemDaGrade {
  /** Nome do card no menu de "Colocar de volta". */
  titulo: string;
  children: ReactNode;
}

/**
 * Embrulho para pôr na grade personalizável algo que não é KPICard nem lê
 * `titulo`/`idCard` (um gráfico com moldura própria, um bloco composto). Não
 * desenha nada: só carrega a identidade do card.
 */
export function ItemGrade({ children }: ItemGradeProps) {
  return <>{children}</>;
}

/**
 * Achata fragmentos e listas e tira de cada filho a identidade do card.
 *
 * Roda no servidor quando a tela é Server Component, e é por isso que mora aqui
 * e não na grade de cliente: depois de atravessar para o cliente o KPICard já
 * virou `<div>`, e o `titulo` dele não existe mais para ser lido.
 */
export function itensDaGrade(children: ReactNode): ItemGradeDados[] {
  const itens: ItemGradeDados[] = [];
  const usados = new Map<string, number>();

  function visitar(nos: ReactNode) {
    for (const no of React.Children.toArray(nos)) {
      if (!React.isValidElement(no)) continue;
      if (no.type === React.Fragment) {
        visitar((no.props as { children?: ReactNode }).children);
        continue;
      }
      const props = no.props as PropsItemDaGrade & { titulo?: unknown };
      const titulo = typeof props.titulo === "string" ? props.titulo : null;
      const chave = typeof no.key === "string" ? no.key.replace(/^\.\$|^\./, "") : null;
      const base =
        props.idCard ?? (titulo ? idDoTitulo(titulo) : null) ?? chave ?? `card-${itens.length + 1}`;
      const repeticoes = usados.get(base) ?? 0;
      usados.set(base, repeticoes + 1);
      const id = repeticoes === 0 ? base : `${base}-${repeticoes + 1}`;
      itens.push({
        id,
        titulo: titulo ?? id,
        larguraPadrao: props.larguraPadrao,
        conteudo: no,
      });
    }
  }

  visitar(children);
  return itens;
}

/**
 * Grade canônica de KPICards que se adapta à quantidade de cartões.
 *
 * Por que flex e não `grid-cols-3`: num grid fixo um cartão solitário fica
 * pendurado com dois terços da linha vazios (era o caso em Pagamentos, Contas
 * a receber e Contas bancárias). Aqui cada cartão tem base de 16rem e cresce
 * para dividir a linha: 1 ocupa a linha toda, 2 dividem pela metade, 3 ou 4
 * viram grade, e o que não cabe quebra e volta a preencher. Nunca sobra buraco.
 *
 * Por que estilizar `[&>*]` em vez de embrulhar cada filho: fragmento não gera
 * nó no DOM, então `Children.count` mente quando o chamador passa `<>...</>` ou
 * um `.map()` condicional. O seletor de filho direto acerta os cartões nos três
 * casos sem o componente precisar contar nada.
 *
 * Com `id`, a mesma regra de largura vale como padrão, e cada pessoa pode
 * arrumar a grade do seu jeito (ver GradePersonalizavel).
 */
export function GradeKpis({ children, className, id, titulo, vao }: GradeKpisProps) {
  if (id) {
    return (
      <GradePersonalizavel
        idGrade={id}
        itens={itensDaGrade(children)}
        titulo={titulo}
        vao={vao}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-64",
        // Celular: KPI dois por linha. Um por linha fazia quatro números
        // ocuparem a tela inteira antes da lista.
        // `[data-kpi]` é o KPICard direto; o `:has` pega o que vem embrulhado
        // (o Link do KPI com `href`).
        "max-md:[&>[data-kpi]]:basis-[calc(50%-0.375rem)] max-md:[&>*:has([data-kpi])]:basis-[calc(50%-0.375rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
