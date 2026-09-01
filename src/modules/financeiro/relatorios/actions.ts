"use server";


import { erroAcao } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { parametrosDaQueryString } from "@/modules/financeiro/lancamentos/filtros";
import { centrosEfetivos } from "@/modules/_shared/centro-custo/filtro";
import type { PeriodoCompetencia } from "@/modules/financeiro/relatorios/drill";
import {
  lerFiltrosCustoCc,
  periodoDoModo as periodoDoModoCc,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";
import { lerFiltrosCustoGrupo } from "@/modules/financeiro/relatorios/filtros-custo-grupo";
import { lerFiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";
import {
  janelaDoFluxo,
  descreverFatia,
  descreverJanela,
  lerFiltrosFluxoCaixa,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";
import {
  descreverPeriodo,
  lerPeriodoDaUrl,
  periodoDoModo,
  periodoFechado,
  pontasDaRpc,
  type ParametrosUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";
import { lerFornecedoresDaUrl } from "@/modules/financeiro/relatorios/extrato-filtros";
import {
  abaAging,
  abaCreditos,
  abaCustoCc,
  abaCustoGrupo,
  abaCustoReceita,
  abaDre,
  abaExtratoFornecedor,
  abaFluxoCaixa,
  abaPosicaoBancaria,
} from "@/modules/financeiro/relatorios/planilha-abas";
import {
  montarPlanilhaDeRelatorio,
  nomeArquivoDeRelatorio,
  type EscritaDeAba,
} from "@/modules/financeiro/relatorios/planilha-relatorio";
import {
  aging,
  creditos,
  custoPorCentroCusto,
  custoPorGrupo,
  custoPorInsumo,
  custoReceita,
  dreGerencial,
  extratoPorFornecedor,
  fluxoCaixa,
  mesCorrente,
  listarCentrosCustoParaFiltro,
  mesesDeCompetencia,
  posicaoBancaria,
  primeirosMesesDosCentros,
} from "@/modules/financeiro/relatorios/queries";
import type { RelatorioId } from "@/modules/financeiro/relatorios/relatorios";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Todo mês presente no período tem que ser um mês de verdade. */
function periodoValido(periodo: PeriodoCompetencia): boolean {
  return [periodo.mes, periodo.de, periodo.ate].every(
    (mes) => mes === undefined || MES.test(mes),
  );
}

/**
 * Nível 3 do drill-down do custo por grupo: os insumos de uma subcategoria no
 * recorte da tela. Vem por ação (e não pronto na página) porque é o único nível
 * que pode ter centenas de linhas, e ninguém abre todas as subcategorias.
 *
 * O RECORTE INTEIRO viaja, não só o mês: desde 29/08/2026 o relatório filtra por
 * período (mês, janela ou tudo) e por centro de custo, e um nível de drill que
 * ignorasse os dois abriria uma subcategoria de R$ 12 mil e listaria insumos
 * somando R$ 800 mil — o filho contra o pai, que é o defeito que este relatório
 * existe para não ter.
 *
 * A categoria financeira NÃO precisa vir junto: ela é uma coluna da própria
 * subcategoria (`categorias_insumo.categoria_financeira_id`), então a
 * subcategoria que apareceu na tela já passou inteira pelo filtro.
 */
export async function insumosDaSubcategoria(
  categoriaId: string,
  periodo: PeriodoCompetencia,
  centroCustoId?: string,
): Promise<
  { insumos: { nome: string; quantidade: number; valor: number }[] } | { erro: string }
> {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "financeiro.relatorios", "ver")) {
    return { erro: "Sem permissão para ver relatórios" };
  }

  const idValido = idSchema.safeParse(categoriaId);
  if (!idValido.success) return { erro: "Subcategoria inválida" };
  if (!periodoValido(periodo)) return { erro: "Período inválido" };

  if (centroCustoId !== undefined && !idSchema.safeParse(centroCustoId).success) {
    return { erro: "Centro de custo inválido" };
  }

  const insumos = await custoPorInsumo(idValido.data, {
    ...pontasDaRpc(periodo),
    centroCustoId,
  });

  return { insumos };
}

/** Teto da query string aceita, para ninguém mandar uma URL de 1 MB. */
const TETO_QUERY = 4000;

/** O que a exportação devolve para o navegador baixar. */
export type ResultadoPlanilhaRelatorio =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

/**
 * Gera o .xlsx do relatório que está na tela e devolve em base64.
 *
 * RECEBE A QUERY STRING, não uma cópia dos filtros. É o que impede a planilha de
 * discordar da tela: a página e a exportação passam pelos MESMOS
 * `lerFiltros*`, então o recorte é literalmente o mesmo objeto de regra. Um
 * segundo lugar montando filtro divergiria no primeiro filtro novo, e ninguém
 * perceberia até alguém somar a planilha e achar outro número.
 *
 * O RECORTE VAI ESCRITO no cabeçalho de cada aba, com o mesmo texto que a barra
 * de filtros mostra. Planilha circula por e-mail e é lida semanas depois: sem o
 * filtro dentro do arquivo, quem recebe não tem como saber se está vendo o mês,
 * o trimestre ou a base inteira.
 *
 * Não pagina nem tem teto de linhas, ao contrário da exportação de lançamentos:
 * estes nove são relatórios AGREGADOS, e o maior deles (custo x receita) tem
 * algumas centenas de linhas. O extrato por fornecedor é o único que lista
 * documento, e ele já vem filtrado por fornecedor.
 */
export async function gerarPlanilhaDoRelatorio(
  relatorio: RelatorioId,
  query: string,
): Promise<ResultadoPlanilhaRelatorio> {
  // Exportar é ler: a mesma permissão que abre a tela. Sem ela, nem a tela existe.
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "financeiro.relatorios", "ver")) {
    return { erro: "Sem permissão para exportar relatórios" };
  }

  if (typeof query !== "string" || query.length > TETO_QUERY) {
    return { erro: "Filtro inválido para exportar" };
  }

  const params = parametrosDaQueryString(query);

  try {
    const escrita = await abaDoRelatorio(relatorio, params);
    if (escrita === null) {
      return { erro: "Este relatório ainda não tem exportação" };
    }

    const workbook = montarPlanilhaDeRelatorio([escrita]);
    const conteudo = await workbook.xlsx.writeBuffer();

    return {
      ok: true,
      base64: Buffer.from(conteudo).toString("base64"),
      nomeArquivo: nomeArquivoDeRelatorio(relatorio, dataHojeISO()),
    };
  } catch (erro) {
    return erroAcao(
      "financeiro.relatorios.gerarPlanilhaDoRelatorio",
      erro,
      "Não foi possível gerar a planilha. Tente novamente",
    );
  }
}

