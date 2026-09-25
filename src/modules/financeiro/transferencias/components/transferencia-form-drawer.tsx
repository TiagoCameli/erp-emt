"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { salvarTransferencia } from "@/modules/financeiro/transferencias/actions";
import type {
  AplicacaoOpcao,
  ContaOpcao,
  TransferenciaLista,
} from "@/modules/financeiro/transferencias/queries";
import {
  contasDoOutroLado,
  ehMovimentoDeInvestimento,
  transferenciaFormSchema,
  type TransferenciaFormInput,
} from "@/modules/financeiro/transferencias/schemas";

const ID_FORM = "form-transferencia";

/** Hoje em America/Rio_Branco, no formato do input date. */
function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
  }).format(new Date());
}

/** Número guardado no banco de volta para o formato do InputMoeda ("1234,56"). */
function paraCampo(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

function valoresIniciais(
  transferencia: TransferenciaLista | null,
  inicial?: Partial<TransferenciaFormInput>,
): TransferenciaFormInput {
  return {
    contaOrigemId: transferencia?.contaOrigemId ?? inicial?.contaOrigemId ?? "",
    contaDestinoId: transferencia?.contaDestinoId ?? inicial?.contaDestinoId ?? "",
    dataTransferencia: transferencia?.dataTransferencia ?? hojeISO(),
    valor: transferencia ? paraCampo(transferencia.valor) : "",
    // Tarifa nasce vazia, não "0,00": a maioria das transferências não tem
    // tarifa, e um zero pré-preenchido vira um campo que ninguém lê.
    tarifa:
      transferencia && transferencia.tarifa > 0
        ? paraCampo(transferencia.tarifa)
        : "",
    descricao: transferencia?.descricao ?? "",
    observacoes: transferencia?.observacoes ?? "",
    aplicacaoId: transferencia?.aplicacaoId ?? inicial?.aplicacaoId ?? "",
  };
}

/**
 * Rótulo da conta no seletor: nome e saldo, para decidir de onde tirar.
 *
 * Sem permissão de ver o saldo, fica só o nome. `formatarBRL(null)` devolveria
 * "R$ 0,00" e a conta apareceria zerada no seletor — número errado com cara de
 * certo, exatamente no lugar em que se decide de onde tirar o dinheiro.
 */
function rotuloConta(conta: ContaOpcao): string {
  if (conta.saldoAtual === null) return conta.nome;
  return `${conta.nome} (${formatarBRL(conta.saldoAtual)})`;
}

export interface TransferenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Transferência em edição, ou null para criar uma nova. */
  transferencia: TransferenciaLista | null;
  contas: ContaOpcao[];
  /** As aplicações (CDB, fundo) para quando uma ponta é subconta de investimentos. */
  aplicacoes: AplicacaoOpcao[];
  /**
   * Abre a confirmação de exclusão. Ausente quando o usuário não tem permissão
   * de excluir, e o botão some junto — botão que sempre recusa é pior que
   * botão nenhum.
   */
  onSolicitarExclusao?: () => void;
  /**
   * Pré-preenchimento de uma transferência NOVA. A aba Aplicações abre
   * "Aplicar" e "Resgatar" com a conta, a subconta e a aplicação já escolhidas:
   * a ação é a mesma transferência, só que sem a pessoa ter de achar a subconta.
   */
  inicial?: Partial<TransferenciaFormInput>;
  /** Título no lugar de "Nova transferência" (ex.: "Aplicar"). */
  tituloNovo?: string;
}

/**
 * Drawer de criação e edição de transferência entre contas.
 *
 * A prévia do rodapé é o ponto da tela: ela mostra quanto sai da origem (valor
 * mais tarifa) e quanto entra no destino (só o valor). Sem ela, a diferença
 * entre os dois números — que é exatamente a tarifa — só apareceria depois, no
 * saldo, e pareceria erro do sistema.
 */
