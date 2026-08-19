import {
  BotaoImprimir,
  EspelhoAssinatura,
  EspelhoCartoes,
  EspelhoColunas,
  EspelhoDestaque,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoLinhas,
  EspelhoNota,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
  tomDoStatus,
  type CartaoEspelho,
} from "@/components/canonicos";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { STATUS_LANCAMENTO } from "@/modules/financeiro/_shared/formato";
import { buscarLancamentosParaEspelho } from "@/modules/financeiro/lancamentos/espelho";
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

      {lancamentos.map((lancamento) => {
        const resumo = lancamento.resumoParcelas;
        const anexos = anexosPorLancamento[lancamento.id] ?? [];
        // "Conta a pagar" / "Conta a receber": o que o papel É. O status do
        // lançamento vai ao lado, na situação, e não no tipo — misturar os dois
        // faria a tarja dizer "A pagar · A pagar".
        const aReceber = lancamento.tipo === "a_receber";

        /*
          Os cartões respondem, nesta ordem, o que quem confere pergunta:
          quando vence, quantas parcelas já foram pagas, quanto já saiu da conta
          e quanto ainda falta. Nenhum número aparece duas vezes na folha: a
          contagem mora aqui e não se repete numa tabela de parcelas embaixo.

          As duas bases de valor são diferentes de propósito, e são as mesmas
          dos KPIs da tela de Lançamentos: pagas somam o LÍQUIDO (o dinheiro que
          saiu) e em aberto somam o VALOR (a dívida). Ver `EspelhoResumoParcelas`.
        */
        const cartoes: CartaoEspelho[] = [
          {
            rotulo: "Próximo vencimento",
            // Não depende de "hoje": o papel diz a mesma coisa amanhã. Se
            // estiver no passado, é a parcela atrasada, e segue sendo a próxima.
            valor: formatarData(resumo.proximoVencimento),
            nota:
              resumo.aPagar.quantidade > 0
                ? "parcela em aberto mais antiga"
                : "nada em aberto",
            tom: "destaque",
          },
          {
            rotulo: "Parcelas pagas",
            valor: `${resumo.pagas.quantidade} de ${resumo.total.quantidade}`,
            nota: resumo.ultimoPagamento
              ? `última em ${formatarData(resumo.ultimoPagamento)}`
              : "nenhuma paga ainda",
          },
          {
            rotulo: "Já pago",
            valor: formatarBRL(resumo.pagas.valor),
            nota: "líquido que saiu da conta",
          },
          {
            rotulo: "Em aberto",
            valor: formatarBRL(resumo.aPagar.valor),
            nota: `${resumo.aPagar.quantidade} parcela(s)`,
          },
          // Cancelada não é paga nem devida. O cartão só existe quando há
          // alguma, senão a fileira carregaria um zero que não diz nada — mas
          // sem ele as parcelas impressas deixariam de somar o total.
          ...(resumo.canceladas.quantidade > 0
            ? [
                {
                  rotulo: "Canceladas",
                  valor: `${resumo.canceladas.quantidade} parcela(s)`,
                  nota: `${formatarBRL(resumo.canceladas.valor)} fora do total`,
                } satisfies CartaoEspelho,
              ]
            : []),
        ];

        return (
          <EspelhoImpresso
            key={lancamento.id}
            tipo={aReceber ? "Conta a receber" : "Conta a pagar"}
            numero={lancamento.numero}
            situacao={rotuloStatusLancamento(
              lancamento.status,
              lancamento.tipo,
            )}
            tom={tomDoStatus(STATUS_LANCAMENTO[lancamento.status].badge)}
            emitidoPor={usuario.nome}
            emitidoEm={emitidoEm}
          >
            <EspelhoDestaque
              rotulo={aReceber ? "Cliente" : "Fornecedor"}
              titulo={lancamento.fornecedorNome}
              badge={
                resumo.total.quantidade > 1
                  ? `${resumo.total.quantidade} parcelas`
                  : null
              }
              descricao={lancamento.descricao}
              valor={lancamento.valor}
            />

            <EspelhoCartoes cartoes={cartoes} />

            <EspelhoColunas>
              <EspelhoSecao rotulo="Identificação">
                <EspelhoLinhas
                  linhas={[
                    { rotulo: "Nº do lançamento", valor: lancamento.numero },
                    {
                      rotulo: "Data do lançamento",
                      valor: formatarData(lancamento.dataCompra),
                    },
                    {
                      rotulo: "Vencimento do lançamento",
                      valor: formatarData(lancamento.dataVencimento),
                    },
                    {
                      rotulo: "Competência",
                      valor: formatarMesAno(lancamento.mesCompetencia),
                    },
                  ]}
                />
              </EspelhoSecao>

              <EspelhoSecao rotulo="Classificação">
                <EspelhoLinhas
                  linhas={[
                    { rotulo: "Categoria", valor: lancamento.categoriaNome },
                    {
                      rotulo: "Forma de pagamento",
                      valor: lancamento.formaPagamentoNome,
                    },
                    // Status como TEXTO: no papel a cor pode não sair. E não é o
                    // código cru: "a_pagar" é o código genérico de pendência
                    // tanto de um lançamento a pagar quanto a receber, então
                    // precisa do tipo para não imprimir invertido num recebível.
                    {
                      rotulo: "Situação",
                      valor: rotuloStatusLancamento(
                        lancamento.status,
                        lancamento.tipo,
                      ),
                    },
                    {
                      rotulo: "Valor total",
                      valor: <EspelhoDinheiro valor={lancamento.valor} />,
                    },
                    {
                      // O total das parcelas ao lado do valor do lançamento, de
                      // propósito. É a única linha do papel onde a conta fecha:
                      // pagas + em aberto + canceladas. Sem ela, os cartões
                      // seriam três números soltos e a divergência entre o
                      // parcelamento e o cabeçalho ficaria invisível — que é
                      // exatamente o que um espelho existe para não deixar
                      // acontecer.
                      rotulo: "Total das parcelas",
                      valor: <EspelhoDinheiro valor={resumo.total.valor} />,
                    },
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
                linhas={lancamento.rateios.map((rateio) => ({
                  centro: rateio.centroCodigo
                    ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                    : rateio.centroNome,
                  valor: <EspelhoDinheiro valor={rateio.valor} />,
                }))}
                totais={{
                  // "Total do rateio", não "Total do lançamento": o número é a
                  // soma das linhas impressas acima. Ecoar o valor do lançamento
                  // aqui esconderia justamente a divergência entre os dois; o
                  // valor do lançamento está no destaque, para quem lê comparar.
                  centro: "Total do rateio",
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

            {lancamento.observacoes ? (
              <EspelhoSecao rotulo="Observações">
                <p className="text-[10.5px] leading-[15px] whitespace-pre-line">
                  {lancamento.observacoes}
                </p>
              </EspelhoSecao>
            ) : null}

            {/*
              Anexo como LINHA, e não como tabela de três colunas: a tabela
              gastava cinco linhas de uma folha que precisa fechar em A4 para
              dizer o que uma linha diz. Os nomes continuam impressos, porque o
              espelho é a prova de que o documento existia — só a contagem seria
              menos do que o papel prometia.
            */}
            <EspelhoAssinatura rotulo="Aprovado por">
              <EspelhoNota>
                {anexos.length === 0
                  ? "Nenhum anexo neste lançamento."
                  : `${anexos.length} anexo(s): ${anexos.map((anexo) => anexo.nome).join(", ")}`}
              </EspelhoNota>
            </EspelhoAssinatura>
          </EspelhoImpresso>
        );
      })}
    </>
  );
}
