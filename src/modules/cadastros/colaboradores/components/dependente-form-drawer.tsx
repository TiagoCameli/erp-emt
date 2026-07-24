"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  LinhaCampos,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  salvarDependente,
  type Dependente,
} from "@/modules/cadastros/colaboradores/dependentes";
import {
  PARENTESCOS,
  ROTULO_PARENTESCO,
  dependenteSchema,
} from "@/modules/cadastros/colaboradores/dependentes-schemas";

const ID_FORM = "form-dependente";

/**
 * Schema só do formulário: parentesco fica como string livre (o Combobox
 * começa vazio, sem "sentinela") e é validado contra `PARENTESCOS` aqui —
 * evita escolher um parentesco arbitrário como default só pra satisfazer um
 * `z.enum` (mesmo raciocínio dos campos opcionais com sentinela "sem-*" do
 * form de colaborador, mas aqui o campo é obrigatório e não tem "nenhum").
 */
const formSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  dataNascimento: z.string(),
  parentesco: z
    .string()
    .refine((valor) => (PARENTESCOS as readonly string[]).includes(valor), {
      error: "Selecione o parentesco",
    }),
  cpf: z.string(),
  dependenteIrrf: z.boolean(),
  dependenteSalarioFamilia: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function valoresIniciais(dependente: Dependente | null): FormValues {
  return {
    nome: dependente?.nome ?? "",
    dataNascimento: dependente?.dataNascimento ?? "",
    parentesco: dependente?.parentesco ?? "",
    cpf: dependente?.cpf ?? "",
    dependenteIrrf: dependente?.dependenteIrrf ?? false,
    dependenteSalarioFamilia: dependente?.dependenteSalarioFamilia ?? false,
  };
}

export interface DependenteFormDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradorId: string;
  /** Dependente em edição. Ausente/null cria um novo. */
  dependente?: Dependente | null;
  /** Chamado depois de salvar com sucesso (fecha e o pai recarrega a lista). */
  onSalvo: () => void;
}

/**
 * Dialog compacto (não FormDrawer em tela cheia, pra não empilhar duas telas
 * cheias quando aberto de dentro do form do colaborador) de criar/editar um
 * dependente. Sem `dependente` cria, com `dependente` edita — mesmo padrão
 * de decisão do `dependenteSchema`/`salvarDependente`.
 */
export function DependenteFormDialog({
  aberto,
  onAbertoChange,
  colaboradorId,
  dependente = null,
  onSalvo,
}: DependenteFormDialogProps) {
  const editando = dependente !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valoresIniciais(dependente),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(dependente));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, dependente]);

  const salvando = form.formState.isSubmitting;
  const parentescoValor = form.watch("parentesco");
  const irrfValor = form.watch("dependenteIrrf");
  const salarioFamiliaValor = form.watch("dependenteSalarioFamilia");

  async function aoEnviar(valores: FormValues) {
    const input = dependenteSchema.parse({
      id: dependente?.id,
      colaboradorId,
      nome: valores.nome,
      dataNascimento: valores.dataNascimento,
      parentesco: valores.parentesco,
      cpf: valores.cpf,
      dependenteIrrf: valores.dependenteIrrf,
      dependenteSalarioFamilia: valores.dependenteSalarioFamilia,
    });

    const resultado = await salvarDependente(input);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Dependente atualizado" : "Dependente adicionado");
    onAbertoChange(false);
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar dependente" : "Adicionar dependente"}
          </DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            Cadastro do dependente para IRRF e salário-família. Nenhuma regra
            fiscal é aplicada aqui, só o registro.
          </DialogDescription>
        </DialogHeader>

        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className={classesFormulario}
          noValidate
        >
          <CampoFormulario
            id="dependente-nome"
            rotulo="Nome"
            obrigatorio
            erro={form.formState.errors.nome?.message}
          >
            <Input
              id="dependente-nome"
              autoComplete="off"
              placeholder="Nome completo"
              disabled={salvando}
              {...form.register("nome")}
            />
          </CampoFormulario>

          <LinhaCampos>
            <CampoFormulario
              id="dependente-nascimento"
              rotulo="Data de nascimento"
              erro={form.formState.errors.dataNascimento?.message}
            >
              <Input
                id="dependente-nascimento"
                type="date"
                disabled={salvando}
                {...form.register("dataNascimento")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="dependente-parentesco"
              rotulo="Parentesco"
              obrigatorio
              erro={form.formState.errors.parentesco?.message}
            >
              <Combobox
                valor={parentescoValor}
                onValorChange={(valor) =>
                  form.setValue("parentesco", valor, { shouldValidate: true })
                }
                opcoes={PARENTESCOS.map((parentesco) => ({
                  valor: parentesco,
                  rotulo: ROTULO_PARENTESCO[parentesco],
                }))}
                placeholder="Selecione o parentesco"
                disabled={salvando}
                className="w-full"
                id="dependente-parentesco"
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario
            id="dependente-cpf"
            rotulo="CPF"
            erro={form.formState.errors.cpf?.message}
          >
            <Input
              id="dependente-cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              disabled={salvando}
              {...form.register("cpf")}
            />
          </CampoFormulario>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-3 py-2">
            <Label htmlFor="dependente-irrf">Dependente para IRRF</Label>
            <Switch
              id="dependente-irrf"
              checked={irrfValor}
              onCheckedChange={(valor) => form.setValue("dependenteIrrf", valor)}
              disabled={salvando}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-3 py-2">
            <Label htmlFor="dependente-salario-familia">
              Dependente para salário-família
            </Label>
            <Switch
              id="dependente-salario-familia"
              checked={salarioFamiliaValor}
              onCheckedChange={(valor) =>
                form.setValue("dependenteSalarioFamilia", valor)
              }
              disabled={salvando}
            />
          </div>
        </form>

        <DialogFooter>
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
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar dependente"
            ) : (
              "Adicionar dependente"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
