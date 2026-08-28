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
import {
  formatarBRL,
  formatarData,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import { LINHAS_DE_AJUSTE, temAjuste } from "@/modules/compras/ordens/calculo";
import { buscarOrdensParaEspelho } from "@/modules/compras/ordens/espelho";

export default async function EspelhoOrdensPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.ordens", "ver")) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver ordens de compra, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} ordens por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhuma ordem de compra válida."
            : "Marque ao menos uma ordem na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const ordens = await buscarOrdensParaEspelho(ids);

  if (ordens.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhuma das ordens pedidas está visível para você."
      />
    );
  }

  const anexosPorOrdem = await listarAnexosPorDocumento(
    "ordem_compra",
    ordens.map((ordem) => ordem.id),
  );

  const ocultas = ids.length - ordens.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultas > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultas > 0
            ? `${ocultas} ordem(ns) pedida(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {ordens.map((ordem) => {
        const status = infoStatusOC(ordem.status);
        const anexos = anexosPorOrdem[ordem.id] ?? [];
        return (
          <EspelhoImpresso
            key={ordem.id}
            tipo="Ordem de compra"
            numero={ordem.numero}
            // Rótulo, não o código cru ("pendente_aprovacao" em vez de
            // "Pendente de aprovação"), e como TEXTO ao lado do ponto colorido:
            // no papel a cor pode não sair, então a cor nunca é a única a dizer
            // a situação.
            situacao={status.rotulo}
            tom={tomDoStatus(status.badge)}
            emitidoPor={usuario.nome}
            emitidoEm={emitidoEm}
          >
            <EspelhoDestaque
              rotulo="Fornecedor"
              titulo={ordem.fornecedorNome}
              badge={
                ordem.itens.length > 0 ? `${ordem.itens.length} itens` : null
              }
              descricao={ordem.descricao}
              rotuloValor="Valor total"
              // `valorTotal` é o VALOR DA ORDEM: a migration 20260817160000
              // passou os ajustes do rodapé para dentro dele, então ele NÃO é a
              // soma dos itens. Os dois só coincidem quando não há ajuste; em 6
              // das 17 OCs carregadas do Mais Controle eles diferem, e na 2592 a
              // diferença é de R$ 3.835,95. Quando diferem, a seção "Formação do
              // total" logo abaixo mostra por quê.
              valor={ordem.valorTotal}
            />

            <EspelhoCartoes
              cartoes={[
                {
                  rotulo: "Data da compra",
                  valor: formatarData(ordem.dataCompra),
                  tom: "destaque",
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(ordem.mesCompetencia),
                },
                {
                  rotulo: "Itens",
                  valor: `${ordem.itens.length} linha(s)`,
                  nota: temAjuste(ordem.ajustes)
                    ? "há ajuste no rodapé"
                    : "sem ajuste no rodapé",
                },
                {
                  rotulo: "Parcelas",
                  valor: `${ordem.parcelas.length} prevista(s)`,
                  nota: ordem.condicaoDescricao,
                },
              ]}
            />

            {/*
              Faixa, e não duas colunas de rótulo/valor: a OC tem quatro fatos
              de identificação e uma tabela de itens que pode chegar a onze
              linhas. As duas colunas custavam ~110px e empurravam o rodapé para
              a segunda folha. A situação NÃO entra aqui de propósito: ela já
              está na tarja, e repetir gastaria linha dizendo o que a folha já
              disse.
            */}
            <EspelhoFaixaResumo
              itens={[
                { rotulo: "Nº da ordem", valor: ordem.numero },
                { rotulo: "Cotação", valor: ordem.cotacaoNumero },
                {
                  // Mesma regra da listagem: com duas ou mais, a contagem. O
                  // nome de uma delas afirmaria que a compra inteira foi daquela
                  // categoria, e este papel vai para o arquivo.
                  rotulo:
                    ordem.qtdCategorias > 1 ? "Categorias" : "Categoria",
                  valor:
                    ordem.qtdCategorias > 1
                      ? `${ordem.qtdCategorias} categorias`
                      : ordem.categoriaNome,
                },
                { rotulo: "Condição", valor: ordem.condicaoDescricao },
              ]}
            />

            {ordem.motivoRejeicao ? (
              <EspelhoSecao rotulo="Motivo da rejeição">
                <p className="text-[10.5px] leading-[15px] whitespace-pre-line">
                  {ordem.motivoRejeicao}
                </p>
              </EspelhoSecao>
            ) : null}

            <EspelhoSecao rotulo="Itens">
              <EspelhoTabela
                colunas={[
                  { chave: "insumo", rotulo: "Insumo" },
                  { chave: "unidade", rotulo: "Un." },
                  { chave: "quantidade", rotulo: "Qtd.", alinharDireita: true },
                  { chave: "preco", rotulo: "Preço un.", alinharDireita: true },
                  {
                    chave: "subtotal",
                    rotulo: "Subtotal",
                    alinharDireita: true,
                  },
                  { chave: "centro", rotulo: "Centro de custo" },
                ]}
                linhas={ordem.itens.map((item) => ({
                  insumo: item.insumoNome,
                  unidade: item.unidade,
                  quantidade: formatarQuantidade(item.quantidade),
                  preco: <EspelhoDinheiro valor={item.precoUnitario} />,
                  subtotal: <EspelhoDinheiro valor={item.subtotal} />,
                  centro: item.centroCustoCodigo
                    ? `${item.centroCustoCodigo} — ${item.centroCustoNome}`
                    : item.centroCustoNome,
                }))}
                totais={{
                  insumo: "Total dos itens",
                  // `somaItens` vem das linhas impressas, nunca do `valorTotal`
                  // do cabeçalho. Se um dia a trigger e os itens divergirem, o
                  // papel MOSTRA a divergência em vez de escondê-la repetindo o
                  // número do destaque aqui embaixo.
                  subtotal: <EspelhoDinheiro valor={ordem.somaItens} />,
                }}
              />
            </EspelhoSecao>

            {/*
              Formação do total, rateio e parcelas dividem uma fileira de três:
              são três blocos de três a cinco linhas, e empilhados gastavam um
              terço da folha sozinhos.

              A formação só existe quando há ajuste. Sem ajuste, "Valor total" e
              "Total dos itens" são o mesmo número e a seção seria ruído — é a
              mesma decisão que a tela de detalhe toma com `temAjuste`, e as duas
              superfícies imprimem a MESMA conta, com os mesmos rótulos e os
              mesmos sinais, porque as duas leem `LINHAS_DE_AJUSTE`.
            */}
            <EspelhoColunas colunas={3}>
              {temAjuste(ordem.ajustes) ? (
                <EspelhoSecao rotulo="Formação do total">
                  <EspelhoTabela
                    colunas={[
                      { chave: "linha", rotulo: "Composição" },
                      { chave: "valor", rotulo: "Valor", alinharDireita: true },
                    ]}
                    linhas={[
                      {
                        linha: "Soma dos itens",
                        valor: <EspelhoDinheiro valor={ordem.somaItens} />,
                      },
                      ...LINHAS_DE_AJUSTE.filter(
                        ({ chave }) => ordem.ajustes[chave] !== 0,
                      ).map(({ chave, rotulo, sinal }) => ({
                        linha: rotulo,
                        // O sinal vem de LINHAS_DE_AJUSTE, não do valor: desconto
                        // é guardado positivo no banco e só subtrai aqui. Mesma
                        // renderização da tela de detalhe.
                        valor: (
                          <span className="tabular-nums">
                            {sinal === "-" ? "− " : "+ "}
                            {formatarBRL(ordem.ajustes[chave])}
                          </span>
                        ),
                      })),
                    ]}
                    totais={{
                      linha: "Valor total",
                      valor: <EspelhoDinheiro valor={ordem.valorTotal} />,
                    }}
                  />
                </EspelhoSecao>
              ) : null}

              <EspelhoSecao rotulo="Rateio por centro de custo">
                <EspelhoTabela
                  colunas={[
                    { chave: "centro", rotulo: "Centro de custo" },
                    { chave: "valor", rotulo: "Valor", alinharDireita: true },
                  ]}
                  linhas={ordem.rateios.map((rateio) => ({
                    centro: rateio.centroCodigo
                      ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                      : rateio.centroNome,
                    valor: <EspelhoDinheiro valor={rateio.valor} />,
                  }))}
                  totais={{
                    centro: "Total do rateio",
                    // Idem: soma as linhas de rateio impressas, não o cabeçalho.
                    valor: (
                      <EspelhoDinheiro
                        valor={ordem.rateios.reduce(
                          (soma, rateio) => soma + rateio.valor,
                          0,
                        )}
                      />
                    ),
                  }}
                />
              </EspelhoSecao>

              <EspelhoSecao rotulo="Parcelas previstas">
                <EspelhoTabela
                  colunas={[
                    { chave: "n", rotulo: "Nº" },
                    { chave: "vencimento", rotulo: "Vencimento" },
                    { chave: "valor", rotulo: "Valor", alinharDireita: true },
                  ]}
                  linhas={ordem.parcelas.map((parcela) => ({
                    n: parcela.numeroParcela,
                    vencimento: formatarData(parcela.dataVencimento),
                    valor: <EspelhoDinheiro valor={parcela.valor} />,
                  }))}
                />
              </EspelhoSecao>
            </EspelhoColunas>

            {ordem.observacoes ? (
              <EspelhoSecao rotulo="Observações">
                <p className="text-[10.5px] leading-[15px] whitespace-pre-line">
                  {ordem.observacoes}
                </p>
              </EspelhoSecao>
            ) : null}

            <EspelhoAssinatura rotulo="Aprovado por">
              <EspelhoNota>
                {anexos.length === 0
                  ? "Nenhum anexo nesta ordem."
                  : `${anexos.length} anexo(s): ${anexos.map((anexo) => anexo.nome).join(", ")}`}
              </EspelhoNota>
            </EspelhoAssinatura>
          </EspelhoImpresso>
        );
      })}
    </>
  );
}
