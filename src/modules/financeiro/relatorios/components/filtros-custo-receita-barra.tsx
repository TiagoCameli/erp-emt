"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import type { CentroCustoOpcao } from "@/modules/financeiro/lancamentos/queries";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import {
  MAX_MESES,
  type FiltrosCustoReceita,
} from "@/modules/financeiro/relatorios/filtros-custo-receita";

const MOTIVO_PERIODO_DESABILITADO =
  "Há mês de referência marcado, e o mês marcado manda. Limpe os meses para voltar a usar a janela.";

export interface FiltrosCustoReceitaBarraProps {
  filtros: FiltrosCustoReceita;
  /** Só os meses que TÊM lançamento, em ordem crescente (yyyy-MM). */
  mesesDisponiveis: string[];
  centrosCusto: CentroCustoOpcao[];
  periodoDesabilitado: boolean;
}

/**
 * Barra de filtros do relatório de Custo x receita.
 *
 * Duas coisas aqui não são enfeite:
 *
 * 1. **Dois seletores de centro**, um para o custo e um para a receita, com o
 *    MESMO cadastro nos dois. É o pedido, e a base explica: sete centros têm
 *    custo e receita zero (carretas, equipamentos, escritório, casas), então
 *    comparar "o custo da obra mais o das máquinas dela" contra "a receita da
 *    obra" precisa dos dois lados soltos.
 * 2. **A janela apaga quando há mês marcado.** O campo continua visível, com o
 *    motivo no title, em vez de sumir: filtro que desaparece deixa a pessoa
 *    procurando, e filtro que fica valendo em silêncio faz ela desconfiar do
 *    número.
 *
 * Os meses oferecidos são só os que existem em lançamento não cancelado. Um
 * calendário aberto deixaria escolher março de 2019 e ler "sem dados" como
 * resposta, quando a resposta é "esse mês não existe nesta base".
 */
export function FiltrosCustoReceitaBarra({
  filtros,
  mesesDisponiveis,
  centrosCusto,
  periodoDesabilitado,
}: FiltrosCustoReceitaBarraProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();

  const opcoesCentro = centrosCusto.map((centro) => ({
    valor: centro.id,
    rotulo: centro.codigo ? `${centro.codigo} · ${centro.nome}` : centro.nome,
  }));

  // Do mês mais novo para o mais velho: quem abre o seletor quer o mês recente.
  const opcoesMes = [...mesesDisponiveis].reverse().map((mes) => ({
    valor: mes,
    rotulo: rotuloMes(mes),
  }));

  const filtrosDaBarra: FiltroDaBarra[] = [
    {
      id: "centro_custo",
      rotulo: "Centros do custo",
      fixo: true,
      temValor: filtros.centrosCusto.length > 0,
      onLimpar: () => setMuitos({ centro_custo: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.centrosCusto}
          onValoresChange={(ids) =>
            setMuitos({ centro_custo: escreverListaNaUrl(ids) })
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesCentro}
          todosRotulo="Todos os centros"
        />
      ),
    },
    {
      id: "centro_receita",
      rotulo: "Centros da receita",
      fixo: true,
      temValor: filtros.centrosReceita.length > 0,
      onLimpar: () => setMuitos({ centro_receita: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.centrosReceita}
          onValoresChange={(ids) =>
            setMuitos({ centro_receita: escreverListaNaUrl(ids) })
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesCentro}
          todosRotulo="Todos os centros"
        />
      ),
    },
    {
      id: "mes_ref",
      rotulo: "Meses de referência",
      fixo: true,
      temValor: filtros.meses.length > 0,
      onLimpar: () => setMuitos({ mes_ref: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.meses}
          onValoresChange={(meses) =>
            setMuitos({ mes_ref: escreverListaNaUrl(meses, MAX_MESES) })
          }
          maximo={MAX_MESES}
          opcoes={opcoesMes}
          todosRotulo="Todos os meses"
        />
      ),
    },
    {
      id: "de",
      rotulo: "De",
      temValor: filtros.de !== "",
      onLimpar: () => setMuitos({ de: null }),
      elemento: (
        <FiltroMes
          rotulo="De"
          valor={filtros.de}
          desabilitado={periodoDesabilitado}
          motivo={MOTIVO_PERIODO_DESABILITADO}
          onValorChange={(valor) => setMuitos({ de: valor || null })}
        />
      ),
    },
    {
      id: "ate",
      rotulo: "Até",
      temValor: filtros.ate !== "",
      onLimpar: () => setMuitos({ ate: null }),
      elemento: (
        <FiltroMes
          rotulo="Até"
          valor={filtros.ate}
          desabilitado={periodoDesabilitado}
          motivo={MOTIVO_PERIODO_DESABILITADO}
          onValorChange={(valor) => setMuitos({ ate: valor || null })}
        />
      ),
    },
  ];

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-custo-receita"
      filtros={filtrosDaBarra}
    />
  );
}
