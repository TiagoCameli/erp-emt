"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import {
  cotacaoFormSchema,
  type CotacaoFormInput,
} from "@/modules/compras/cotacoes/schemas";

const ID_FORM = "form-nova-cotacao";

export interface NovaCotacaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  criando: boolean;
  onCriar: (observacoes: string) => void;
}

/**
 * Drawer de nova cotação avulsa: só observações. A montagem do mapa de
 * preços acontece no detalhe.
 */
export function NovaCotacaoDrawer({
  aberto,
  onAbertoChange,
  criando,
  onCriar,
}: NovaCotacaoDrawerProps) {
  const form = useForm<CotacaoFormInput>({
    resolver: zodResolver(cotacaoFormSchema),
    defaultValues: { observacoes: "" },
  });

  React.useEffect(() => {
    if (aberto) form.reset({ observacoes: "" });
  }, [aberto, form]);

  function aoEnviar(valores: CotacaoFormInput) {
    onCriar(valores.observacoes);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova cotação"
      descricao="Os fornecedores e preços você adiciona no detalhe"
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
