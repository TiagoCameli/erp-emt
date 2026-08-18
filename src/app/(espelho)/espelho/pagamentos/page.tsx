import {
  BotaoImprimir,
  EspelhoCampos,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
} from "@/components/canonicos";
import { formatarData, formatarDataHora, formatarMesAno } from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import {
  buscarPagamentosParaEspelho,
  trilhaDeParcelas,
} from "@/modules/financeiro/pagamentos/espelho";
import { rotuloStatusLancamento } from "@/modules/financeiro/lancamentos/schemas";

export default async function EspelhoPagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.pagamentos", "ver")) {
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

  const trilhas = await trilhaDeParcelas(
    pagamentos.map((pagamento) => pagamento.id),
  );
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

      {pagamentos.map((pagamento) => (
        <EspelhoImpresso
          key={pagamento.id}
          tipo="Pagamento"
          numero={pagamento.titulo}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Pagamento">
            <EspelhoCampos
              campos={[
                {
                  rotulo: "Valor da parcela",
                  valor: <EspelhoDinheiro valor={pagamento.valor} />,
                },
                {
                  rotulo: "Desconto",
                  valor: <EspelhoDinheiro valor={pagamento.desconto} />,
                },
                {
                  rotulo: "Juros e multa",
                  valor: <EspelhoDinheiro valor={pagamento.juros} />,
                },
                {
                  rotulo: "Saiu da conta",
                  valor: <EspelhoDinheiro valor={pagamento.valorLiquido} />,
                },
                { rotulo: "Conta bancária", valor: pagamento.contaNome },
                {
                  rotulo: "Vencimento",
                  valor: formatarData(pagamento.dataVencimento),
                },
                {
                  rotulo: "Pago em",
                  valor: formatarData(pagamento.dataPagamento),
                },
                // Rótulo, não o código cru ("pago" já é legível, mas
                // "em_revisao" não é): como TEXTO, porque no papel a cor do
                // StatusBadge pode não sair.
                {
                  rotulo: "Status",
                  valor: STATUS_PARCELA[pagamento.status].rotulo,
                },
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Lançamento de origem">
            <EspelhoCampos
              campos={[
                { rotulo: "Número", valor: pagamento.lancamentoNumero },
                { rotulo: "Fornecedor", valor: pagamento.fornecedorNome },
                { rotulo: "Categoria", valor: pagamento.categoriaNome },
                { rotulo: "Descrição", valor: pagamento.lancamentoDescricao },
                {
                  rotulo: "Forma de pagamento",
                  valor: pagamento.formaPagamentoNome,
                },
                {
                  rotulo: "Valor do lançamento",
                  valor: <EspelhoDinheiro valor={pagamento.lancamentoValor} />,
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(pagamento.mesCompetencia),
                },
                {
                  // Status do LANÇAMENTO, não da parcela: precisa do tipo para
                  // não imprimir "a_pagar" cru e invertido num recebível em
                  // aberto (rotuloStatusLancamento inverte para "A receber").
                  // Lançamento pai ausente (não deveria acontecer) degrada
                  // para travessão em vez de estourar.
                  rotulo: "Status do lançamento",
                  valor:
                    pagamento.lancamentoStatus && pagamento.lancamentoTipo
                      ? rotuloStatusLancamento(
                          pagamento.lancamentoStatus,
                          pagamento.lancamentoTipo,
                        )
                      : null,
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
              linhas={pagamento.rateios.map((rateio) => ({
                centro: rateio.centroCodigo
                  ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                  : rateio.centroNome,
                valor: <EspelhoDinheiro valor={rateio.valor} />,
              }))}
              totais={{
                centro: "Total do lançamento",
                valor: <EspelhoDinheiro valor={pagamento.lancamentoValor} />,
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Trilha da parcela">
            <EspelhoTabela
              colunas={[
                { chave: "data", rotulo: "Quando" },
                { chave: "titulo", rotulo: "O que" },
                { chave: "motivo", rotulo: "Motivo" },
              ]}
              linhas={(trilhas[pagamento.id] ?? []).map((evento) => ({
                // Data E hora: dois eventos do mesmo dia (aprovar de manhã,
                // reprogramar à tarde) ficam indistinguíveis só com a data, e
                // este é justamente o documento que serve de prova de
                // auditoria.
                data: formatarDataHora(evento.data),
                titulo: evento.titulo,
                motivo: evento.descricao ?? null,
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
              linhas={(anexosPorParcela[pagamento.id] ?? []).map((anexo) => ({
                nome: anexo.nome,
                tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                origem: anexo.propagado
                  ? "propagado da cadeia"
                  : "deste pagamento",
              }))}
            />
          </EspelhoSecao>

          {pagamento.lancamentoObservacoes ? (
            <EspelhoSecao rotulo="Observações do lançamento">
              <p className="whitespace-pre-line text-[13px]">
                {pagamento.lancamentoObservacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
