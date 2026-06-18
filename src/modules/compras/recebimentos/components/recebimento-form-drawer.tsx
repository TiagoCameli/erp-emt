"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatarQuantidade } from "@/lib/formatadores";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import { AnexosRegistro } from "@/modules/compras/_shared/anexos";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import { registrarRecebimento } from "@/modules/compras/recebimentos/actions";
import { paraNumero } from "@/modules/compras/recebimentos/calculo";
import type { OrdemReceptivel } from "@/modules/compras/recebimentos/queries";
import {
  recebimentoFormSchema,
  type RecebimentoFormInput,
} from "@/modules/compras/recebimentos/schemas";

const ID_FORM = "form-recebimento";

/** Data de hoje no formato do input date (yyyy-MM-dd). */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Valor inicial de quantidade de um item: o saldo a receber, com vírgula. */
function saldoComoTexto(saldo: number): string {
  if (saldo <= 0) return "0";
  return String(saldo).replace(".", ",");
}

function valoresIniciais(ordem: OrdemReceptivel | null): RecebimentoFormInput {
  return {
    ordemCompraId: ordem?.id ?? "",
    numeroNf: "",
    valorNf: "",
    dataRecebimento: hoje(),
    dataVencimento: hoje(),
    observacoes: "",
    itens: (ordem?.itens ?? []).map((item) => ({
      ocItemId: item.ocItemId,
      quantidadeRecebida: saldoComoTexto(item.saldoAReceber),
    })),
  };
}

export interface RecebimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordens: OrdemReceptivel[];
  /** Chamado com o id do recebimento gravado, para abrir o detalhe. */
  onRegistrado: (recebimentoId: string) => void;
}

/**
 * Drawer de registro de recebimento. Escolhe a OC entre as receptíveis, mostra
 * cada item com pedido, já recebido e o saldo, com input de quantidade recebida
 * agora (default = saldo). Os campos da NF (número, valor, data, vencimento)
 * vão para a RPC, que confere a divergência e atualiza a OC e o lançamento.
 * Os anexos só aparecem depois de gravar, já com o id do recebimento.
 */
