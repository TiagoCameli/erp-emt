"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
  LinhaCampos,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import {
  criarConta,
  editarConta,
} from "@/modules/financeiro/contas-bancarias/actions";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import {
  BANCO_CONTA,
  ROTULO_TIPO_CONTA,
  TIPO_CONTA,
  contaFormSchema,
  type ContaFormInput,
} from "@/modules/financeiro/contas-bancarias/schemas";

const ID_FORM = "form-conta-bancaria";

/** Valores iniciais do formulário, a partir de uma conta ou em branco. */
function valoresIniciais(conta: ContaLista | null): ContaFormInput {
  return {
    nome: conta?.nome ?? "",
    banco: conta?.banco ?? "caixa",
    agencia: conta?.agencia ?? "",
    conta: conta?.conta ?? "",
    tipo: conta?.tipo ?? "corrente",
    // `saldoInicial` null é SEM PERMISSÃO de ver o saldo desta conta, e o campo
    // fica escondido. O teste explícito contra null não é zelo: `null !==
    // undefined` é true, então a versão anterior caía no `String(null)` e o
    // campo abria com o texto "null" — que ao salvar viraria NaN.
    saldoInicial:
      conta?.saldoInicial !== undefined && conta?.saldoInicial !== null
        ? String(conta.saldoInicial).replace(".", ",")
        : "",
    saldoInicialData: conta?.saldoInicialData ?? "",
    ativo: conta?.ativo ?? true,
  };
}

export interface ContasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Conta em edição, ou null para criar uma nova. */
  conta: ContaLista | null;
}

/**
 * Drawer de criação e edição de conta bancária. Mesmo formulário para os dois
 * modos: quando conta é null, cria; quando vem preenchida, edita.
 */
export function ContasFormDrawer({
  aberto,
  onAbertoChange,
  conta,
}: ContasFormDrawerProps) {
  const editando = conta !== null;

  const form = useForm<ContaFormInput>({
    resolver: zodResolver(contaFormSchema),
    defaultValues: valoresIniciais(conta),
  });

  // Recarrega os valores ao trocar a conta selecionada ou reabrir.
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(conta));
  }, [aberto, conta, form]);

  const salvando = form.formState.isSubmitting;

  /**
   * Editando uma conta cujo SALDO o usuário não pode ver.
   *
   * `saldoInicial === null` só acontece por permissão: `fn_saldos_das_contas`
   * não devolve a conta, então a listagem não tem o número. Conta com saldo
   * inicial zero de verdade chega como `0`, não null.
   */
  const semPermissaoDeSaldo = editando && conta.saldoInicial === null;

  async function aoEnviar(valores: ContaFormInput) {
    const saldoInicial =
      valores.saldoInicial.trim() === ""
        ? 0
        : Number(valores.saldoInicial.replace(",", "."));

    const dados = {
      nome: valores.nome,
      banco: valores.banco,
      agencia: valores.agencia,
      conta: valores.conta,
      tipo: valores.tipo,
      saldoInicial,
      // Vazio no formulário significa "sem data de corte": vira null e o saldo
      // volta a somar todo o movimento da conta, como antes.
      saldoInicialData:
        valores.saldoInicialData.trim() === ""
          ? null
          : valores.saldoInicialData.trim(),
      ativo: valores.ativo,
    };

    const resultado = editando
      ? await editarConta(conta.id, dados)
      : await criarConta(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Conta salva" : "Conta criada");
    onAbertoChange(false);
  }

  const bancoValor = form.watch("banco");
  const tipoValor = form.watch("tipo");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar conta bancária" : "Nova conta bancária"}
      descricao={
        editando
          ? "Atualize os dados desta conta"
          : "Cadastre uma conta bancária ou um caixa"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
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
              "Salvar conta"
            ) : (
              "Criar conta"
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
          id="conta-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="conta-nome"
            placeholder="Caixa da obra BR-364"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="conta-banco"
            rotulo="Banco"
            obrigatorio
            erro={form.formState.errors.banco?.message}
          >
            <Combobox
              valor={bancoValor}
              onValorChange={(valor) =>
                form.setValue("banco", valor as ContaFormInput["banco"], {
                  shouldValidate: true,
                })
              }
              opcoes={BANCO_CONTA.map((banco) => ({
                valor: banco,
                rotulo: ROTULO_BANCO[banco],
              }))}
              disabled={salvando}
              id="conta-banco"
            />
          </CampoFormulario>

          <CampoFormulario
            id="conta-tipo"
            rotulo="Tipo"
            obrigatorio
            erro={form.formState.errors.tipo?.message}
          >
            <Combobox
              valor={tipoValor}
              onValorChange={(valor) =>
                form.setValue("tipo", valor as ContaFormInput["tipo"], {
                  shouldValidate: true,
                })
              }
              opcoes={TIPO_CONTA.map((tipo) => ({
                valor: tipo,
                rotulo: ROTULO_TIPO_CONTA[tipo],
              }))}
              disabled={salvando}
              id="conta-tipo"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="conta-agencia"
            rotulo="Agência"
            erro={form.formState.errors.agencia?.message}
          >
            <Input
              id="conta-agencia"
              placeholder="0001"
              className="codigo-doc"
              disabled={salvando}
              {...form.register("agencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="conta-numero"
            rotulo="Conta"
            erro={form.formState.errors.conta?.message}
          >
            <Input
              id="conta-numero"
              placeholder="12345-6"
              className="codigo-doc"
              disabled={salvando}
              {...form.register("conta")}
            />
          </CampoFormulario>
        </LinhaCampos>

        {/*
          Os dois campos de saldo SOMEM para quem não pode ver o saldo desta
          conta. Mostrá-los vazios seria a pior das opções: quem salvasse
          qualquer outro campo (o nome, a agência) gravaria 0,00 em cima do saldo
          real, sem perceber. A action também não escreve essas colunas nesse
          caso — a tela esconder é a terceira camada, não a única.

          `semPermissaoDeSaldo` é só na EDIÇÃO: na criação não há saldo para
          destruir, e alguém precisa poder informar o saldo de abertura.
        */}
        {semPermissaoDeSaldo ? (
          <p className="rounded-md border border-border bg-surface p-2.5 text-legenda text-muted-foreground">
            O saldo inicial desta conta não aparece porque você não tem permissão
            de ver o saldo dela. Salvar aqui não altera o saldo. Quem libera é a
            Administração, na aba Usuários.
          </p>
        ) : (
          <LinhaCampos colunas={2}>
            <CampoFormulario
              id="conta-saldo-inicial"
              rotulo="Saldo inicial"
              ajuda="O saldo que o extrato mostrava na data ao lado, somando a conta corrente com o que estava aplicado."
              erro={form.formState.errors.saldoInicial?.message}
            >
              <InputDecimal
                id="conta-saldo-inicial"
                placeholder="0,00"
                className="tabular-nums text-right"
                disabled={salvando}
                {...form.register("saldoInicial")}
              />
            </CampoFormulario>

            <CampoFormulario
              id="conta-saldo-inicial-data"
              rotulo="Saldo em"
              ajuda="Data do extrato. O saldo atual conta só o que veio DEPOIS dela. Em branco, conta tudo desde o primeiro lançamento."
              erro={form.formState.errors.saldoInicialData?.message}
            >
              <Input
                id="conta-saldo-inicial-data"
                type="date"
                disabled={salvando}
                {...form.register("saldoInicialData")}
              />
            </CampoFormulario>
          </LinhaCampos>
        )}

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
        />
      </form>
    </FormDrawer>
  );
}
