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
  formatarMesAno,
} from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
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

      {lancamentos.map((lancamento) => (
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
            {/*
              Resumo, e não uma linha por parcela. A tabela antiga tinha nove
              colunas e uma linha por parcela: no DARF PERT da Receita, que tem
              150 parcelas, ela sozinha enchia folhas, e nenhuma das nove
              colunas respondia o que quem confere pergunta, que é quanto já
              saiu e quanto falta.

              As duas bases de valor são diferentes de propósito, e são as
              mesmas dos KPIs da tela de Lançamentos: pagas somam o LÍQUIDO (o
              que saiu da conta) e em aberto somam o VALOR (a dívida). Ver o
              JSDoc de `EspelhoResumoParcelas`.
            */}
            <EspelhoTabela
              colunas={[
                { chave: "grupo", rotulo: "Situação" },
                { chave: "quantidade", rotulo: "Qtd.", alinharDireita: true },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={[
                {
                  grupo: "Pagas",
                  quantidade: lancamento.resumoParcelas.pagas.quantidade,
                  valor: (
                    <EspelhoDinheiro
                      valor={lancamento.resumoParcelas.pagas.valor}
                    />
                  ),
                },
                {
                  // "Em aberto", e não "A pagar": "A pagar" já é o rótulo do
                  // STATUS do lançamento, impresso no cabeçalho deste mesmo
                  // papel, e dois significados diferentes com o mesmo nome na
                  // mesma folha é o defeito que este espelho já teve. "Em
                  // aberto" é o vocabulário do projeto para dívida viva
                  // (STATUS_PARCELA_ABERTA) e o rótulo do KPI da tela.
                  grupo: "Em aberto",
                  quantidade: lancamento.resumoParcelas.aPagar.quantidade,
                  valor: (
                    <EspelhoDinheiro
                      valor={lancamento.resumoParcelas.aPagar.valor}
                    />
                  ),
                },
                // Canceladas só quando existem. Sem a linha, o total deixaria
                // de fechar com as linhas impressas na primeira parcela
                // cancelada (não há nenhuma na base hoje).
                ...(lancamento.resumoParcelas.canceladas.quantidade > 0
                  ? [
                      {
                        grupo: "Canceladas",
                        quantidade:
                          lancamento.resumoParcelas.canceladas.quantidade,
                        valor: (
                          <EspelhoDinheiro
                            valor={lancamento.resumoParcelas.canceladas.valor}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
              totais={{
                grupo: "Total",
                quantidade: lancamento.resumoParcelas.total.quantidade,
                valor: (
                  <EspelhoDinheiro
                    valor={lancamento.resumoParcelas.total.valor}
                  />
                ),
              }}
            />
            <EspelhoCampos
              campos={[
                {
                  // O vencimento em aberto mais antigo, que não depende de
                  // "hoje": o papel diz a mesma coisa amanhã. Se estiver no
                  // passado, é a parcela atrasada, e segue sendo a próxima.
                  rotulo: "Próximo vencimento",
                  valor: formatarData(
                    lancamento.resumoParcelas.proximoVencimento,
                  ),
                },
                {
                  rotulo: "Último pagamento",
                  valor: formatarData(lancamento.resumoParcelas.ultimoPagamento),
                },
              ]}
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