export function RecebimentoFormDrawer({
  aberto,
  onAbertoChange,
  ordens,
  onRegistrado,
}: RecebimentoFormDrawerProps) {
  const [ordemId, setOrdemId] = React.useState<string>("");
  const [recebimentoId, setRecebimentoId] = React.useState<string | null>(null);

  const ordemSelecionada = ordens.find((ordem) => ordem.id === ordemId) ?? null;

  const form = useForm<RecebimentoFormInput>({
    resolver: zodResolver(recebimentoFormSchema),
    defaultValues: valoresIniciais(null),
  });

  // Ao trocar a OC, recarrega os itens com o saldo como default. form.reset não
  // é setState do componente, então pode rodar no efeito sem disparar o lint.
  React.useEffect(() => {
    form.reset(valoresIniciais(ordemSelecionada));
    // ordemId muda quando o usuário escolhe outra OC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordemId]);

  const salvando = form.formState.isSubmitting;
  const gravado = recebimentoId !== null;

  async function aoEnviar(valores: RecebimentoFormInput) {
    if (!ordemSelecionada) {
      toast.error("Selecione a ordem de compra");
      return;
    }

    const dados = {
      ordemCompraId: valores.ordemCompraId,
      numeroNf: valores.numeroNf.trim(),
      valorNf: paraNumero(valores.valorNf),
      dataRecebimento: valores.dataRecebimento,
      dataVencimento: valores.dataVencimento,
      observacoes:
        valores.observacoes && valores.observacoes.trim() !== ""
          ? valores.observacoes.trim()
          : undefined,
      itens: valores.itens.map((item) => ({
        ocItemId: item.ocItemId,
        quantidadeRecebida: paraNumero(item.quantidadeRecebida),
      })),
    };

    const resultado = await registrarRecebimento(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Recebimento registrado");
    // Mantém o drawer aberto para anexar a NF; libera o detalhe pelo rodapé.
    setRecebimentoId(resultado.recebimentoId);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar recebimento"
      descricao="Escolha a ordem de compra, confira a nota fiscal e as quantidades recebidas"
      larguraClassName="sm:max-w-2xl"
      rodape={
        gravado ? (
          <Button
            type="button"
            onClick={() => onRegistrado(recebimentoId)}
          >
            Ver recebimento
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAbertoChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" form={ID_FORM} disabled={salvando || !ordemId}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar recebimento"
              )}
            </Button>
          </>
        )
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="recebimento-oc"
          rotulo="Ordem de compra"
          obrigatorio
          erro={form.formState.errors.ordemCompraId?.message}
        >
          <Select
            value={ordemId}
            onValueChange={(valor) => {
              setOrdemId(valor);
              form.setValue("ordemCompraId", valor, { shouldValidate: true });
            }}
            disabled={salvando || gravado}
          >
            <SelectTrigger id="recebimento-oc" className="w-full">
              <SelectValue placeholder="Selecione a ordem" />
            </SelectTrigger>
            <SelectContent>
              {ordens.map((ordem) => (
                <SelectItem key={ordem.id} value={ordem.id}>
                  {ordem.numero ?? ordem.id.slice(0, 8)} · {ordem.fornecedorNome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        {ordemSelecionada ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="codigo-doc text-detalhe">
                  {ordemSelecionada.numero ?? "Sem número"}
                </p>
                <p className="truncate text-detalhe text-muted-foreground">
                  {ordemSelecionada.fornecedorNome}
                </p>
              </div>
              {(() => {
                const info = infoStatusOC(ordemSelecionada.status);
                return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
              })()}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-detalhe font-medium">Itens a receber</p>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Insumo</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Pedido
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Já recebido
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Saldo</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Receber agora
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordemSelecionada.itens.map((item, indice) => (
                      <tr
                        key={item.ocItemId}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2">
                          <span className="font-medium">{item.insumoNome}</span>
                          {item.insumoCodigo ? (
                            <span className="ml-1 codigo-doc text-muted-foreground">
                              {item.insumoCodigo}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarQuantidade(item.quantidadePedida)}
                          {item.unidadeSigla ? ` ${item.unidadeSigla}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarQuantidade(item.quantidadeRecebida)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarQuantidade(item.saldoAReceber)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            inputMode="decimal"
                            className="h-8 w-28 text-right tabular-nums"
                            disabled={salvando || gravado}
                            aria-label={`Quantidade recebida de ${item.insumoNome}`}
                            {...form.register(
                              `itens.${indice}.quantidadeRecebida`,
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.itens?.message ? (
                <p className="text-legenda text-destructive" role="alert">
                  {form.formState.errors.itens.message}
                </p>
              ) : null}
            </div>

            <CampoFormulario
              id="recebimento-numero-nf"
              rotulo="Número da nota fiscal"
              obrigatorio
              erro={form.formState.errors.numeroNf?.message}
            >
              <Input
                id="recebimento-numero-nf"
                placeholder="000123"
                disabled={salvando || gravado}
                {...form.register("numeroNf")}
              />
            </CampoFormulario>

            <div className="grid grid-cols-2 gap-4">
              <CampoFormulario
                id="recebimento-valor-nf"
                rotulo="Valor da nota fiscal"
                obrigatorio
                erro={form.formState.errors.valorNf?.message}
              >
                <Input
                  id="recebimento-valor-nf"
                  inputMode="decimal"
                  placeholder="1.234,56"
                  className="tabular-nums"
                  disabled={salvando || gravado}
                  {...form.register("valorNf")}
                />
              </CampoFormulario>

              <div />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <CampoFormulario
                id="recebimento-data"
                rotulo="Data do recebimento"
                obrigatorio
                erro={form.formState.errors.dataRecebimento?.message}
              >
                <Input
                  id="recebimento-data"
                  type="date"
                  disabled={salvando || gravado}
                  {...form.register("dataRecebimento")}
                />
              </CampoFormulario>

              <CampoFormulario
                id="recebimento-vencimento"
                rotulo="Vencimento"
                obrigatorio
                erro={form.formState.errors.dataVencimento?.message}
              >
                <Input
                  id="recebimento-vencimento"
                  type="date"
                  disabled={salvando || gravado}
                  {...form.register("dataVencimento")}
                />
              </CampoFormulario>
            </div>

            <CampoFormulario
              id="recebimento-observacoes"
              rotulo="Observações"
              erro={form.formState.errors.observacoes?.message}
            >
              <Textarea
                id="recebimento-observacoes"
                rows={3}
                placeholder="Anotações sobre o recebimento"
                disabled={salvando || gravado}
                {...form.register("observacoes")}
              />
            </CampoFormulario>
          </>
        ) : null}
      </form>

      {gravado && recebimentoId ? (
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5">
          <p className="text-detalhe font-medium">Anexos da nota</p>
          <p className="text-legenda text-muted-foreground">
            Anexe o PDF ou a foto da nota fiscal deste recebimento.
          </p>
          <AnexosRegistro
            tabela="recebimentos"
            registroId={recebimentoId}
            podeEditar
          />
        </div>
      ) : null}
    </FormDrawer>
  );
}
