"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  LinhaCampos,
  SecaoFormulario,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatarCep,
  formatarCnpjCpf,
  formatarTelefone,
} from "@/lib/documentos";
import { salvarMeuPerfil } from "@/modules/conta/actions";
import type { MeuPerfil } from "@/modules/conta/queries";
import {
  MAX_BAIRRO,
  MAX_CARGO,
  MAX_CIDADE,
  MAX_COMPLEMENTO,
  MAX_LOGRADOURO,
  MAX_NUMERO,
  MAX_RAMAL,
  MAX_RG,
  UFS,
} from "@/modules/conta/schemas";

/**
 * Schema SÓ DO FORMULÁRIO: todo campo é string simples, sem transform.
 *
 * Input e output coincidem de propósito, e é o que faz o resolver do
 * react-hook-form tipar limpo. O schema de domínio (`perfilSchema`), que apara,
 * tira máscara e transforma vazio em null, roda no SERVIDOR: usá-lo aqui faria o
 * tipo de entrada (string) divergir do de saída (string | null) e o RHF passaria
 * a lutar com o próprio estado. Mesmo padrão do drawer de colaboradores.
 *
 * A validação de formato também é do servidor. Aqui só ficam os tetos de
 * caractere, que o `maxLength` do input já impede de estourar — a mensagem
 * existe para quem cola um texto comprido.
 */
