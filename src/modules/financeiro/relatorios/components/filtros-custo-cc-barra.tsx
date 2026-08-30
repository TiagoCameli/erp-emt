"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelect,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import {
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import {
  comparacaoPermitida,
  STATUS_CUSTO,
  TIPOS_CENTRO,
  type FiltrosCustoCc,
  type ModoPeriodo,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

const MODOS: { valor: ModoPeriodo; rotulo: string }[] = [
  { valor: "mes", rotulo: "Um mês" },
  { valor: "periodo", rotulo: "Período" },
  { valor: "total", rotulo: "Tudo" },
  { valor: "vida", rotulo: "Vida do centro" },
];

const ROTULO_TIPO_CENTRO: Record<(typeof TIPOS_CENTRO)[number], string> = {
  obra: "Obra",
  escritorio: "Escritório",
  manutencao: "Manutenção",
};

/**
 * Rótulo de cada status, com o "A pagar" nomeado pelo que ele é AQUI: o status
 * literal da coluna.
 *
 * Na tela de Lançamentos o item chamado "A pagar" quer dizer outra coisa (a
 * situação do dinheiro, que inclui `aprovado` com saldo em aberto). Repetir o
 * nome cru nas duas telas com sentidos diferentes é o tipo de coisa que faz duas
 * telas de dinheiro discordarem sem ninguém achar o motivo.
 */
const ROTULO_STATUS: Record<(typeof STATUS_CUSTO)[number], string> = {
  a_pagar: "A pagar (não aprovado)",
  aprovado: "Aprovado",
  pago: "Pago",
};

/**
 * Sentinela do "sem forma de pagamento" dentro da lista de formas.
 *
 * Uma opção marcável na MESMA lista, e não um marcador separado ao lado, porque
 * são 880 lançamentos a pagar sem forma nenhuma (R$ 13,4 mi em 20/08/2026): esse
 * dinheiro precisa aparecer na mesma escolha em que a pessoa está pensando, em
 * vez de virar um resto invisível quando ela marca "PIX e Boleto".
 *
 * Não é uuid de propósito: assim `lerUuidsDaUrl` nunca o confunde com um id, e
 * ele viaja na URL no parâmetro próprio (`sem_forma=1`).
 */
const SEM_FORMA = "__sem_forma__";

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
  formasPagamento: FormaPagamentoOpcao[];
}

