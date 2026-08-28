/**
 * Cor e animação dos gráficos dos relatórios do Financeiro.
 *
 * Duas regras moram aqui porque as duas valem para os SEIS gráficos do módulo, e
 * repetir cada uma seis vezes é como elas divergiram da primeira vez.
 */

/**
 * O que a barra/linha REPRESENTA. Não é o slot dela no gráfico nem a posição na
 * lista: é a coisa do mundo que ela desenha.
 */
export type EntidadeGrafico =
  | "a_pagar"
  | "a_receber"
  | "custo"
  | "receita"
  | "saldo"
  | "agregado";

/**
 * Cor POR ENTIDADE, uma só para o módulo inteiro.
 *
 * O defeito que isto conserta: `--chart-1` (o verde da marca) era "Saídas" no
 * fluxo de caixa, "A pagar" no aging e nos créditos e "Custo" no custo por
 * centro — mas era a RECEITA LÍQUIDA em custo x receita, onde o custo tinha
 * ficado com o asfalto, que nas outras telas é entrada/a receber. Duas telas do
 * mesmo módulo, a mesma cor dizendo coisas opostas: quem lê as duas na mesma
 * reunião conclui o contrário do que o número diz.
 *
 * A escolha do lado: dinheiro que SAI (a pagar, custo) é o verde da marca, porque
 * é o que o ERP mais mostra; dinheiro que ENTRA (a receber, receita) é o asfalto;
 * o resultado/saldo, que não é nem um nem outro e cruza o zero, é o âmbar. O
 * `--chart-5` fica de fora de propósito: é o vermelho de "rejeitado"/"vencido", e
 * um centro de custo pintado de vermelho lê como centro com problema.
 *
 * Cor segue a entidade, nunca o índice: quem escrever o sétimo gráfico lê daqui
 * em vez de escolher de novo.
 */
export const COR_ENTIDADE: Record<EntidadeGrafico, string> = {
  a_pagar: "var(--color-chart-1)",
  custo: "var(--color-chart-1)",
  a_receber: "var(--color-chart-3)",
  receita: "var(--color-chart-3)",
  saldo: "var(--color-chart-2)",
  /** "Outros" e afins: um agregado não é uma entidade, e não clica. */
  agregado: "var(--color-status-rascunho)",
};

/** Quanto da cor cheia sobra no tom de "ainda não aconteceu". */
const PESO_PROJETADO = 45;

/**
 * O tom de PROJETADO da mesma entidade: a cor dela clareada contra o fundo do
 * card.
 *
 * Antes isso era `fillOpacity={0.45}` sobre o mesmo `fill`, e o desenho ficava
 * certo mas a LEGENDA mentia: o ícone da `Legend` do Recharts lê só o `fill`, e
 * o tooltip lê `color`, que também é o `fill`. Resultado: dois quadrados
 * idênticos, um escrito "Entradas realizadas" e outro "Entradas projetadas" —
 * a legenda deixava de separar o dinheiro que já entrou do que ainda pode não
 * entrar. Sendo COR de verdade (e não opacidade), a legenda e o tooltip
 * enxergam, e a barra continua com exatamente o mesmo tom de antes: 45% da cor
 * sobre o branco do card é o que `fillOpacity={0.45}` já desenhava.
 */
export function corProjetada(cor: string): string {
  return `color-mix(in srgb, ${cor} ${PESO_PROJETADO}%, var(--color-card))`;
}

/**
 * Animação de entrada DESLIGADA em todo gráfico do módulo. Não é preferência de
 * estilo: é o conserto do gráfico que aparecia sem barra nenhuma.
 *
 * O Recharts 3 desenha cada barra através de uma animação que começa em t=0, e
 * em t=0 a altura interpolada é 0 — e `Rectangle` devolve `null` para altura 0.
 * O primeiro quadro pintado é, portanto, um `<g class="recharts-bar-rectangle">`
 * VAZIO por barra: eixo, grade, escala e legenda no lugar, e nenhuma barra. A
 * forma só nasce quando a animação (movida por `requestAnimationFrame`) passa de
 * t=0, e ela é remontada do zero — `key={animationId}`, e o id é derivado da
 * identidade do objeto de props — a cada atualização do estado interno do
 * gráfico. Em produção esse quadro inicial virou permanente: o DOM tinha o
 * `svg.recharts-surface` com 1711x320, as quatro barras de valor > 0 como grupos
 * vazios, e `document.querySelectorAll('.recharts-bar-rectangle path').length`
 * igual a 0. Está reproduzido em `graficos-sem-animacao.test.tsx`.
 *
 * Sem animação, `JavascriptAnimate` começa em t=1: a barra nasce do tamanho
 * final, no primeiro quadro, sem depender de rAF nenhum. Em ERP a animação de
 * barra não informa nada, então o que se perde é decoração e o que se ganha é o
 * gráfico.
 */
export const SEM_ANIMACAO = false;

/**
 * Paleta para série de CENTRO DE CUSTO (uma linha por centro).
 *
 * Aqui a cor não identifica entidade financeira — todas as linhas são custo — e
 * sim separa um centro do outro, então ela é atribuída por posição de propósito.
 * Com mais de quatro centros a cor repete, e é por isso que a legenda nomeia
 * cada linha em vez de deixar a cor ser a única identificação. Sem o
 * `--chart-5`, pelo mesmo motivo de `COR_ENTIDADE`.
 */
export const CORES_SERIE_CENTRO = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];