const formSchema = z.object({
  celular: z.string(),
  dataNascimento: z.string(),
  cargo: z.string().max(MAX_CARGO),
  ramal: z.string().max(MAX_RAMAL),
  cpf: z.string(),
  rg: z.string().max(MAX_RG),
  enderecoCep: z.string(),
  enderecoLogradouro: z.string().max(MAX_LOGRADOURO),
  enderecoNumero: z.string().max(MAX_NUMERO),
  enderecoComplemento: z.string().max(MAX_COMPLEMENTO),
  enderecoBairro: z.string().max(MAX_BAIRRO),
  enderecoCidade: z.string().max(MAX_CIDADE),
  enderecoUf: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Valores de partida, JÁ MASCARADOS.
 *
 * O banco guarda dígitos; a tela mostra "(68) 99999-1234". Sem mascarar aqui, o
 * campo abriria com 68999991234 cru e a pessoa concluiria que salvou errado.
 */
function valoresIniciais(perfil: MeuPerfil): FormValues {
  return {
    celular: formatarTelefone(perfil.celular ?? ""),
    dataNascimento: perfil.dataNascimento ?? "",
    cargo: perfil.cargo ?? "",
    ramal: perfil.ramal ?? "",
    cpf: formatarCnpjCpf(perfil.cpf ?? ""),
    rg: perfil.rg ?? "",
    enderecoCep: formatarCep(perfil.enderecoCep ?? ""),
    enderecoLogradouro: perfil.enderecoLogradouro ?? "",
    enderecoNumero: perfil.enderecoNumero ?? "",
    enderecoComplemento: perfil.enderecoComplemento ?? "",
    enderecoBairro: perfil.enderecoBairro ?? "",
    enderecoCidade: perfil.enderecoCidade ?? "",
    enderecoUf: perfil.enderecoUf ?? "",
  };
}

const OPCOES_UF = UFS.map((uf) => ({ valor: uf, rotulo: uf }));

export interface PerfilFormProps {
  perfil: MeuPerfil;
}

/**
 * Formulário dos dados do próprio usuário.
 *
 * A máscara é aplicada NO BLUR, não a cada tecla. Mascarar enquanto se digita
 * obriga a recolocar o cursor a cada caractere, e errar isso faz o número sair
 * embaralhado quando a pessoa corrige um dígito no meio — o que é pior que ver o
 * campo se arrumar ao sair dele. O servidor tira a máscara de qualquer forma,
 * então ela é só leitura.
 */
export function PerfilForm({ perfil }: PerfilFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: valoresIniciais(perfil),
  });

  const salvando = form.formState.isSubmitting;
  const mudou = form.formState.isDirty;

  /**
   * Ressincroniza quando o servidor devolve dados novos.
   *
   * Depois do `revalidatePath` a página volta com o perfil já gravado, e é isso
   * que zera o `isDirty` — sem o reset, o botão continuaria aceso dizendo que há
   * alteração pendente logo depois de salvar. Comparação pelo CONTEÚDO, porque o
   * objeto vem novo a cada render e comparar referência ressincronizaria sempre,
   * apagando o que a pessoa está digitando.
   */
  const chaveDoServidor = JSON.stringify(valoresIniciais(perfil));
  const [chaveAnterior, setChaveAnterior] = React.useState(chaveDoServidor);
  if (chaveAnterior !== chaveDoServidor) {
    setChaveAnterior(chaveDoServidor);
    form.reset(valoresIniciais(perfil));
  }

  /** Aplica a máscara ao sair do campo, se a contagem de dígitos bater. */
  function mascararNoBlur(
    campo: "celular" | "cpf" | "enderecoCep",
    mascara: (valor: string) => string,
  ) {
    const atual = form.getValues(campo);
    const mascarado = mascara(atual);
    if (mascarado !== atual) {
      form.setValue(campo, mascarado, { shouldDirty: true });
    }
  }

  async function aoSalvar(valores: FormValues) {
    const resultado = await salvarMeuPerfil(valores);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Dados salvos");
  }

  const erros = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(aoSalvar)}
      className={classesFormulario}
      noValidate
    >
      <SecaoFormulario titulo="Dados pessoais">
        <LinhaCampos>
          <CampoFormulario
            id="perfil-nascimento"
            rotulo="Data de nascimento"
            erro={erros.dataNascimento?.message}
            largura="curto"
          >
            <Input
              id="perfil-nascimento"
              type="date"
              disabled={salvando}
              {...form.register("dataNascimento")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-cpf"
            rotulo="CPF"
            erro={erros.cpf?.message}
            largura="medio"
          >
            <Input
              id="perfil-cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              disabled={salvando}
              {...form.register("cpf", {
                onBlur: () => mascararNoBlur("cpf", formatarCnpjCpf),
              })}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-rg"
            rotulo="RG"
            ajuda="Como está no documento, com órgão e UF se quiser"
            erro={erros.rg?.message}
            largura="medio"
          >
            <Input
              id="perfil-rg"
              maxLength={MAX_RG}
              autoComplete="off"
              disabled={salvando}
              {...form.register("rg")}
            />
          </CampoFormulario>
        </LinhaCampos>
      </SecaoFormulario>

      <SecaoFormulario titulo="Contato e função">
        <LinhaCampos>
          <CampoFormulario
            id="perfil-celular"
            rotulo="Celular"
            ajuda="Com DDD"
            erro={erros.celular?.message}
            largura="medio"
          >
            <Input
              id="perfil-celular"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(68) 99999-0000"
              disabled={salvando}
              {...form.register("celular", {
                onBlur: () => mascararNoBlur("celular", formatarTelefone),
              })}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-ramal"
            rotulo="Ramal"
            erro={erros.ramal?.message}
            largura="curto"
          >
            <Input
              id="perfil-ramal"
              maxLength={MAX_RAMAL}
              autoComplete="off"
              disabled={salvando}
              {...form.register("ramal")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-cargo"
            rotulo="Cargo"
            // O perfil de acesso (Admin, Compras, Financeiro, RH) diz o que a
            // pessoa PODE fazer no sistema; não diz o que ela faz na empresa.
            ajuda="O que você faz na empresa, não o seu perfil de acesso"
            erro={erros.cargo?.message}
            largura="medio"
          >
            <Input
              id="perfil-cargo"
              maxLength={MAX_CARGO}
              autoComplete="off"
              placeholder="Engenheiro de obras"
              disabled={salvando}
              {...form.register("cargo")}
            />
          </CampoFormulario>
        </LinhaCampos>
      </SecaoFormulario>

      <SecaoFormulario titulo="Endereço">
        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="perfil-cep"
            rotulo="CEP"
            erro={erros.enderecoCep?.message}
            largura="curto"
          >
            <Input
              id="perfil-cep"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="69900-000"
              disabled={salvando}
              {...form.register("enderecoCep", {
                onBlur: () => mascararNoBlur("enderecoCep", formatarCep),
              })}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-cidade"
            rotulo="Cidade"
            erro={erros.enderecoCidade?.message}
            largura="medio"
          >
            <Input
              id="perfil-cidade"
              maxLength={MAX_CIDADE}
              autoComplete="address-level2"
              disabled={salvando}
              {...form.register("enderecoCidade")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-uf"
            rotulo="UF"
            erro={erros.enderecoUf?.message}
            largura="curto"
          >
            {/* Combobox canônico (com busca), nunca o Select do shadcn: com 27
                siglas, digitar "ac" é mais rápido que rolar a lista. */}
            <Combobox
              id="perfil-uf"
              valor={form.watch("enderecoUf")}
              onValorChange={(valor) =>
                form.setValue("enderecoUf", valor, { shouldDirty: true })
              }
              opcoes={OPCOES_UF}
              limpavel
              disabled={salvando}
              placeholder="UF"
              buscaPlaceholder="Buscar UF"
              ariaLabel="UF do endereço"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="perfil-logradouro"
            rotulo="Logradouro"
            erro={erros.enderecoLogradouro?.message}
            largura="cheio"
            className="sm:col-span-2"
          >
            <Input
              id="perfil-logradouro"
              maxLength={MAX_LOGRADOURO}
              autoComplete="address-line1"
              placeholder="Rua, avenida, travessa"
              disabled={salvando}
              {...form.register("enderecoLogradouro")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-numero"
            rotulo="Número"
            erro={erros.enderecoNumero?.message}
            largura="curto"
          >
            <Input
              id="perfil-numero"
              maxLength={MAX_NUMERO}
              autoComplete="off"
              disabled={salvando}
              {...form.register("enderecoNumero")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="perfil-bairro"
            rotulo="Bairro"
            erro={erros.enderecoBairro?.message}
            largura="medio"
          >
            <Input
              id="perfil-bairro"
              maxLength={MAX_BAIRRO}
              autoComplete="address-level3"
              disabled={salvando}
              {...form.register("enderecoBairro")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="perfil-complemento"
            rotulo="Complemento"
            erro={erros.enderecoComplemento?.message}
            largura="medio"
          >
            <Input
              id="perfil-complemento"
              maxLength={MAX_COMPLEMENTO}
              autoComplete="address-line2"
              placeholder="Apto, bloco, sala"
              disabled={salvando}
              {...form.register("enderecoComplemento")}
            />
          </CampoFormulario>
        </LinhaCampos>
      </SecaoFormulario>

      <div className="flex items-center gap-3">
        {/*
          Enquanto nada mudou o botão fica cinza, e não primário esmaecido:
          primária com opacidade vira um tom que não existe no design system e o
          botão parece quebrado em vez de desabilitado. Mesma regra do formulário
          de Configurações.
        */}
        <Button
          type="submit"
          size="sm"
          variant={mudou ? "default" : "secondary"}
          disabled={!mudou || salvando}
        >
          {salvando ? <LoaderCircle className="animate-spin" /> : null}
          {salvando ? "Salvando" : "Salvar dados"}
        </Button>
        {mudou && !salvando ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => form.reset(valoresIniciais(perfil))}
          >
            Descartar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
