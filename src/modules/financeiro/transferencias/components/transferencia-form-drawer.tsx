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
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { salvarTransferencia } from "@/modules/financeiro/transferencias/actions";
import type {
  ContaOpcao,
  TransferenciaLista,
} from "@/modules/financeiro/transferencias/queries";
import {
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
): TransferenciaFormInput {
  return {
    contaOrigemId: transferencia?.contaOrigemId ?? "",
    contaDestinoId: transferencia?.contaDestinoId ?? "",
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
  };
}

/** Rótulo da conta no seletor: nome e saldo, para decidir de onde tirar. */
function rotuloConta(conta: ContaOpcao): string {
  return `${conta.nome} (${formatarBRL(conta.saldoAtual)})`;
}

export interface TransferenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Transferência em edição, ou null para criar uma nova. */
  transferencia: TransferenciaLista | null;
  contas: ContaOpcao[];
  /**
   * Abre a confirmação de exclusão. Ausente quando o usuário não tem permissão
   * de excluir, e o botão some junto — botão que sempre recusa é pior que
   * botão nenhum.
   */
  onSolicitarExclusao?: () => void;
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
  onSolicitarExclusao,
}: TransferenciaFormDrawerProps) {
  const editando = transferencia !== null;

  const form = useForm<TransferenciaFormInput>({
    resolver: zodResolver(transferenciaFormSchema),
    defaultValues: valoresIniciais(transferencia),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(transferencia));
  }, [aberto, transferencia, form]);

  const salvando = form.formState.isSubmitting;

  const origemId = form.watch("contaOrigemId");
  const destinoId = form.watch("contaDestinoId");
  const valorTexto = form.watch("valor");
  const tarifaTexto = form.watch("tarifa");

  const valor = paraNumero(valorTexto ?? "");
  const tarifa = paraNumero(tarifaTexto ?? "");
  const contaOrigem = contas.find((conta) => conta.id === origemId) ?? null;
  const contaDestino = contas.find((conta) => conta.id === destinoId) ?? null;

  async function aoEnviar(valores: TransferenciaFormInput) {
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
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      editando ? "Transferência salva" : "Transferência registrada",
    );
    onAbertoChange(false);
  }

  // O destino não oferece a conta já escolhida como origem: banir depois, no
  // envio, faria a pessoa preencher tudo para só então descobrir.
  const opcoesOrigem = contas.filter((conta) => conta.id !== destinoId);
  const opcoesDestino = contas.filter((conta) => conta.id !== origemId);

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar transferência" : "Nova transferência"}
      descricao="Movimentação entre contas da empresa. Não entra no resultado: só muda o saldo das duas contas"
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
        onSubmit={form.handleSubmit(aoEnviar)}
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
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  Saldo da origem depois
                </dt>
                <dd>
                  <MoneyText valor={contaOrigem.saldoAtual - valor - tarifa} />
                </dd>
              </div>
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
