"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelect,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import {
  comparacaoPermitida,
  type FiltrosCustoCc,
  type ModoPeriodo,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";

const MODOS: { valor: ModoPeriodo; rotulo: string }[] = [
  { valor: "mes", rotulo: "Um mês" },
  { valor: "periodo", rotulo: "Período" },
  { valor: "total", rotulo: "Tudo" },
  { valor: "vida", rotulo: "Vida do centro" },
];

const TIPOS_CENTRO = [
  { valor: "obra", rotulo: "Obra" },
  { valor: "escritorio", rotulo: "Escritório" },
  { valor: "manutencao", rotulo: "Manutenção" },
];

/** Caixa de marcar com rótulo, no tamanho da barra de filtros. */
function FiltroMarcar({
  id,
  rotulo,
  marcado,
  onMarcarChange,
  desabilitado,
  motivo,
}: {
  id: string;
  rotulo: string;
  marcado: boolean;
  onMarcarChange: (marcado: boolean) => void;
  desabilitado?: boolean;
  /** Por que está desabilitado, no title. Some quando habilitado. */
  motivo?: string;
}) {
  return (
    <label
      htmlFor={id}
      title={desabilitado ? motivo : undefined}
      className={
        "flex h-8 items-center gap-1.5 text-detalhe " +
        (desabilitado ? "text-muted-foreground/60" : "text-muted-foreground")
      }
    >
      <Checkbox
        id={id}
        checked={marcado}
        disabled={desabilitado}
        onCheckedChange={(estado) => onMarcarChange(estado === true)}
      />
      {rotulo}
    </label>
  );
}

