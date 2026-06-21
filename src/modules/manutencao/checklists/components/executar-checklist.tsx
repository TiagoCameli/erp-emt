"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleSlash, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import type {
  ColaboradorOpcao,
  EquipamentoOpcao,
} from "@/modules/manutencao/_shared/queries";
import { executarChecklist } from "@/modules/manutencao/checklists/actions";
import type { ChecklistAtivo } from "@/modules/manutencao/checklists/queries";
import {
  execucaoFormParaInput,
  execucaoFormSchema,
  type ExecucaoFormInput,
  type RespostaChecklist,
} from "@/modules/manutencao/checklists/schemas";

const ID_FORM = "form-executar-checklist";
const SEM_OPERADOR = "sem-operador";

/** Valores iniciais do formulário, em branco (abrir OS ligado por padrão). */
function valoresIniciais(): ExecucaoFormInput {
  return {
    checklistId: "",
    equipamentoId: "",
    operadorId: "",
    horimetro: "",
    km: "",
    observacao: "",
    abrirOs: true,
    respostas: [],
  };
}

/** Opção de resposta com rótulo, ícone e classes do estado selecionado. */
interface OpcaoResposta {
  valor: RespostaChecklist;
  rotulo: string;
  icone: typeof Check;
  classesAtivo: string;
}

const OPCOES_RESPOSTA: OpcaoResposta[] = [
  {
    valor: "ok",
    rotulo: "OK",
    icone: Check,
    classesAtivo:
      "border-status-aprovado bg-status-aprovado/10 text-status-aprovado",
  },
  {
    valor: "nok",
    rotulo: "Não OK",
    icone: X,
    classesAtivo:
      "border-status-rejeitado bg-status-rejeitado/10 text-status-rejeitado",
  },
  {
    valor: "na",
    rotulo: "N/A",
    icone: CircleSlash,
    classesAtivo: "border-foreground bg-muted text-foreground",
  },
];

export interface ExecutarChecklistProps {
  checklistsAtivos: ChecklistAtivo[];
  equipamentos: EquipamentoOpcao[];
  colaboradores: ColaboradorOpcao[];
}

/**
 * Executor de checklist pré-uso, mobile-first. Escolhe o checklist (carrega as
 * perguntas dele), o equipamento, o operador e a leitura (horímetro ou km,
 * conforme o controle do equipamento). Cada pergunta tem botões grandes OK /
 * Não OK / N/A; o campo de observação aparece quando a resposta é Não OK. Item
 * reprovado pode abrir uma OS corretiva automaticamente.
 */
