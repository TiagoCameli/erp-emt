import {
  BotaoImprimir,
  EspelhoCampos,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
} from "@/components/canonicos";
import {
  formatarData,
  formatarDataHora,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import { buscarOrdensParaEspelho } from "@/modules/compras/ordens/espelho";
import { trilhaOrdem } from "@/modules/compras/ordens/queries";

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

  const trilhas = await Promise.all(
    ordens.map((ordem) => trilhaOrdem(ordem.id)),
  );
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

      {ordens.map((ordem, indice) => (
        <EspelhoImpresso
          key={ordem.id}
          tipo="Ordem de compra"
          numero={ordem.numero}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Dados da ordem">
            <EspelhoCampos
              campos={[
                { rotulo: "Fornecedor", valor: ordem.fornecedorNome },
                { rotulo: "Categoria", valor: ordem.categoriaNome },
                { rotulo: "Descrição", valor: ordem.descricao },
                { rotulo: "Condição", valor: ordem.condicaoDescricao },
                // Rótulo, não o código cru ("pendente_aprovacao" em vez de
                // "Pendente de aprovação"), e como TEXTO: no papel a cor do
                // StatusBadge pode não sair, então StatusBadge não entra aqui.
                { rotulo: "Status", valor: infoStatusOC(ordem.status).rotulo },
                {
                  rotulo: "Data da compra",
                  valor: formatarData(ordem.dataCompra),
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(ordem.mesCompetencia),
                },
                { rotulo: "Cotação de origem", valor: ordem.cotacaoNumero },
                // Os seis campos de dinheiro são a conta da trigger
                // `trg_total_oc_cabecalho`, na ordem em que ela soma:
                // itens + frete + outras + impostos - desconto = total. Quem
                // lê o papel consegue refazer a conta na mão, e por isso o
                // desconto vai marcado com o sinal.
                //
                // `valorTotal` é o TOTAL DA ORDEM, não a soma dos itens: a
                // migration 20260817160000 passou os ajustes para dentro dele.
                // Os dois números só coincidem quando não há ajuste nenhum —
                // em 6 das 17 OCs carregadas do Mais Controle eles diferem, e
                // na 2592 a diferença é de R$ 3.835,95.
                {
                  rotulo: "Total dos itens",
                  valor: <EspelhoDinheiro valor={ordem.somaItens} />,
                },
                {
                  rotulo: "Frete",
                  valor: <EspelhoDinheiro valor={ordem.frete} />,
                },
                {
                  rotulo: "Outras despesas",
                  valor: <EspelhoDinheiro valor={ordem.outrasDespesas} />,
                },
                {
                  rotulo: "Impostos",
                  valor: <EspelhoDinheiro valor={ordem.impostos} />,
                },
                {
                  rotulo: "Desconto (−)",
                  valor: <EspelhoDinheiro valor={ordem.desconto} />,
                },
                {
                  rotulo: "Total da ordem",
                  valor: <EspelhoDinheiro valor={ordem.valorTotal} />,
                },
                ...(ordem.motivoRejeicao
                  ? [
                      {
                        rotulo: "Motivo da rejeição",
                        valor: ordem.motivoRejeicao,
                      },
                    ]
                  : []),
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Itens">
            <EspelhoTabela
              colunas={[
                { chave: "insumo", rotulo: "Insumo" },
                { chave: "unidade", rotulo: "Un." },
                { chave: "quantidade", rotulo: "Qtd.", alinharDireita: true },
                { chave: "preco", rotulo: "Preço un.", alinharDireita: true },
                { chave: "subtotal", rotulo: "Subtotal", alinharDireita: true },
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
                // Mesmo rótulo e mesmo número do campo lá em cima, de
                // propósito: `somaItens` vem das linhas impressas, nunca do
                // `valorTotal` do cabeçalho. Se um dia a trigger e os itens
                // divergirem, o papel mostra a divergência (o total da ordem
                // não fecha com a conta), em vez de escondê-la repetindo o
                // número do cabeçalho aqui embaixo.
                subtotal: <EspelhoDinheiro valor={ordem.somaItens} />,
              }}
            />
          </EspelhoSecao>

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
                centro: "Total",
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

          <EspelhoSecao rotulo="Trilha">
            <EspelhoTabela
              colunas={[
                { chave: "data", rotulo: "Quando" },
                { chave: "titulo", rotulo: "O que" },
                { chave: "usuario", rotulo: "Quem" },
              ]}
              linhas={(trilhas[indice] ?? []).map((evento) => ({
                // Data E hora, como a Trilha canônica em tela: dois eventos do
                // mesmo dia ficam indistinguíveis só com a data, e este é
                // justamente o documento que serve de prova de auditoria.
                data: formatarDataHora(evento.data),
                titulo: evento.descricao
                  ? `${evento.titulo}: ${evento.descricao}`
                  : evento.titulo,
                usuario: evento.usuario,
              }))}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Anexos">
            <EspelhoTabela
              colunas={[
                { chave: "nome", rotulo: "Arquivo" },
                { chave: "tamanho", rotulo: "Tamanho", alinharDireita: true },
                { chave: "origem", rotulo: "Origem" },
              ]}
              linhas={(anexosPorOrdem[ordem.id] ?? []).map((anexo) => ({
                nome: anexo.nome,
                tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                origem: anexo.propagado ? "propagado da cadeia" : "desta ordem",
              }))}
            />
          </EspelhoSecao>

          {ordem.observacoes ? (
            <EspelhoSecao rotulo="Observações">
              <p className="whitespace-pre-line text-[13px]">
                {ordem.observacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