/**
 * Lê o recorte da URL e busca os dados do relatório pedido.
 *
 * Um `switch` exaustivo sobre `RelatorioId`: relatório novo sem exportação vira
 * erro de compilação aqui, e não uma tela com botão que não faz nada.
 */
async function abaDoRelatorio(
  relatorio: RelatorioId,
  params: ParametrosUrl,
): Promise<EscritaDeAba | null> {
  switch (relatorio) {
    case "fluxo-caixa": {
      const filtros = lerFiltrosFluxoCaixa(params);
      const janela = janelaDoFluxo(filtros, mesCorrente());
      // A escada de centro vira a lista que a RPC aceita, igual à tela: a etapa
      // escolhida SUBSTITUI a raiz. Sem isso a planilha traria a empresa inteira
      // com o nome de um relatório de uma obra.
      const cadastro =
        filtros.centrosCusto.length > 0 || filtros.centrosReceita.length > 0
          ? await listarCentrosCustoParaFiltro()
          : [];
      const centrosCusto = centrosEfetivos(
        cadastro,
        filtros.centrosCusto,
        filtros.etapasCusto,
      );
      const centrosReceita = centrosEfetivos(
        cadastro,
        filtros.centrosReceita,
        filtros.etapasReceita,
      );
      // O título da aba diz o recorte inteiro, inclusive que o número é FATIA:
      // planilha de fluxo de caixa é o arquivo que sai da tela e vira anexo de
      // e-mail, e lá não há barra de filtros para dizer o que ele mostra.
      const fatiaCusto = descreverFatia(centrosCusto.length);
      const fatiaReceita = descreverFatia(centrosReceita.length);
      const recorte = [
        descreverJanela(janela),
        fatiaCusto ? `saídas: ${fatiaCusto.toLowerCase()}` : null,
        fatiaReceita ? `entradas: ${fatiaReceita.toLowerCase()}` : null,
      ]
        .filter((parte) => parte !== null)
        .join(" · ");
      return abaFluxoCaixa(
        await fluxoCaixa(janela, {
          custo: centrosCusto,
          receita: centrosReceita,
        }),
        recorte,
      );
    }

    case "dre": {
      const escolha = lerPeriodoDaUrl(params, mesCorrente());
      // O DRE precisa das duas pontas FECHADAS: `fn_rel_dre` não tem default
      // nem guarda de nulo, então "tudo" vira o primeiro e o último mês que
      // existem de verdade — não uma data inventada com folga, que traria mês
      // vazio para dentro do relatório. É o mesmo caminho da tela.
      const meses = await mesesDeCompetencia();
      const periodo = periodoFechado(periodoDoModo(escolha), meses);
      if (periodo === null) return null;
      const { inicio, fim } = pontasDaRpc(periodo);
      if (inicio === undefined || fim === undefined) return null;
      return abaDre(
        await dreGerencial({ inicio, fim }),
        descreverPeriodo(periodo, escolha.modo),
      );
    }

    case "aging":
      return abaAging(await aging());

    case "posicao-bancaria":
      return abaPosicaoBancaria(await posicaoBancaria());

    case "creditos":
      return abaCreditos(await creditos(), "todos os contratos");

    case "custo-cc": {
      const { filtros } = lerFiltrosCustoCc(params, mesCorrente());
      // A escada de centro vira a lista que a RPC aceita: a etapa escolhida
      // SUBSTITUI a raiz, e o banco filtra pela subárvore do que receber.
      const centroIds = centrosEfetivos(
        await listarCentrosCustoParaFiltro(),
        filtros.centroIds,
        filtros.etapaIds,
      );
      // O modo "vida" começa no primeiro mês com custo, e esse mês vem do
      // banco. Fora dele, `periodoDoModoCc` resolve sozinho.
      const primeirosMeses =
        filtros.modo === "vida" && centroIds.length > 0
          ? await primeirosMesesDosCentros(centroIds)
          : null;
      const primeiroMes =
        primeirosMeses && primeirosMeses.size > 0
          ? [...primeirosMeses.values()].sort()[0]
          : undefined;
      const periodo = periodoDoModoCc(filtros, primeiroMes);
      const custo = await custoPorCentroCusto({
        ...pontasDaRpc(periodo),
        centroIds,
        categoriaIds: filtros.categoriaIds,
        fornecedorIds: filtros.fornecedorIds,
        formaIds: filtros.formaIds,
        semForma: filtros.semForma,
        status: filtros.status,
        excluirPrevisto: filtros.excluirPrevisto,
        tiposCentro: filtros.tiposCentro,
      });
      return abaCustoCc(custo, descreverPeriodo(periodo, filtros.modo));
    }

    case "custo-receita": {
      const meses = await mesesDeCompetencia();
      const { filtros, mesesEfetivos } = lerFiltrosCustoReceita(params, meses);
      // A escada de centro tem de virar a lista efetiva aqui também: passar
      // `filtros.centrosCusto` cru ignora a ETAPA escolhida, e a planilha saía
      // com o centro inteiro (as 61 máquinas da manutenção) embaixo do nome de
      // um relatório de dois equipamentos. A tela já traduzia; a exportação não.
      const cadastro = await listarCentrosCustoParaFiltro();
      const linhas = await custoReceita({
        meses: mesesEfetivos,
        centrosCusto: centrosEfetivos(
          cadastro,
          filtros.centrosCusto,
          filtros.etapasCusto,
        ),
        centrosReceita: centrosEfetivos(
          cadastro,
          filtros.centrosReceita,
          filtros.etapasReceita,
        ),
      });
      return abaCustoReceita(linhas, `${mesesEfetivos.length} mês(es)`);
    }

    case "custo-grupo": {
      const filtros = lerFiltrosCustoGrupo(params, mesCorrente());
      const periodo = periodoDoModo(filtros);
      const dados = await custoPorGrupo({
        ...pontasDaRpc(periodo),
        // Mesma escada do custo por centro: a etapa substitui a raiz, e a RPC
        // recebe UM id, filtrando pela subárvore dele.
        centroCustoId: centrosEfetivos(
          await listarCentrosCustoParaFiltro(),
          filtros.centroId ? [filtros.centroId] : [],
          filtros.etapaId ? [filtros.etapaId] : [],
        )[0],
        categoriaId: filtros.categoriaId || undefined,
      });
      return abaCustoGrupo(dados, descreverPeriodo(periodo, filtros.modo));
    }

    case "extrato-fornecedor": {
      const fornecedorIds = lerFornecedoresDaUrl(params.fornecedor);
      if (fornecedorIds.length === 0) {
        // Sem fornecedor escolhido a tela não mostra extrato nenhum, então
        // exportar traria a base inteira de a pagar com a cara de um extrato.
        return null;
      }
      return abaExtratoFornecedor(
        await extratoPorFornecedor({ fornecedorIds }),
        `${fornecedorIds.length} fornecedor(es)`,
      );
    }
  }
}
