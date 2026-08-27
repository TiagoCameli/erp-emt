"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  LinhaCampos,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarCartao, editarCartao } from "@/modules/cadastros/cartoes/actions";
import type { CartaoLista } from "@/modules/cadastros/cartoes/queries";
import {
  cartaoSchema,
  type CartaoFormInput,
} from "@/modules/cadastros/cartoes/schemas";

const ID_FORM = "form-cartao-credito";

const PADRAO: CartaoFormInput = {
  nome: "",
  ultimosDigitos: "",
  bandeira: "",
  banco: "",
  diaFechamento: "",
  diaVencimento: "",
  ativo: true,
};

/** Dia guardado como número vira o texto do campo; nulo vira vazio. */
function diaParaCampo(dia: number | null): string {
  return dia === null ? "" : String(dia);
}

function valoresIniciais(
  cartao: CartaoLista | null | undefined,
): CartaoFormInput {
  if (!cartao) return PADRAO;
  return {
    nome: cartao.nome,
    ultimosDigitos: cartao.ultimosDigitos,
    bandeira: cartao.bandeira ?? "",
    banco: cartao.banco ?? "",
    diaFechamento: diaParaCampo(cartao.diaFechamento),
    diaVencimento: diaParaCampo(cartao.diaVencimento),
    ativo: cartao.ativo,
  };
}

export interface CartaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Cartão em edição. Ausente abre o drawer em modo de criação. */
  cartao?: CartaoLista | null;
}

/**
 * Drawer de criação e edição de cartão de crédito.
 *
 * Dois campos importam: o apelido, que é por onde a pessoa escolhe na compra, e
 * os quatro últimos dígitos, que é por onde a compra casa com a fatura. O resto
 * (bandeira, banco, fechamento e vencimento) é conferência posterior e nasce
 * vazio de propósito — obrigar tudo isso na criação faria o cadastro rápido da
 * OC ser impossível.
 */
export function CartaoFormDrawer({
  aberto,
  onAbertoChange,
  cartao,
}: CartaoFormDrawerProps) {
  const editando = Boolean(cartao);

  const form = useForm<CartaoFormInput>({
    resolver: zodResolver(cartaoSchema),
    defaultValues: valoresIniciais(cartao),
  });

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(entrada: CartaoFormInput) {
    // Aplica o default (ativo) e a normalização dos dígitos antes da action.
    const dados = cartaoSchema.parse(entrada);
    const resultado = cartao
      ? await editarCartao(cartao.id, dados)
      : await criarCartao(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Cartão salvo" : "Cartão criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar cartão de crédito" : "Novo cartão de crédito"}
      descricao={
        editando
          ? "Os documentos apontam para este cartão: corrigir o final aqui corrige tudo que já saiu por ele"
          : "Cadastre o cartão para dizer, em cada compra no crédito, por qual deles ela saiu"
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
              "Salvar cartão"
            ) : (
              "Criar cartão"
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
        <LinhaCampos>
          <CampoFormulario
            id="cartao-nome"
            rotulo="Nome"
            obrigatorio
            ajuda="Como este cartão é chamado no dia a dia. É o que aparece na hora de escolher na compra."
            erro={form.formState.errors.nome?.message}
          >
            <Input
              id="cartao-nome"
              autoComplete="off"
              placeholder="Cartão obra, Cartão Tiago"
              disabled={salvando}
              {...form.register("nome")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="cartao-digitos"
            rotulo="Quatro últimos dígitos"
            obrigatorio
            largura="curto"
            ajuda="Os quatro do fim do cartão, que é o que a fatura mostra."
            erro={form.formState.errors.ultimosDigitos?.message}
          >
            <Input
              id="cartao-digitos"
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              placeholder="4829"
              disabled={salvando}
              {...form.register("ultimosDigitos")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="cartao-bandeira"
            rotulo="Bandeira"
            erro={form.formState.errors.bandeira?.message}
          >
            <Input
              id="cartao-bandeira"
              autoComplete="off"
              placeholder="Visa, Mastercard, Elo"
              disabled={salvando}
              {...form.register("bandeira")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="cartao-banco"
            rotulo="Banco emissor"
            erro={form.formState.errors.banco?.message}
          >
            <Input
              id="cartao-banco"
              autoComplete="off"
              placeholder="Banco do Brasil, Caixa, Itaú"
              disabled={salvando}
              {...form.register("banco")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="cartao-fechamento"
            rotulo="Dia do fechamento"
            largura="curto"
            ajuda="Dia do mês em que a fatura fecha. Em branco quando não se sabe."
            erro={form.formState.errors.diaFechamento?.message}
          >
            <Input
              id="cartao-fechamento"
              autoComplete="off"
              inputMode="numeric"
              maxLength={2}
              placeholder="25"
              disabled={salvando}
              {...form.register("diaFechamento")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="cartao-vencimento"
            rotulo="Dia do vencimento"
            largura="curto"
            ajuda="Dia do mês em que a fatura vence."
            erro={form.formState.errors.diaVencimento?.message}
          >
            <Input
              id="cartao-vencimento"
              autoComplete="off"
              inputMode="numeric"
              maxLength={2}
              placeholder="05"
              disabled={salvando}
              {...form.register("diaVencimento")}
            />
          </CampoFormulario>
        </LinhaCampos>

        {editando && cartao && cartao.usoEmDocumentos > 0 ? (
          <p className="rounded-md border border-dashed border-border bg-surface/50 px-3 py-3 text-legenda text-muted-foreground">
            {cartao.usoEmDocumentos === 1
              ? "1 documento aponta para este cartão."
              : `${cartao.usoEmDocumentos} documentos apontam para este cartão.`}{" "}
            Eles guardam o id, não os dígitos: corrigir o final aqui corrige a
            exibição em todos eles.
          </p>
        ) : null}

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativo"
          ajuda="Cartão inativo some das opções de novas compras, mas continua no histórico e na tela dos documentos antigos."
        />
      </form>
    </FormDrawer>
  );
}
