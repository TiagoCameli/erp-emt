import {
  BotaoImprimir,
  EspelhoAssinatura,
  EspelhoCartoes,
  EspelhoColunas,
  EspelhoDestaque,
  EspelhoDinheiro,
  EspelhoFaixaResumo,
  EspelhoImpresso,
  EspelhoLinhas,
  EspelhoNota,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
  tomDoStatus,
} from "@/components/canonicos";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import { buscarPagamentosParaEspelho } from "@/modules/financeiro/pagamentos/espelho";
import { rotuloStatusLancamento } from "@/modules/financeiro/lancamentos/schemas";

export default async function EspelhoPagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  // Dois recursos, não um: a MESMA parcela é impressa a partir de duas telas
  // diferentes, e quem chega por cada uma tem a permissão daquela.
  //
  // `financeiro.pagamentos` é a listagem de pagas. `financeiro.aprovacao-pagamentos`
  // é a fila de aprovação e os pagamentos diretos, que também oferecem o botão.
  // Exigir só o primeiro faria quem tem apenas a aba de aprovação clicar em
  // "Imprimir espelho" e cair em "Sem permissão" — o botão existiria só para
  // recusar.
  //
  // Isto NÃO alarga o que alguém enxerga: quem tem `aprovacao-pagamentos` já lê
  // esta parcela e o lançamento pai na tela de detalhe da aprovação, e a
  // consulta continua passando pela RLS, que é quem decide linha a linha.
  const podeVer =
    usuario !== null &&
    (temPermissao(usuario, "financeiro.pagamentos", "ver") ||
      temPermissao(usuario, "financeiro.aprovacao-pagamentos", "ver"));
  if (!usuario || !podeVer) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver pagamentos, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} pagamentos por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhum pagamento válido."
            : "Marque ao menos um pagamento na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const pagamentos = await buscarPagamentosParaEspelho(ids);

  if (pagamentos.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhum dos pagamentos pedidos está visível para você."
      />
    );
  }

  // "pagamento" é a entidade de anexo da PARCELA (ver
  // modules/_shared/anexos/entidades.ts): não existe tabela de pagamentos, o
  // pagamento é a baixa da parcela, e é com o id dela que o drawer grava o
  // vínculo (fn_pagar_parcela propaga os anexos do lançamento para cá).
  const anexosPorParcela = await listarAnexosPorDocumento(
    "pagamento",
    pagamentos.map((pagamento) => pagamento.id),
  );

  const ocultos = ids.length - pagamentos.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultos > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultos > 0
            ? `${ocultos} pagamento(s) pedido(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {pagamentos.map((pagamento) => {
        // A parcela está paga? Pelo STATUS, que é o que o módulo modela
        // (STATUS_PARCELA, e a mesma regra que a aba "Pagas" da listagem usa),
        // nunca por "tem dataPagamento". Os dois sinais andam juntos no banco
        // de propósito: `fn_pagar_parcela` grava status 'pago' junto com a
        // data, e `fn_estornar_pagamento` limpa a data junto com o status.
        //
        // O link do espelho é colável: quem tiver o id de uma parcela ainda em
        // aprovação abre esta página direto. Então a guarda mora aqui também, e
        // não só no botão da tela de detalhe — o papel não pode afirmar um
        // pagamento que não aconteceu.
        const foiPaga = pagamento.status === "pago";
        const resumo = pagamento.resumoParcelas;
        const anexos = anexosPorParcela[pagamento.id] ?? [];

        return (
          <EspelhoImpresso
            key={pagamento.id}
            // Parcela não paga não é um "Pagamento": o tipo diz o que o papel
            // realmente é, e o documento segue útil (valor, vencimento, situação
            // real, lançamento de origem e rateio continuam impressos).
            tipo={foiPaga ? "Pagamento" : "Parcela a pagar"}
            numero={pagamento.titulo}
            situacao={STATUS_PARCELA[pagamento.status].rotulo}
            tom={tomDoStatus(STATUS_PARCELA[pagamento.status].badge)}
            emitidoPor={usuario.nome}
            emitidoEm={emitidoEm}
          >
            <EspelhoDestaque
              rotulo="Fornecedor"
              titulo={pagamento.fornecedorNome}
              badge={
                resumo && resumo.total.quantidade > 1
                  ? `Parcela ${pagamento.numeroParcela}/${resumo.total.quantidade}`
                  : null
              }
              descricao={pagamento.lancamentoDescricao}
              rotuloValor="Valor da parcela"
              valor={pagamento.valor}
            />

            {/*
              Cartões da PARCELA. Os dois campos que afirmam um pagamento saem
              em travessão quando ela não foi paga, nunca com o líquido
              calculado nem com data: `valorLiquido` é coluna calculada e vem
              preenchida mesmo em parcela em aberto, então imprimir "saiu da
              conta R$ 1.000,00" seria dizer que saiu dinheiro que não saiu —
              num papel que vai para contador e processo.
            */}
            <EspelhoCartoes
              cartoes={[
                {
                  rotulo: "Vencimento",
                  valor: formatarData(pagamento.dataVencimento),
                  tom: "destaque",
                },
                {
                  rotulo: "Pago em",
                  valor: foiPaga ? formatarData(pagamento.dataPagamento) : null,
                  nota: foiPaga ? pagamento.contaNome : "ainda não pago",
                },
                {
                  rotulo: "Saiu da conta",
                  valor: foiPaga ? formatarBRL(pagamento.valorLiquido) : null,
                  // Os três ajustes, sempre, inclusive zerados: no papel, zero
                  // é informação ("não houve desconto"), e o campo em branco
                  // deixaria quem confere sem saber se houve e não foi impresso.
                  nota: foiPaga
                    ? `desconto ${formatarBRL(pagamento.desconto)} · juros ${formatarBRL(pagamento.juros)} · despesas ${formatarBRL(pagamento.outrasDespesas)}`
                    : "líquido da parcela",
                },
              ]}
            />

            {/*
              O lançamento inteiro, em seção separada e com o número no título.
              Misturar o dinheiro da parcela com o do lançamento na mesma
              fileira de cartões é exatamente como alguém lê "R$ 46.580,76" como
              se fosse o valor desta parcela.
            */}
            {resumo ? (
              <EspelhoSecao
                rotulo={`No lançamento ${pagamento.lancamentoNumero ?? "de origem"}`}
              >
                {/*
                  Faixa, e não cartões: cartões aqui dariam SETE blocos de
                  número na mesma folha e o leitor perderia qual deles é o
                  dinheiro desta parcela. A faixa tem peso menor de propósito —
                  é contexto do documento, não o assunto dele — e devolve a
                  altura que faltava para o papel fechar em A4.
                */}
                <EspelhoFaixaResumo
                  itens={[
                    {
                      rotulo: "Parcelas pagas",
                      valor: `${resumo.pagas.quantidade} de ${resumo.total.quantidade}`,
                    },
                    {
                      rotulo: "Já pago",
                      valor: formatarBRL(resumo.pagas.valor),
                    },
                    {
                      rotulo: "Em aberto",
                      valor: formatarBRL(resumo.aPagar.valor),
                    },
                    {
                      rotulo: "Próximo venc.",
                      valor: formatarData(resumo.proximoVencimento),
                    },
                    ...(resumo.canceladas.quantidade > 0
                      ? [
                          {
                            rotulo: "Canceladas",
                            valor: `${resumo.canceladas.quantidade} · ${formatarBRL(resumo.canceladas.valor)}`,
                          },
                        ]
                      : []),
                  ]}
                />
              </EspelhoSecao>
            ) : null}

            <EspelhoColunas>
              <EspelhoSecao rotulo="Identificação">
                <EspelhoLinhas
                  linhas={[
                    {
                      rotulo: "Nº do lançamento",
                      valor: pagamento.lancamentoNumero,
                    },
                    { rotulo: "Nº da parcela", valor: pagamento.numeroParcela },
                    {
                      rotulo: "Competência",
                      valor: formatarMesAno(pagamento.mesCompetencia),
                    },
                    {
                      rotulo: "Forma de pagamento",
                      valor: pagamento.formaPagamentoNome,
                    },
                  ]}
                />
              </EspelhoSecao>

              <EspelhoSecao rotulo="Classificação">
                <EspelhoLinhas
                  linhas={[
                    { rotulo: "Categoria", valor: pagamento.categoriaNome },
                    { rotulo: "Conta bancária", valor: pagamento.contaNome },
                    {
                      // Situação do LANÇAMENTO, não da parcela: precisa do tipo
                      // para não imprimir "a_pagar" cru e invertido num
                      // recebível em aberto (rotuloStatusLancamento inverte para
                      // "A receber"). Lançamento pai ausente (não deveria
                      // acontecer) degrada para travessão em vez de estourar.
                      rotulo: "Situação do lançamento",
                      valor:
                        pagamento.lancamentoStatus && pagamento.lancamentoTipo
                          ? rotuloStatusLancamento(
                              pagamento.lancamentoStatus,
                              pagamento.lancamentoTipo,
                            )
                          : null,
                    },
                    {
                      rotulo: "Valor do lançamento",
                      valor: (
                        <EspelhoDinheiro valor={pagamento.lancamentoValor} />
                      ),
                    },
                    // Fecha a conta dos cartões acima (pagas + em aberto +
                    // canceladas) e deixa comparável com o valor do lançamento
                    // logo em cima. Omitido quando não há resumo, porque zero
                    // aqui seria lido como "o lançamento não tem parcelas".
                    ...(resumo
                      ? [
                          {
                            rotulo: "Total das parcelas",
                            valor: (
                              <EspelhoDinheiro valor={resumo.total.valor} />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </EspelhoSecao>
            </EspelhoColunas>

            <EspelhoSecao rotulo="Rateio por centro de custo">
              <EspelhoTabela
                colunas={[
                  { chave: "centro", rotulo: "Centro de custo" },
                  { chave: "valor", rotulo: "Valor", alinharDireita: true },
                ]}
                linhas={pagamento.rateios.map((rateio) => ({
                  centro: rateio.centroCodigo
                    ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                    : rateio.centroNome,
                  valor: <EspelhoDinheiro valor={rateio.valor} />,
                }))}
                totais={{
                  // "Total do rateio", não "Total do lançamento": o número é a
                  // soma das linhas impressas acima (`somaRateios`), e rótulo
                  // tem que dizer o que o número é. Ecoar `lancamentoValor` aqui
                  // esconderia justamente a divergência entre rateio e
                  // lançamento; o valor do lançamento continua no papel, na
                  // coluna de classificação, para quem lê comparar.
                  centro: "Total do rateio",
                  valor: <EspelhoDinheiro valor={pagamento.somaRateios} />,
                }}
              />
            </EspelhoSecao>

            {pagamento.lancamentoObservacoes ? (
              <EspelhoSecao rotulo="Observações do lançamento">
                <p className="text-[10.5px] leading-[15px] whitespace-pre-line">
                  {pagamento.lancamentoObservacoes}
                </p>
              </EspelhoSecao>
            ) : null}

            <EspelhoAssinatura
              rotulo={foiPaga ? "Conferido por" : "Aprovado por"}
            >
              <EspelhoNota>
                {anexos.length === 0
                  ? "Nenhum anexo neste pagamento."
                  : `${anexos.length} anexo(s): ${anexos.map((anexo) => anexo.nome).join(", ")}`}
              </EspelhoNota>
            </EspelhoAssinatura>
          </EspelhoImpresso>
        );
      })}
    </>
  );
}