export function TransferenciaFormDrawer({
  aberto,
  onAbertoChange,
  transferencia,
  contas,
  aplicacoes,
  onSolicitarExclusao,
  inicial,
  tituloNovo,
}: TransferenciaFormDrawerProps) {
  const editando = transferencia !== null;

  const form = useForm<TransferenciaFormInput>({
    resolver: zodResolver(transferenciaFormSchema),
    defaultValues: valoresIniciais(transferencia, inicial),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(transferencia, inicial));
    // `inicial` entra só na abertura: mudar a referência dele com o drawer
    // aberto apagaria o que a pessoa já digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, transferencia, form]);

  const salvando = form.formState.isSubmitting;

  const origemId = form.watch("contaOrigemId");
  const destinoId = form.watch("contaDestinoId");
  const valorTexto = form.watch("valor");
  const tarifaTexto = form.watch("tarifa");

  const valor = paraNumero(valorTexto ?? "");
  const tarifa = paraNumero(tarifaTexto ?? "");
  const aplicacaoId = form.watch("aplicacaoId");
  const contaOrigem = contas.find((conta) => conta.id === origemId) ?? null;
  const contaDestino = contas.find((conta) => conta.id === destinoId) ?? null;
  const deInvestimento = ehMovimentoDeInvestimento(contaOrigem, contaDestino);
  const aplicando = contaDestino?.tipo === "investimento";

  async function aoEnviar(valores: TransferenciaFormInput) {
    // Aplicação é obrigatória só quando uma ponta é subconta; fora disso ela não
    // vai, mesmo que tenha sobrado escolhida de uma troca de conta.
    if (deInvestimento && valores.aplicacaoId === "") {
      form.setError("aplicacaoId", {
        message: "Escolha em qual aplicação o dinheiro está",
      });
      return;
    }
    const resultado = await salvarTransferencia(transferencia?.id ?? null, {
      contaOrigemId: valores.contaOrigemId,
      contaDestinoId: valores.contaDestinoId,
      dataTransferencia: valores.dataTransferencia,
      valor: paraNumero(valores.valor),
      tarifa: paraNumero(valores.tarifa),
      descricao:
        valores.descricao.trim() === "" ? undefined : valores.descricao,
      observacoes:
        valores.observacoes.trim() === "" ? undefined : valores.observacoes,
      aplicacaoId:
        deInvestimento && valores.aplicacaoId !== ""
          ? valores.aplicacaoId
          : undefined,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      editando
        ? "Transferência salva"
        : deInvestimento
          ? aplicando
            ? "Aplicação registrada"
            : "Resgate registrado"
          : "Transferência registrada",
    );
    onAbertoChange(false);
  }

  // Cada lado só oferece o que combina com o outro: a conta já escolhida some, e
  // a subconta de investimentos só aparece do lado da própria conta. Barrar
  // depois, no envio, faria a pessoa preencher tudo para só então descobrir.
  const opcoesOrigem = contasDoOutroLado(contas, contaDestino);
  const opcoesDestino = contasDoOutroLado(contas, contaOrigem);

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar transferência" : (tituloNovo ?? "Nova transferência")}
      descricao="Movimentação entre contas da empresa. Não entra no resultado: só muda o saldo das duas contas. Para aplicar, escolha como destino a subconta · INVESTIMENTOS da conta; para resgatar, ela como origem"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          {editando && onSolicitarExclusao ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              onClick={onSolicitarExclusao}
              disabled={salvando}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar transferência"
            ) : (
              "Registrar transferência"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="transferencia-origem"
          rotulo="Conta de origem"
          obrigatorio
          ajuda="De onde o dinheiro sai. O valor entre parênteses é o saldo atual da conta."
          erro={form.formState.errors.contaOrigemId?.message}
        >
          <Combobox
            valor={origemId}
            onValorChange={(valor) =>
              form.setValue("contaOrigemId", valor, { shouldValidate: true })
            }
            opcoes={opcoesOrigem.map((conta) => ({
              valor: conta.id,
              rotulo: rotuloConta(conta),
            }))}
            placeholder="Selecione a conta de origem"
            disabled={salvando}
            className="w-full"
            id="transferencia-origem"
          />
        </CampoFormulario>

        <CampoFormulario
          id="transferencia-destino"
          rotulo="Conta de destino"
          obrigatorio
          ajuda="Para onde o dinheiro vai."
          erro={form.formState.errors.contaDestinoId?.message}
        >
          <Combobox
            valor={destinoId}
            onValorChange={(valor) =>
              form.setValue("contaDestinoId", valor, { shouldValidate: true })
            }
            opcoes={opcoesDestino.map((conta) => ({
              valor: conta.id,
              rotulo: rotuloConta(conta),
            }))}
            placeholder="Selecione a conta de destino"
            disabled={salvando}
            className="w-full"
            id="transferencia-destino"
          />
        </CampoFormulario>

        {deInvestimento ? (
          <CampoFormulario
            id="transferencia-aplicacao"
            rotulo="Aplicação"
            obrigatorio
            ajuda={
              aplicando
                ? "Em qual aplicação o dinheiro entra. Aplicar não é despesa: o dinheiro só muda de bolso e continua da empresa."
                : "De qual aplicação o dinheiro está saindo."
            }
            erro={form.formState.errors.aplicacaoId?.message}
          >
            <Combobox
              valor={aplicacaoId}
              onValorChange={(valor) =>
                form.setValue("aplicacaoId", valor, { shouldValidate: true })
              }
              opcoes={aplicacoes.map((aplicacao) => ({
                valor: aplicacao.id,
                rotulo: aplicacao.nome,
              }))}
              placeholder="Selecione a aplicação"
              disabled={salvando}
              className="w-full"
              id="transferencia-aplicacao"
            />
          </CampoFormulario>
        ) : null}

        <LinhaCampos>
          <CampoFormulario
            id="transferencia-data"
            rotulo="Data"
            obrigatorio
            erro={form.formState.errors.dataTransferencia?.message}
          >
            <Input
              id="transferencia-data"
              type="date"
              disabled={salvando}
              {...form.register("dataTransferencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="transferencia-valor"
            rotulo="Valor"
            obrigatorio
            erro={form.formState.errors.valor?.message}
          >
            <InputMoeda
              id="transferencia-valor"
              valor={valorTexto ?? ""}
              onValorChange={(valor) =>
                form.setValue("valor", valor, { shouldValidate: true })
              }
              disabled={salvando}
            />
          </CampoFormulario>

          <CampoFormulario
            id="transferencia-tarifa"
            rotulo="Tarifa"
            ajuda="Tarifa do banco (TED, DOC). Sai junto com o valor, da conta de origem."
            erro={form.formState.errors.tarifa?.message}
          >
            <InputMoeda
              id="transferencia-tarifa"
              valor={tarifaTexto ?? ""}
              onValorChange={(valor) =>
                form.setValue("tarifa", valor, { shouldValidate: true })
              }
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        {valor > 0 && contaOrigem && contaDestino ? (
          <div className="rounded-md border border-border bg-surface px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-detalhe">
              <span className="font-medium">{contaOrigem.nome}</span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="font-medium">{contaDestino.nome}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-legenda sm:grid-cols-3">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Sai da origem</dt>
                <dd>
                  <MoneyText valor={valor + tarifa} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Entra no destino</dt>
                <dd>
                  <MoneyText valor={valor} />
                </dd>
              </div>
              {/* A projeção só existe se o saldo da origem for visível. Sem
                  permissão, a linha inteira sai: mostrá-la partindo de zero daria
                  um "saldo depois" negativo e assustador que não é verdade. */}
              {contaOrigem.saldoAtual === null ? null : (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Saldo da origem depois
                  </dt>
                  <dd>
                    <MoneyText
                      valor={contaOrigem.saldoAtual - valor - tarifa}
                    />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : null}

        <CampoFormulario
          id="transferencia-descricao"
          rotulo="Descrição"
          ajuda="Em uma linha, para que foi a transferência."
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="transferencia-descricao"
            autoComplete="off"
            placeholder="Cobertura de folha da BR-364"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="transferencia-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="transferencia-observacoes"
            placeholder="Detalhes que não cabem na descrição"
            rows={3}
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
