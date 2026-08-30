"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatarBRL } from "@/lib/formatadores";
import { abrirDrill } from "@/modules/financeiro/relatorios/components/abrir-drill";
import {
  COR_ENTIDADE,
  SEM_ANIMACAO,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import { MAX_BARRAS } from "./custo-cc-altura";
import type { CustoCentroCusto } from "../queries";

interface CustoCcGraficoProps {
  centros: CustoCentroCusto[];
  /**
   * URL de destino por centro. A barra "Outros" e os centros sem id ficam de
   * fora do mapa, e aí a barra não clica: "Outros" agrupa vários centros e não
   * existe uma lista que corresponda a ela.
   */
  destinos?: Map<string, string>;
}

/**
 * Barras HORIZONTAIS, uma cor só.
 *
 * Eram verticais com o rótulo girado -30°, e os nomes ficavam ilegíveis: nome de
 * centro aqui tem 50 caracteres ("009 - Manutenção da Rodovia BR-364/AC - Lote
 * 09 & 10"), o texto girado estourava a faixa do eixo e o navegador cortava o
 * COMEÇO dele — sobrava "…-364/AC - Lote 09 & 10", justamente sem o código que
 * identifica a obra. Deitado, o nome corre na horizontal e cabe inteiro.
 *
 * A cor também mudou de propósito. Antes era um ciclo de 5 cores atribuído pela
 * POSIÇÃO da barra, o que tem dois problemas: a cor passava a significar "5º
 * lugar" em vez de identificar o centro (filtrar um centro repintava todos os
 * outros), e o 5º slot era o vermelho de status — a mesma cor de "rejeitado" e
 * "vencido" — aparecendo num centro de custo que não tem nada de errado. Aqui o
 * que se compara é GRANDEZA, e grandeza já está no comprimento da barra: uma cor
 * só, e o cinza reservado para "Outros", que não é um centro e não clica.
 */

/** Cor única: a comparação é de grandeza, e o comprimento da barra já a carrega. */
const COR_BARRA = COR_ENTIDADE.custo;

/** "Outros" é um agregado, não um centro: cinza, e sem link. */
const COR_OUTROS = COR_ENTIDADE.agregado;

/** Largura reservada para o nome do centro, em px. */
const LARGURA_NOME = 236;

/**
 * Quantos caracteres cabem em `LARGURA_NOME` a 11px. Medido por aproximação de
 * 6px por caractere e arredondado para baixo: é melhor sobrar margem do que
 * encostar no eixo.
 */
const MAX_CARACTERES = 36;

function rotuloEixoValor(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return formatarBRL(valor);
}

/**
 * Corta o nome no FIM, com reticências. O fim é o lado certo: o começo carrega o
 * código da obra ("009 - "), que é o que identifica a linha. Cortar o começo,
 * que era o que o eixo girado fazia, tirava exatamente a parte que identifica.
 */
export function encurtarNome(nome: string, maximo = MAX_CARACTERES): string {
  if (nome.length <= maximo) return nome;
  // -1 pelo caractere de reticências, e sem espaço solto antes dele.
  return `${nome.slice(0, maximo - 1).trimEnd()}…`;
}

interface PontoTooltip {
  payload?: { rotulo: string; valor: number };
}

function ConteudoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PontoTooltip[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0]?.payload;
  if (!ponto) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-detalhe shadow-sm">
      {/* Nome INTEIRO aqui: o eixo pode encurtar, o tooltip nunca. */}
      <p className="font-medium text-foreground">{ponto.rotulo}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatarBRL(ponto.valor)}
      </p>
    </div>
  );
}

/** Custo por centro de custo: barras deitadas, maiores primeiro. */
export function CustoCcGrafico({ centros, destinos }: CustoCcGraficoProps) {
  const principais = centros.slice(0, MAX_BARRAS);
  const restantes = centros.slice(MAX_BARRAS);

  const dados = principais.map((centro) => ({
    // O nome inteiro é a chave da categoria: o eixo encurta só na exibição,
    // porque dois nomes longos podem encurtar para o mesmo texto e o Recharts
    // fundiria as duas categorias numa barra só.
    rotulo: centro.codigo ? `${centro.codigo} · ${centro.nome}` : centro.nome,
    valor: centro.valor,
    href: destinos?.get(centro.centroCustoId),
    // O cinza é sobre o DADO ser um agregado, não sobre a barra clicar. Quem não
    // tem permissão de ver lançamentos recebe `destinos` vazio, e pintar por
    // `href` deixaria o gráfico inteiro cinza para essa pessoa.
    agregado: false,
  }));

  if (restantes.length > 0) {
    dados.push({
      rotulo: "Outros",
      valor: restantes.reduce((soma, c) => soma + c.valor, 0),
      href: undefined,
      agregado: true,
    });
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
      >
        {/* Linha sólida e só na vertical: com barra deitada, a grade que ajuda a
            ler é a do eixo de valor. Tracejado lia como meta ou projeção. */}
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={rotuloEixoValor}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="rotulo"
          tickFormatter={(nome: string) => encurtarNome(nome)}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          interval={0}
          width={LARGURA_NOME}
        />
        <Tooltip
          content={<ConteudoTooltip />}
          cursor={{ fill: "var(--muted)" }}
        />
        {/*
          No gráfico o clique é onClick porque o Recharts desenha <path>, não
          âncora. É por isso que a TABELA usa link de verdade: quem quer copiar
          o link ou abrir com o meio-clique usa ela, que mostra a mesma coisa.
        */}
        <Bar
          dataKey="valor"
          name="Custo"
          isAnimationActive={SEM_ANIMACAO}
          radius={[0, 3, 3, 0]}
          maxBarSize={22}
          onClick={(ponto: { payload?: { href?: string } }) =>
            abrirDrill(ponto?.payload?.href)
          }
        >
          {dados.map((linha) => (
            <Cell
              key={linha.rotulo}
              fill={linha.agregado ? COR_OUTROS : COR_BARRA}
              cursor={linha.href ? "pointer" : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
