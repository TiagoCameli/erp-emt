import { describe, expect, it } from "vitest";

import { perfilSchema } from "@/modules/conta/schemas";

/**
 * O que estes testes protegem é a NORMALIZAÇÃO: o banco guarda dígitos, e a tela
 * mostra máscara. Se a máscara vazar para a coluna, o mesmo celular passa a
 * existir em dois formatos e nenhuma busca acha os dois.
 *
 * A regra é repetida em `fn_salvar_meu_perfil` (última barreira, com a MESMA
 * mensagem). Aqui é onde ela tem teste.
 */

/** Payload com tudo vazio: o estado em que a tela abre para quem nunca salvou. */
const VAZIO = {
  celular: "",
  dataNascimento: "",
  cargo: "",
  ramal: "",
  cpf: "",
  rg: "",
  enderecoCep: "",
  enderecoLogradouro: "",
  enderecoNumero: "",
  enderecoComplemento: "",
  enderecoBairro: "",
  enderecoCidade: "",
  enderecoUf: "",
};

/** Faz o parse e devolve os dados, falhando o teste com a mensagem do Zod. */
function parse(campos: Partial<typeof VAZIO>) {
  const resultado = perfilSchema.safeParse({ ...VAZIO, ...campos });
  if (!resultado.success) {
    throw new Error(resultado.error.issues[0]?.message ?? "erro sem mensagem");
  }
  return resultado.data;
}

/** Primeira mensagem de erro, ou null quando passou. */
function erro(campos: Partial<typeof VAZIO>): string | null {
  const resultado = perfilSchema.safeParse({ ...VAZIO, ...campos });
  return resultado.success
    ? null
    : (resultado.error.issues[0]?.message ?? "erro sem mensagem");
}

describe("perfil: formulário em branco", () => {
  it("tudo vazio é válido e vira null, não string vazia", () => {
    // Perfil incompleto é o normal: a pessoa preenche aos poucos. E null é
    // diferente de "": a coluna precisa saber que o dado não existe.
    const dados = parse({});
    expect(dados.celular).toBeNull();
    expect(dados.dataNascimento).toBeNull();
    expect(dados.cargo).toBeNull();
    expect(dados.cpf).toBeNull();
    expect(dados.enderecoUf).toBeNull();
  });

  it("campo com só espaço e quebra de linha também vira null", () => {
    // String de brancos é truthy no front e desenharia um campo "preenchido"
    // com nada dentro.
    expect(parse({ cargo: "   \n\t  " }).cargo).toBeNull();
    expect(parse({ enderecoCidade: "\n" }).enderecoCidade).toBeNull();
  });
});

describe("perfil: celular", () => {
  it("guarda só os dígitos, sem a máscara", () => {
    expect(parse({ celular: "(68) 99999-1234" }).celular).toBe("68999991234");
  });

  it("aceita fixo de 10 dígitos", () => {
    expect(parse({ celular: "(68) 3223-4567" }).celular).toBe("6832234567");
  });

  it("recusa número sem DDD, com a mensagem que a RPC também usa", () => {
    expect(erro({ celular: "99999-1234" })).toBe(
      "O celular precisa ter DDD e 10 ou 11 dígitos",
    );
  });

  it("recusa dígito sobrando", () => {
    expect(erro({ celular: "689999912345" })).toBe(
      "O celular precisa ter DDD e 10 ou 11 dígitos",
    );
  });
});

describe("perfil: CPF", () => {
  it("guarda só os dígitos", () => {
    expect(parse({ cpf: "111.444.777-35" }).cpf).toBe("11144477735");
  });

  it("recusa 14 dígitos: campo de pessoa não aceita CNPJ", () => {
    expect(erro({ cpf: "00.000.000/0001-00" })).toBe(
      "O CPF precisa ter 11 dígitos",
    );
  });

  it("recusa dígito faltando", () => {
    expect(erro({ cpf: "1114447773" })).toBe("O CPF precisa ter 11 dígitos");
  });
});

describe("perfil: data de nascimento", () => {
  it("aceita uma data no passado", () => {
    expect(parse({ dataNascimento: "1990-05-17" }).dataNascimento).toBe(
      "1990-05-17",
    );
  });

  it("recusa o futuro", () => {
    expect(erro({ dataNascimento: "2999-01-01" })).toBe(
      "A data de nascimento não pode ser no futuro",
    );
  });

  it("recusa ano de dedo escorregado", () => {
    // "0199" e "1890" passam pela máscara do input e pelo formato; o piso é o
    // mesmo da constraint do banco.
    expect(erro({ dataNascimento: "1890-05-17" })).toBe(
      "Confira o ano da data de nascimento",
    );
  });

  it("recusa formato fora de aaaa-mm-dd", () => {
    expect(erro({ dataNascimento: "17/05/1990" })).toBe(
      "Data de nascimento inválida",
    );
  });
});

describe("perfil: CEP e UF", () => {
  it("CEP guarda só os dígitos", () => {
    expect(parse({ enderecoCep: "69.900-000" }).enderecoCep).toBe("69900000");
  });

  it("recusa CEP de 7 dígitos", () => {
    expect(erro({ enderecoCep: "6990000" })).toBe(
      "O CEP precisa ter 8 dígitos",
    );
  });

  it("UF em minúscula sobe para maiúscula", () => {
    // Quem digita "ac" está informando o Acre. Recusar pela caixa é implicância.
    expect(parse({ enderecoUf: "ac" }).enderecoUf).toBe("AC");
    expect(parse({ enderecoUf: " sp " }).enderecoUf).toBe("SP");
  });

  it("recusa sigla que não é UF", () => {
    expect(erro({ enderecoUf: "XX" })).toBe("UF inválida");
  });
});

describe("perfil: tetos de texto", () => {
  it("recusa cargo além de 60 caracteres, dizendo o limite", () => {
    // O mesmo teto do CHECK do banco. Sem esta mensagem, a recusa chegaria como
    // "violates check constraint usuarios_cargo_check".
    expect(erro({ cargo: "x".repeat(61) })).toBe(
      "O cargo aceita no máximo 60 caracteres",
    );
  });

  it("aceita exatamente o teto", () => {
    expect(parse({ cargo: "x".repeat(60) }).cargo).toHaveLength(60);
  });

  it("apara antes de medir: espaço nas pontas não estoura o teto", () => {
    expect(parse({ cargo: `  ${"x".repeat(60)}  ` }).cargo).toHaveLength(60);
  });

  it("recusa logradouro além de 120", () => {
    expect(erro({ enderecoLogradouro: "x".repeat(121) })).toBe(
      "O logradouro aceita no máximo 120 caracteres",
    );
  });
});
