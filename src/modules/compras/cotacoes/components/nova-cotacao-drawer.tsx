"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import {
  cotacaoFormSchema,
  type CotacaoFormInput,
} from "@/modules/compras/cotacoes/schemas";
import type { PedidoAprovadoOpcao } from "@/modules/compras/cotacoes/queries";

const SEM_PEDIDO = "sem-pedido";
const ID_FORM = "form-nova-cotacao";

export interface NovaCotacaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  pedidos: PedidoAprovadoOpcao[];
  criando: boolean;
  onCriar: (pedidoId: string | undefined, observacoes: string) => void;
}

/**
 * Drawer de nova cotação: escolhe um pedido aprovado de origem (opcional) e
 * deixa observações. A montagem do mapa de preços acontece no detalhe.
 */
export function NovaCotacaoDrawer({
  aberto,
  onAbertoChange,
  pedidos,
  criando,
  onCriar,
}: NovaCotacaoDrawerProps) {
  const form = useForm<CotacaoFormInput>({
    resolver: zodResolver(cotacaoFormSchema),
    defaultValues: { pedidoId: undefined, observacoes: "" },
  });

  React.useEffect(() => {
    if (aberto) form.reset({ pedidoId: undefined, observacoes: "" });
  }, [aberto, form]);

  function aoEnviar(valores: CotacaoFormInput) {
    onCriar(valores.pedidoId, valores.observacoes);
  }

  const pedidoValor = form.watch("pedidoId") ?? SEM_PEDIDO;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova cotação"
      descricao="A partir de um pedido aprovado ou avulsa. Os fornecedores e preços você adiciona no detalhe"
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={criando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={criando}>
            {criando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Criando...
              </>
            ) : (
              "Criar cotação"
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
          id="cotacao-pedido"
          rotulo="Pedido de origem"
          ajuda="Vincula a cotação a um pedido aprovado. Deixe em branco para cotação avulsa"
          erro={form.formState.errors.pedidoId?.message}
        >
          <Select
            value={pedidoValor}
            onValueChange={(valor) =>
              form.setValue(
                "pedidoId",
                valor === SEM_PEDIDO ? undefined : valor,
                { shouldValidate: true },
              )
            }
            disabled={criando}
          >
            <SelectTrigger id="cotacao-pedido" className="w-full">
              <SelectValue placeholder="Cotação avulsa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PEDIDO}>Cotação avulsa</SelectItem>
              {pedidos.map((pedido) => (
                <SelectItem key={pedido.id} value={pedido.id}>
                  {pedido.numero ?? pedido.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <CampoFormulario
          id="cotacao-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="cotacao-observacoes"
            rows={3}
            placeholder="Anotações sobre a cotação"
            disabled={criando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
