"use client";

import { formatarCep, formatarCnpjCpf, formatarTelefone } from "@/lib/documentos";
import { formatarData } from "@/lib/formatadores";
import type { ContatoUsuario } from "@/modules/administracao/usuarios/queries";

/**
 * Uma linha do endereço, montada com o que existir.
 *
 * "Rua X, 123 - Sala 2, Centro, Rio Branco/AC, CEP 69900-000". Cada pedaço só
 * entra se estiver preenchido: com placeholder, um endereço com só a cidade
 * sairia como "null, null, Rio Branco".
 */
function linhaDoEndereco(contato: ContatoUsuario): string | null {
  const rua = [contato.enderecoLogradouro, contato.enderecoNumero]
    .filter(Boolean)
    .join(", ");
  const comComplemento = [rua, contato.enderecoComplemento]
    .filter(Boolean)
    .join(" - ");
  const cidadeUf = [contato.enderecoCidade, contato.enderecoUf]
    .filter(Boolean)
    .join("/");
  const cep = contato.enderecoCep
    ? `CEP ${formatarCep(contato.enderecoCep)}`
    : null;

  const partes = [comComplemento, contato.enderecoBairro, cidadeUf, cep].filter(
    (parte) => parte !== null && parte !== "",
  );
  return partes.length === 0 ? null : partes.join(", ");
}

/** Rótulo + valor, só quando há valor. */
function Item({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{valor}</span>
    </div>
  );
}

export interface ContatoUsuarioBlocoProps {
  contato: ContatoUsuario;
  /** Primeiro nome, para a frase de "ainda não preencheu". */
  nome: string;
}

/**
 * Os dados que o PRÓPRIO usuário preencheu em "Minha conta", em leitura.
 *
 * Aparece aqui para o Admin achar o celular de alguém sem ter que perguntar no
 * grupo — que era o motivo original de a tela existir.
 *
 * SEM EDIÇÃO, e isso é a decisão: quem responde pelo dado é o dono dele. Não é
 * só respeito ao dono: `fn_salvar_meu_perfil` só escreve na linha de
 * `auth.uid()`, então uma edição pelo Admin exigiria um segundo caminho de
 * gravação, com as mesmas colunas e outra regra de permissão — duas cópias da
 * mesma regra, que divergem na primeira alteração feita de um lado só.
 *
 * Mostra só o que está preenchido. Perfil pela metade é o normal (a pessoa
 * preenche aos poucos), e uma lista de treze linhas com onze travessões não
 * informa nada.
 */
export function ContatoUsuarioBloco({
  contato,
  nome,
}: ContatoUsuarioBlocoProps) {
  const endereco = linhaDoEndereco(contato);
  const temAlgo =
    endereco !== null ||
    [
      contato.celular,
      contato.dataNascimento,
      contato.cargo,
      contato.ramal,
      contato.cpf,
      contato.rg,
    ].some(Boolean);

  if (!temAlgo) {
    const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
    return (
      <p className="text-detalhe text-muted-foreground">
        {primeiroNome} ainda não preencheu os dados em Minha conta. Só a própria
        pessoa pode preencher.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Item rotulo="Cargo" valor={contato.cargo} />
        <Item
          rotulo="Celular"
          valor={contato.celular ? formatarTelefone(contato.celular) : null}
        />
        <Item rotulo="Ramal" valor={contato.ramal} />
        <Item
          rotulo="Nascimento"
          valor={
            contato.dataNascimento ? formatarData(contato.dataNascimento) : null
          }
        />
        <Item
          rotulo="CPF"
          valor={contato.cpf ? formatarCnpjCpf(contato.cpf) : null}
        />
        <Item rotulo="RG" valor={contato.rg} />
      </div>
      <Item rotulo="Endereço" valor={endereco} />
    </div>
  );
}
