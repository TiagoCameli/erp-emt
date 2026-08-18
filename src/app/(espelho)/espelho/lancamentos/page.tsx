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
} from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import { buscarLancamentosParaEspelho } from "@/modules/financeiro/lancamentos/espelho";
import { trilhaLancamento } from "@/modules/financeiro/lancamentos/queries";
import { rotuloStatusLancamento } from "@/modules/financeiro/lancamentos/schemas";

export default async function EspelhoLancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver lançamentos, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} lançamentos por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhum lançamento válido."
            : "Marque ao menos um lançamento na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const lancamentos = await buscarLancamentosParaEspelho(ids);

  if (lancamentos.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhum dos lançamentos pedidos está visível para você."
      />
    );
  }

  // Trilha por lançamento, reusando a query que a tela de detalhe já usa.
  const trilhas = await Promise.all(
    lancamentos.map((lancamento) => trilhaLancamento(lancamento.id)),
  );

  // Anexos dos N documentos em UMA consulta: listarAnexosPorDocumento já existe
  // e agrupa por id. Com 50 ids o `in` dá 1,9 KB de URL, longe do limite do
  // PostgREST, então aqui não precisa de lote.
  const anexosPorLancamento = await listarAnexosPorDocumento(
    "lancamento",
    lancamentos.map((lancamento) => lancamento.id),
  );

  const ocultos = ids.length - lancamentos.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultos > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultos > 0
            ? `${ocultos} lançamento(s) pedido(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {lancamentos.map((lancamento, indice) => (
        <EspelhoImpresso
          key={lancamento.id}
          tipo="Lançamento"
          numero={lancamento.numero}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Dados do lançamento">
            <EspelhoCampos
              campos={[
                { rotulo: "Fornecedor", valor: lancamento.fornecedorNome },
                { rotulo: "Categoria", valor: lancamento.categoriaNome },
                { rotulo: "Descrição", valor: lancamento.descricao },
                {
                  rotulo: "Forma de pagamento",
                  valor: lancamento.formaPagamentoNome,
                },
                {
                  rotulo: "Valor",
                  valor: <EspelhoDinheiro valor={lancamento.valor} />,
                },
                // Status como TEXTO: no papel a cor pode não sair. E não é o
                // código cru: "a_pagar" é o código genérico de pendência tanto
                // de um lançamento a pagar quanto a receber, então precisa do
                // tipo para não imprimir invertido num recebível.
                {
                  rotulo: "Status",
                  valor: rotuloStatusLancamento(
                    lancamento.status,
                    lancamento.tipo,
                  ),
                },
                {
                  rotulo: "Data do lançamento",
                  valor: formatarData(lancamento.dataCompra),
                },
                {
                  rotulo: "Vencimento",
                  valor: formatarData(lancamento.dataVencimento),
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(lancamento.mesCompetencia),
                },
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Parcelas">
            <EspelhoTabela
              colunas={[
                { chave: "n", rotulo: "Nº" },
                { chave: "vencimento", rotulo: "Vencimento" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
                { chave: "desconto", rotulo: "Desconto", alinharDireita: true },
                { chave: "juros", rotulo: "Juros", alinharDireita: true },
                { chave: "liquido", rotulo: "Líquido", alinharDireita: true },
                { chave: "conta", rotulo: "Conta" },
                { chave: "status", rotulo: "Status" },
                { chave: "pagamento", rotulo: "Pago em" },
              ]}
              linhas={lancamento.parcelas.map((parcela) => ({
                n: parcela.numeroParcela,
                vencimento: formatarData(parcela.dataVencimento),
                valor: <EspelhoDinheiro valor={parcela.valor} />,
                desconto: <EspelhoDinheiro valor={parcela.desconto} />,
                juros: <EspelhoDinheiro valor={parcela.juros} />,
                liquido: <EspelhoDinheiro valor={parcela.valorLiquido} />,
                conta: parcela.contaNome,
                // Rótulo, não o código cru ("em_revisao" em vez de "Em revisão").
                status: STATUS_PARCELA[parcela.status].rotulo,
                pagamento: formatarData(parcela.dataPagamento),
              }))}
              totais={{
                n: "Total",
                liquido: (
                  <EspelhoDinheiro
                    valor={lancamento.parcelas.reduce(
                      (soma, parcela) => soma + parcela.valorLiquido,
                      0,
                    )}
                  />
                ),
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Rateio por centro de custo">
            <EspelhoTabela
              colunas={[
                { chave: "centro", rotulo: "Centro de custo" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={lancamento.rateios.map((rateio) => ({
                centro: rateio.centroCodigo
                  ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                  : rateio.centroNome,
                valor: <EspelhoDinheiro valor={rateio.valor} />,
              }))}
              totais={{
                centro: "Total",
                valor: (
                  <EspelhoDinheiro
                    valor={lancamento.rateios.reduce(
                      (soma, rateio) => soma + rateio.valor,
                      0,
                    )}
                  />
                ),
              }}
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
              linhas={(anexosPorLancamento[lancamento.id] ?? []).map(
                (anexo) => ({
                  nome: anexo.nome,
                  // KB inteiro: o papel só precisa dizer que o arquivo existe e
                  // que tamanho tem, não a contagem de bytes.
                  tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                  origem: anexo.propagado
                    ? "propagado da cadeia"
                    : "deste lançamento",
                }),
              )}
            />
          </EspelhoSecao>

          {lancamento.observacoes ? (
            <EspelhoSecao rotulo="Observações">
              <p className="whitespace-pre-line text-[13px]">
                {lancamento.observacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
