"use client";

import * as React from "react";
import { toast } from "@/components/canonicos/toast";

import {
  BotaoEspelho,
  ConfirmDialog,
  FormDrawer,
  MoneyText,
  StatusBadge,
  Trilha,
} from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import { rotuloStatusLancamento } from "@/modules/financeiro/lancamentos/schemas";
import { desaprovarParcela } from "@/modules/financeiro/aprovacao-pagamentos/actions";
import {
  detalheDaParcela,
  type DetalheParcela,
} from "@/modules/financeiro/pagamentos/actions";

/** Bloco de conteúdo do painel, no mesmo desenho do detalhe do lançamento. */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha rotulada. Valor ausente sai como travessão, nunca como espaço vazio. */
function Dado({
  rotulo,
  children,
  legenda,
}: {
  rotulo: string;
  children: React.ReactNode;
  legenda?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children ?? "-"}</span>
      {legenda ? (
        <span className="text-legenda text-muted-foreground">{legenda}</span>
      ) : null}
    </div>
  );
}

/** Grade de dados: duas colunas no desktop, uma no estreito. */
function Grade({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

export interface DetalheParcelaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Parcela a mostrar. Null fecha o painel. */
  parcelaId: string | null;
  /** Libera anexar e remover anexo daqui. */
  podeAnexar: boolean;
  /** Mostra o botão de pagar quando a parcela ainda pode ser paga. */
  podePagar: boolean;
  /**
   * Libera devolver uma parcela aprovada para a fila de aprovação. Permissão de
   * `desaprovar` em financeiro.aprovacao-pagamentos, que é de quem aprova — não
   * de quem paga.
   */
  podeDesaprovar?: boolean;
  /** Chamado ao clicar em "Pagar esta parcela". Abre o drawer de pagamento. */
  onPagar?: (parcelaId: string) => void;
  /** Chamado quando algo mudou aqui dentro (anexo entrou ou saiu). */
  onMudou?: () => void;
}

/**
 * Painel de detalhe de uma parcela, aberto ao clicar na linha da listagem de
 * pagamentos — tanto na fila a pagar quanto no histórico de pagas.
 *
 * Mostra o que é preciso para julgar um pagamento sem sair da tela: os valores
 * da parcela, o lançamento de origem, o rateio por centro de custo (onde o custo
 * caiu), os anexos e a trilha de eventos.
 *
 * Carrega sob demanda, na abertura: a listagem traz centenas de linhas e puxar o
 * detalhe de todas para exibir uma seria pagar o custo inteiro para o caso raro.
 */
export function DetalheParcelaDrawer({
  aberto,
  onAbertoChange,
  parcelaId,
  podeAnexar,
  podePagar,
  podeDesaprovar = false,
  onPagar,
  onMudou,
}: DetalheParcelaDrawerProps) {
  const [detalhe, setDetalhe] = React.useState<DetalheParcela | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [devolverAberto, setDevolverAberto] = React.useState(false);

  // Trocou de parcela? O conteúdo antigo sai AGORA, na renderização, e não
  // dentro do efeito: limpar no efeito deixaria um quadro com o detalhe da
  // parcela anterior sob o título da nova — e mexer no estado ali dispara
  // renderização em cascata. Padrão de "ajustar estado ao mudar uma prop".
  const [idAnterior, setIdAnterior] = React.useState(parcelaId);
  if (parcelaId !== idAnterior) {
    setIdAnterior(parcelaId);
    setDetalhe(null);
    setCarregando(parcelaId !== null);
  }

  React.useEffect(() => {
    if (!aberto || parcelaId === null) return;
    let cancelado = false;

    void detalheDaParcela(parcelaId)
      .then((resultado) => {
        if (cancelado) return;
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          onAbertoChange(false);
          return;
        }
        setDetalhe(resultado);
      })
      .catch(() => {
        if (cancelado) return;
        toast.error("Não foi possível carregar o detalhe do pagamento");
        onAbertoChange(false);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    // Fechar (ou trocar de parcela) no meio do carregamento não pode deixar a
    // resposta antiga chegar depois e pintar o painel com a parcela errada.
    return () => {
      cancelado = true;
    };
  }, [aberto, parcelaId, onAbertoChange]);

  const espelho = detalhe?.espelho ?? null;

  /**
   * A parcela foi paga? Pelo STATUS, nunca por "tem data de pagamento" ou por
   * `valorLiquido` — essa coluna é calculada e vem preenchida mesmo em parcela
   * em aberto. Exibir "saiu da conta" numa parcela não paga afirma um pagamento
   * que não aconteceu.
   */
  const foiPaga = espelho?.status === "pago";
  const podePagarEsta = podePagar && espelho?.status === "aprovado";

  /**
   * Devolver para a aprovação só existe em parcela APROVADA e não paga: é o
   * único estado em que a `fn_desaprovar_parcela` aceita. Oferecer o botão numa
   * paga seria prometer uma ação que o banco recusa.
   */
  const podeDevolverEsta = podeDesaprovar && espelho?.status === "aprovado";

  async function confirmarDevolucao(motivo?: string) {
    if (!espelho) return;
    const resultado = await desaprovarParcela(espelho.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pagamento devolvido para a fila de aprovação");
    setDevolverAberto(false);
    // Fecha o painel: a parcela que ele descreve não está mais aprovada, e o
    // conteúdo em tela (inclusive o botão de pagar) ficaria descrevendo um
    // estado que acabou de deixar de existir.
    onAbertoChange(false);
    onMudou?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={espelho?.titulo ?? "Detalhe do pagamento"}
      descricao={
        espelho
          ? `${espelho.fornecedorNome ?? "Sem fornecedor"} · ${STATUS_PARCELA[espelho.status].rotulo}`
          : "Carregando..."
      }
      larguraClassName="sm:max-w-5xl"
      rodape={
        espelho ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BotaoEspelho rota="/espelho/pagamentos" ids={[espelho.id]} />
            {podeDevolverEsta ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDevolverAberto(true)}
              >
                Voltar para aprovação
              </Button>
            ) : null}
            {podePagarEsta && onPagar ? (
              <Button type="button" onClick={() => onPagar(espelho.id)}>
                Pagar esta parcela
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {/* As duas checagens: `detalhe` libera anexos e trilha, `espelho` libera
          os campos. Uma só não estreita a outra para o TypeScript. */}
      {carregando || !detalhe || !espelho ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Secao
            titulo={foiPaga ? "Pagamento" : "Parcela"}
            acao={
              <StatusBadge
                status={STATUS_PARCELA[espelho.status].badge}
                rotulo={STATUS_PARCELA[espelho.status].rotulo}
              />
            }
          >
            <Grade>
              <Dado rotulo="Valor da parcela">
                <MoneyText valor={espelho.valor} />
              </Dado>
              <Dado rotulo="Desconto">
                <MoneyText valor={espelho.desconto} />
              </Dado>
              <Dado rotulo="Juros e multa">
                <MoneyText valor={espelho.juros} />
              </Dado>
              <Dado rotulo="Outras despesas">
                <MoneyText valor={espelho.outrasDespesas} />
              </Dado>
              <Dado
                rotulo="Saiu da conta"
                legenda={foiPaga ? null : "A parcela ainda não foi paga"}
              >
                {foiPaga ? <MoneyText valor={espelho.valorLiquido} /> : "-"}
              </Dado>
              <Dado rotulo="Conta bancária">{espelho.contaNome ?? "-"}</Dado>
              <Dado rotulo="Vencimento">
                {formatarData(espelho.dataVencimento)}
              </Dado>
              <Dado rotulo="Pago em">
                {foiPaga ? formatarData(espelho.dataPagamento) : "-"}
              </Dado>
            </Grade>
          </Secao>

          <Secao titulo="Lançamento de origem">
            <Grade>
              <Dado rotulo="Número">{espelho.lancamentoNumero ?? "-"}</Dado>
              <Dado rotulo="Fornecedor">{espelho.fornecedorNome ?? "-"}</Dado>
              <Dado rotulo="Categoria">{espelho.categoriaNome ?? "-"}</Dado>
              <Dado rotulo="Forma de pagamento">
                {espelho.formaPagamentoNome ?? "-"}
              </Dado>
              <Dado rotulo="Competência">
                {espelho.mesCompetencia
                  ? formatarMesAno(espelho.mesCompetencia)
                  : "-"}
              </Dado>
              <Dado rotulo="Valor do lançamento">
                <MoneyText valor={espelho.lancamentoValor} />
              </Dado>
              <Dado rotulo="Situação do lançamento">
                {espelho.lancamentoStatus
                  ? rotuloStatusLancamento(
                      espelho.lancamentoStatus,
                      espelho.lancamentoTipo ?? "a_pagar",
                    )
                  : "-"}
              </Dado>
            </Grade>
            {espelho.lancamentoDescricao ? (
              <p className="mt-3 text-detalhe">{espelho.lancamentoDescricao}</p>
            ) : null}
            {/*
              whitespace-pre-line: este é o texto que quem paga lê antes de
              mandar o dinheiro, e ele vem com CNPJ e chave PIX em linhas
              separadas. Sem isto as linhas colam umas nas outras e a chave fica
              impossível de conferir de olho.
            */}
            {espelho.lancamentoObservacoes ? (
              <p className="mt-1 whitespace-pre-line text-legenda text-muted-foreground">
                {espelho.lancamentoObservacoes}
              </p>
            ) : null}
          </Secao>

          <Secao titulo="Rateio por centro de custo">
            {espelho.rateios.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Este lançamento não tem rateio por centro de custo.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {espelho.rateios.map((rateio, indice) => (
                  <li
                    key={`${rateio.centroNome}-${indice}`}
                    className="flex items-center justify-between gap-3 border-b border-border pb-1.5 last:border-none last:pb-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-detalhe">
                      {rateio.centroCodigo ? `${rateio.centroCodigo} ` : ""}
                      {rateio.centroNome}
                    </span>
                    <MoneyText valor={rateio.valor} />
                  </li>
                ))}
                {/* A soma reduz sobre as linhas impressas acima, e nunca ecoa o
                    valor do lançamento: ecoar o pai esconderia a divergência
                    exatamente onde ela apareceria. */}
                <li className="flex items-center justify-between gap-3 pt-1 font-medium">
                  <span className="text-detalhe">Soma do rateio</span>
                  <MoneyText valor={espelho.somaRateios} />
                </li>
              </ul>
            )}
          </Secao>

          <Secao titulo="Anexos">
            <Anexos
              entidade="pagamento"
              entidadeId={espelho.id}
              anexos={detalhe.anexos}
              podeEditar={podeAnexar}
              onMudou={onMudou}
            />
          </Secao>

          <Secao titulo="Trilha das parcelas">
            {detalhe.trilha.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Nenhum evento registrado nas parcelas deste lançamento.
              </p>
            ) : (
              <Trilha eventos={detalhe.trilha} />
            )}
          </Secao>
        </div>
      )}

      {/* Dentro do FormDrawer, como no detalhe de usuário: o diálogo pertence a
          este painel, e montá-lo fora exigiria içar o estado para o pai só para
          pedir um motivo. */}
      <ConfirmDialog
        aberto={devolverAberto}
        onAbertoChange={setDevolverAberto}
        titulo="Voltar este pagamento para aprovação?"
        descricao="A parcela sai da fila de pagamento e volta para a fila de aprovação. A aprovação e a data autorizada são apagadas, e quem aprovar de novo escolhe a data outra vez. O lançamento continua vivo e continua contando na previsão de caixa."
        textoConfirmar="Voltar para aprovação"
        exigeMotivo
        onConfirmar={confirmarDevolucao}
      />
    </FormDrawer>
  );
}