export function ExecutarChecklist({
  checklistsAtivos,
  equipamentos,
  colaboradores,
}: ExecutarChecklistProps) {
  const form = useForm<ExecucaoFormInput>({
    resolver: zodResolver(execucaoFormSchema),
    defaultValues: valoresIniciais(),
  });

  const checklistId = form.watch("checklistId");
  const equipamentoId = form.watch("equipamentoId");
  const operadorId = form.watch("operadorId");
  const abrirOs = form.watch("abrirOs");
  const respostas = form.watch("respostas");

  const equipamento = equipamentos.find((eq) => eq.id === equipamentoId);
  const controlePor = equipamento?.controlePor ?? "nenhum";

  const salvando = form.formState.isSubmitting;
  const erroRespostas = form.formState.errors.respostas;

  // Trocar o checklist carrega as perguntas dele no array de respostas.
  function aoTrocarChecklist(valor: string) {
    form.setValue("checklistId", valor, { shouldValidate: true });
    const escolhido = checklistsAtivos.find((c) => c.id === valor);
    form.setValue(
      "respostas",
      (escolhido?.perguntas ?? []).map((pergunta) => ({
        perguntaId: pergunta.id,
        pergunta: pergunta.pergunta,
        resposta: "ok",
        observacao: "",
      })),
      { shouldValidate: false },
    );
  }

  async function aoEnviar(valores: ExecucaoFormInput) {
    const resultado = await executarChecklist(execucaoFormParaInput(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      resultado.abriuOs
        ? "Checklist enviado. OS aberta para os itens reprovados."
        : "Checklist enviado",
    );
    form.reset(valoresIniciais());
  }

  return (
    <form
      id={ID_FORM}
      onSubmit={form.handleSubmit(aoEnviar)}
      className={classesFormulario}
      noValidate
    >
      <CampoFormulario
        id="exec-checklist"
        rotulo="Checklist"
        obrigatorio
        erro={form.formState.errors.checklistId?.message}
      >
        <Select
          value={checklistId}
          onValueChange={aoTrocarChecklist}
          disabled={salvando}
        >
          <SelectTrigger id="exec-checklist" className="h-11 w-full">
            <SelectValue placeholder="Selecione o checklist" />
          </SelectTrigger>
          <SelectContent>
            {checklistsAtivos.length === 0 ? (
              <div className="px-2 py-1.5 text-detalhe text-muted-foreground">
                Nenhum checklist com perguntas
              </div>
            ) : (
              checklistsAtivos.map((checklist) => (
                <SelectItem key={checklist.id} value={checklist.id}>
                  {checklist.nome}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </CampoFormulario>

      <CampoFormulario
        id="exec-equipamento"
        rotulo="Equipamento"
        obrigatorio
        erro={form.formState.errors.equipamentoId?.message}
      >
        <Select
          value={equipamentoId}
          onValueChange={(valor) =>
            form.setValue("equipamentoId", valor, { shouldValidate: true })
          }
          disabled={salvando}
        >
          <SelectTrigger id="exec-equipamento" className="h-11 w-full">
            <SelectValue placeholder="Selecione o equipamento" />
          </SelectTrigger>
          <SelectContent>
            {equipamentos.map((eq) => (
              <SelectItem key={eq.id} value={eq.id}>
                {eq.descricao}
                {eq.placa ? ` (${eq.placa})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoFormulario>

      <CampoFormulario id="exec-operador" rotulo="Operador" ajuda="Opcional">
        <Select
          value={operadorId === "" ? SEM_OPERADOR : operadorId}
          onValueChange={(valor) =>
            form.setValue("operadorId", valor === SEM_OPERADOR ? "" : valor)
          }
          disabled={salvando}
        >
          <SelectTrigger id="exec-operador" className="h-11 w-full">
            <SelectValue placeholder="Sem operador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_OPERADOR}>Sem operador</SelectItem>
            {colaboradores.map((colaborador) => (
              <SelectItem key={colaborador.id} value={colaborador.id}>
                {colaborador.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoFormulario>

      {controlePor === "horimetro" ? (
        <CampoFormulario
          id="exec-horimetro"
          rotulo="Horímetro"
          ajuda="Opcional"
          erro={form.formState.errors.horimetro?.message}
        >
          <Input
            id="exec-horimetro"
            inputMode="decimal"
            placeholder="0"
            className="h-11 text-right tabular-nums"
            disabled={salvando}
            {...form.register("horimetro")}
          />
        </CampoFormulario>
      ) : null}

      {controlePor === "km" ? (
        <CampoFormulario
          id="exec-km"
          rotulo="Quilometragem"
          ajuda="Opcional"
          erro={form.formState.errors.km?.message}
        >
          <Input
            id="exec-km"
            inputMode="decimal"
            placeholder="0"
            className="h-11 text-right tabular-nums"
            disabled={salvando}
            {...form.register("km")}
          />
        </CampoFormulario>
      ) : null}

      {/* Perguntas */}
      <div className="flex flex-col gap-3">
        <h3 className="text-detalhe font-semibold">Perguntas</h3>

        {checklistId === "" ? (
          <p className="text-detalhe text-muted-foreground">
            Escolha um checklist para carregar as perguntas.
          </p>
        ) : respostas.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Este checklist não tem perguntas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {respostas.map((item, indice) => {
              const respostaAtual = item.resposta;
              return (
                <div
                  key={item.perguntaId}
                  className="flex flex-col gap-3 rounded-md border border-border bg-surface px-3 py-3"
                >
                  <p className="text-corpo font-medium">{item.pergunta}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {OPCOES_RESPOSTA.map((opcao) => {
                      const ativo = respostaAtual === opcao.valor;
                      const Icone = opcao.icone;
                      return (
                        <button
                          key={opcao.valor}
                          type="button"
                          disabled={salvando}
                          aria-pressed={ativo}
                          onClick={() =>
                            form.setValue(
                              `respostas.${indice}.resposta`,
                              opcao.valor,
                            )
                          }
                          className={cn(
                            "flex h-11 items-center justify-center gap-1.5 rounded-md border text-detalhe font-medium transition-colors",
                            ativo
                              ? opcao.classesAtivo
                              : "border-border text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          <Icone className="size-4" aria-hidden />
                          {opcao.rotulo}
                        </button>
                      );
                    })}
                  </div>
                  {respostaAtual === "nok" ? (
                    <Textarea
                      rows={2}
                      placeholder="O que está errado? (opcional)"
                      aria-label={`Observação da pergunta ${indice + 1}`}
                      disabled={salvando}
                      {...form.register(`respostas.${indice}.observacao`)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {typeof erroRespostas?.message === "string" ? (
          <p className="text-legenda text-destructive" role="alert">
            {erroRespostas.message}
          </p>
        ) : null}
      </div>

      <CampoFormulario
        id="exec-observacao"
        rotulo="Observação geral"
        ajuda="Opcional"
        erro={form.formState.errors.observacao?.message}
      >
        <Textarea
          id="exec-observacao"
          rows={2}
          placeholder="Alguma observação sobre o equipamento"
          disabled={salvando}
          {...form.register("observacao")}
        />
      </CampoFormulario>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface px-3 py-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="exec-abrir-os">Abrir OS para itens reprovados</Label>
          <p className="text-legenda text-muted-foreground">
            Quando ligado, um item Não OK abre uma OS corretiva automaticamente.
          </p>
        </div>
        <Switch
          id="exec-abrir-os"
          checked={abrirOs}
          onCheckedChange={(valor) => form.setValue("abrirOs", valor)}
          disabled={salvando}
          aria-label="Abrir OS para itens reprovados"
        />
      </div>

      <Button
        type="submit"
        form={ID_FORM}
        size="lg"
        className="h-12 w-full"
        disabled={salvando || checklistId === "" || respostas.length === 0}
      >
        {salvando ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : null}
        Enviar checklist
      </Button>
    </form>
  );
}