export interface FiltrosCustoCcBarraProps {
  filtros: FiltrosCustoCc;
  centrosCusto: CentroCustoOpcao[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
}

/**
 * Barra de filtros do relatório de Custo por centro de custo.
 *
 * Usa a `BarraFiltrosConfiguravel` porque esta tela não tem um DataTable onde os
 * filtros possam morar, e com `idTabela` PRÓPRIO: a preferência é um registro por
 * chave, e compartilhar a chave com outra tabela apagaria as colunas salvas dela.
 *
 * Toda troca de modo escreve na URL numa navegação SÓ (`setMuitos`), limpando o
 * que não se aplica no mesmo passo. Em duas navegações, o `de`/`ate` de um modo
 * anterior ficaria pendurado na URL e voltaria sozinho quando a pessoa
 * retornasse ao modo período.
 */
export function FiltrosCustoCcBarra({
  filtros,
  centrosCusto,
  categorias,
  fornecedores,
}: FiltrosCustoCcBarraProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();

  const podeComparar = comparacaoPermitida(filtros.modo);

  /**
   * Troca o modo e limpa, na MESMA navegação, só o que não pertence ao modo novo.
   *
   * Numa navegação só porque em duas o parâmetro velho fica pendurado na URL e
   * volta sozinho no meio do caminho. E limpando só o que não pertence: quem sai
   * de "período" para "um mês" e volta encontra as datas onde deixou, em vez de
   * ter que digitá-las de novo.
   */
  function trocarModo(modo: string) {
    const mudancas: Record<string, string | null> = {
      modo: modo === "mes" ? null : modo,
    };
    if (modo !== "periodo") {
      mudancas.de = null;
      mudancas.ate = null;
    }
    if (modo !== "mes" && modo !== "periodo") {
      // Comparar não existe em "tudo" nem em "vida": deixar comparar=1 na URL
      // faria o filtro voltar ligado sozinho ao trocar de modo depois.
      mudancas.comparar = null;
    }
    setMuitos(mudancas);
  }

  const filtrosDaBarra: FiltroDaBarra[] = [
    {
      id: "modo",
      rotulo: "Período",
      fixo: true,
      elemento: (
        <FiltroSelect
          valor={filtros.modo}
          onValorChange={trocarModo}
          opcoes={MODOS.map((modo) => ({
            valor: modo.valor,
            rotulo: modo.rotulo,
          }))}
          todosRotulo="Um mês"
        />
      ),
    },
  ];

  if (filtros.modo === "mes") {
    filtrosDaBarra.push({
      id: "mes",
      rotulo: "Mês",
      fixo: true,
      elemento: (
        <FiltroMes
          valor={filtros.mes}
          onValorChange={(valor) => setMuitos({ mes: valor || null })}
        />
      ),
    });
  }

  if (filtros.modo === "periodo") {
    filtrosDaBarra.push({
      id: "de",
      rotulo: "De",
      fixo: true,
      elemento: (
        <FiltroMes
          rotulo="De"
          valor={filtros.de}
          onValorChange={(valor) => setMuitos({ de: valor || null })}
        />
      ),
    });
    filtrosDaBarra.push({
      id: "ate",
      rotulo: "Até",
      fixo: true,
      elemento: (
        <FiltroMes
          rotulo="Até"
          valor={filtros.ate}
          onValorChange={(valor) => setMuitos({ ate: valor || null })}
        />
      ),
    });
  }

  filtrosDaBarra.push(
    {
      id: "centro",
      // No modo vida o centro deixa de ser filtro e vira a escolha principal: é
      // dele que sai o período inteiro do relatório.
      rotulo: filtros.modo === "vida" ? "Centro de custo (obrigatório)" : "Centro de custo",
      fixo: filtros.modo === "vida",
      temValor: Boolean(filtros.centroId),
      onLimpar: () => setMuitos({ centro: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.centroId ?? ""}
          onValorChange={(valor) => setMuitos({ centro: valor || null })}
          opcoes={centrosCusto.map((centro) => ({
            valor: centro.id,
            rotulo: centro.codigo ? `${centro.codigo} · ${centro.nome}` : centro.nome,
          }))}
          todosRotulo={
            filtros.modo === "vida" ? "Escolha um centro" : "Todos os centros"
          }
        />
      ),
    },
    {
      id: "categoria",
      rotulo: "Categoria",
      ocultoPorPadrao: true,
      temValor: Boolean(filtros.categoriaId),
      onLimpar: () => setMuitos({ categoria: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.categoriaId ?? ""}
          onValorChange={(valor) => setMuitos({ categoria: valor || null })}
          opcoes={categorias.map((categoria) => ({
            valor: categoria.id,
            rotulo: categoria.nome,
          }))}
          todosRotulo="Todas as categorias"
        />
      ),
    },
    {
      id: "fornecedor",
      rotulo: "Fornecedor",
      ocultoPorPadrao: true,
      temValor: Boolean(filtros.fornecedorId),
      onLimpar: () => setMuitos({ fornecedor: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.fornecedorId ?? ""}
          onValorChange={(valor) => setMuitos({ fornecedor: valor || null })}
          opcoes={fornecedores.map((fornecedor) => ({
            valor: fornecedor.id,
            rotulo: fornecedor.nome,
          }))}
          todosRotulo="Todos os fornecedores"
        />
      ),
    },
    {
      id: "tipo_centro",
      rotulo: "Tipo de centro",
      ocultoPorPadrao: true,
      temValor: Boolean(filtros.tipoCentro),
      onLimpar: () => setMuitos({ tipo_centro: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.tipoCentro ?? ""}
          onValorChange={(valor) => setMuitos({ tipo_centro: valor || null })}
          opcoes={TIPOS_CENTRO}
          todosRotulo="Todos os tipos"
        />
      ),
    },
    {
      id: "comparar",
      rotulo: "Comparar",
      ocultoPorPadrao: true,
      temValor: filtros.comparar,
      onLimpar: () => setMuitos({ comparar: null }),
      elemento: (
        <FiltroMarcar
          id="filtro-comparar"
          rotulo="Comparar com o período anterior"
          marcado={filtros.comparar && podeComparar}
          desabilitado={!podeComparar}
          motivo="Não existe período anterior em Tudo nem em Vida do centro: a variação seria sempre 100% contra zero."
          onMarcarChange={(marcado) =>
            setMuitos({ comparar: marcado ? "1" : null })
          }
        />
      ),
    },
    {
      id: "sem_previsto",
      rotulo: "Previsto",
      ocultoPorPadrao: true,
      temValor: filtros.excluirPrevisto,
      onLimpar: () => setMuitos({ sem_previsto: null }),
      elemento: (
        <FiltroMarcar
          id="filtro-sem-previsto"
          rotulo="Excluir lançamentos previstos"
          marcado={filtros.excluirPrevisto}
          onMarcarChange={(marcado) =>
            setMuitos({ sem_previsto: marcado ? "1" : null })
          }
        />
      ),
    },
  );

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-custo-cc"
      filtros={filtrosDaBarra}
    />
  );
}