/**
 * Barra de filtros do relatório de Custo por centro de custo.
 *
 * Usa a `BarraFiltrosConfiguravel` porque esta tela não tem um DataTable onde os
 * filtros possam morar, e com `idTabela` PRÓPRIO: a preferência é um registro por
 * chave, e compartilhar a chave com outra tabela apagaria as colunas salvas dela.
 *
 * Todos os filtros de escolha são de marcação múltipla e viajam como lista
 * separada por vírgula (ver `listas-na-url.ts`). O teto de 50 é técnico: o `in`
 * do PostgREST viaja na URL, e lista grande morre por tamanho antes de chegar ao
 * servidor.
 *
 * O CENTRO É ESCOLHIDO EM DOIS CAMPOS: a raiz num, e a etapa dela no outro, que
 * só aparece quando a raiz escolhida tem filho. É o conserto do que o Tiago pegou
 * em 27/08/2026: com os dois níveis na mesma lista, 61 das 76 opções eram
 * equipamentos da mesma raiz e o seletor desenhava sessenta e uma linhas
 * idênticas, "Manutenção/Docume…", porque o nome que as distinguia vinha depois
 * do corte. A regra de como os dois campos viram uma lista para o banco mora em
 * `_shared/centro-custo/filtro.ts`.
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
  formasPagamento,
}: FiltrosCustoCcBarraProps) {
  // `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório
  // está aberto, e apagá-lo devolvia a pessoa ao Fluxo de caixa.
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

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

  /** Escreve uma lista de ids num parâmetro, ou remove o parâmetro (= todos). */
  function trocarLista(chave: string, ids: string[]) {
    setMuitos({ [chave]: escreverListaNaUrl(ids) });
  }

  /**
   * Troca os centros e, na MESMA navegação, apaga as etapas que ficaram órfãs.
   *
   * Em duas navegações o `etapa=<uuid>` fica pendurado na URL, invisível (o campo
   * some junto com a raiz dele) e vivo — e volta a recortar o relatório sozinho
   * quando alguém remarcar aquela raiz depois. É a mesma razão pela qual a troca
   * de modo limpa o que não pertence ao modo novo numa escrita só.
   */
  function trocarRaizes(ids: string[]) {
    setMuitos({
      centro: escreverListaNaUrl(ids),
      etapa: escreverListaNaUrl(
        etapasValidas(centrosCusto, ids, filtros.etapaIds),
      ),
    });
  }

  const nomesEtapa = rotuloDasEtapas(centrosCusto, filtros.centroIds);

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

  filtrosDaBarra.push({
    id: "centro",
    // No modo vida o centro deixa de ser filtro e vira a escolha principal: é
    // dele que sai o período inteiro do relatório.
    rotulo:
      filtros.modo === "vida"
        ? "Centro de custo (obrigatório)"
        : "Centro de custo",
    fixo: filtros.modo === "vida",
    temValor: filtros.centroIds.length > 0,
    onLimpar: () => setMuitos({ centro: null, etapa: null }),
    elemento: (
      <FiltroSelectMulti
        valores={filtros.centroIds}
        onValoresChange={trocarRaizes}
        maximo={MAX_ITENS_FILTRO}
        opcoes={opcoesDeRaiz(centrosCusto)}
        todosRotulo={
          filtros.modo === "vida" ? "Escolha um centro" : "Todos os centros"
        }
      />
    ),
  });

  // O segundo campo da escada só entra na barra quando há o que escolher nele.
  // Fixo, ficaria vazio e inerte em quase toda abertura da tela: das 15 raízes
  // que os relatórios oferecem, uma só tem filho hoje (a da manutenção, com 61
  // equipamentos).
  if (temEtapasParaEscolher(centrosCusto, filtros.centroIds)) {
    filtrosDaBarra.push({
      id: "etapa",
      rotulo: nomesEtapa.rotulo,
      fixo: true,
      temValor: filtros.etapaIds.length > 0,
      onLimpar: () => setMuitos({ etapa: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.etapaIds}
          onValoresChange={(ids) => trocarLista("etapa", ids)}
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesDeEtapa(centrosCusto, filtros.centroIds)}
          todosRotulo={nomesEtapa.todos}
        />
      ),
    });
  }

  filtrosDaBarra.push(
    {
      id: "categoria",
      rotulo: "Categoria",
      ocultoPorPadrao: true,
      temValor: filtros.categoriaIds.length > 0,
      onLimpar: () => setMuitos({ categoria: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.categoriaIds}
          onValoresChange={(ids) => trocarLista("categoria", ids)}
          maximo={MAX_ITENS_FILTRO}
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
      temValor: filtros.fornecedorIds.length > 0,
      onLimpar: () => setMuitos({ fornecedor: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.fornecedorIds}
          onValoresChange={(ids) => trocarLista("fornecedor", ids)}
          maximo={MAX_ITENS_FILTRO}
          opcoes={fornecedores.map((fornecedor) => ({
            valor: fornecedor.id,
            rotulo: fornecedor.nome,
          }))}
          todosRotulo="Todos os fornecedores"
        />
      ),
    },
    {
      id: "forma",
      rotulo: "Forma de pagamento",
      ocultoPorPadrao: true,
      temValor: filtros.formaIds.length > 0 || filtros.semForma,
      onLimpar: () => setMuitos({ forma: null, sem_forma: null }),
      elemento: (
        <FiltroSelectMulti
          valores={
            filtros.semForma
              ? [SEM_FORMA, ...filtros.formaIds]
              : filtros.formaIds
          }
          onValoresChange={(escolhidos) => {
            // A sentinela sai da lista de ids e vira parâmetro próprio, numa
            // navegação só com as formas: em duas, a URL passaria por um estado
            // intermediário que filtra outra coisa.
            const semForma = escolhidos.includes(SEM_FORMA);
            setMuitos({
              forma: escreverListaNaUrl(
                escolhidos.filter((item) => item !== SEM_FORMA),
              ),
              sem_forma: semForma ? "1" : null,
            });
          }}
          maximo={MAX_ITENS_FILTRO}
          opcoes={[
            ...formasPagamento.map((forma) => ({
              valor: forma.id,
              rotulo: forma.nome,
            })),
            { valor: SEM_FORMA, rotulo: "(sem forma informada)" },
          ]}
          todosRotulo="Todas as formas"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status do lançamento",
      ocultoPorPadrao: true,
      temValor: filtros.status.length > 0,
      onLimpar: () => setMuitos({ status: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.status}
          onValoresChange={(ids) => trocarLista("status", ids)}
          opcoes={STATUS_CUSTO.map((status) => ({
            valor: status,
            rotulo: ROTULO_STATUS[status],
          }))}
          todosRotulo="Todos os status"
        />
      ),
    },
    {
      id: "tipo_centro",
      rotulo: "Tipo de centro",
      ocultoPorPadrao: true,
      temValor: filtros.tiposCentro.length > 0,
      onLimpar: () => setMuitos({ tipo_centro: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.tiposCentro}
          onValoresChange={(ids) => trocarLista("tipo_centro", ids)}
          opcoes={TIPOS_CENTRO.map((tipo) => ({
            valor: tipo,
            rotulo: ROTULO_TIPO_CENTRO[tipo],
          }))}
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
