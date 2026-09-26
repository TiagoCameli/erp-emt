import { enderecoCelula, type CelulaLida } from "./leitor";

/**
 * Monta a planilha contratual a partir das linhas lidas do xlsx (spec 5.2 e 8):
 * - linha com preço OU quantidade é serviço; sem os dois é título;
 * - o pai é a linha anterior de código mais longo que é prefixo do código (com ponto);
 *   código repetido torna o pai ambíguo: sugere o mais próximo e pede confirmação;
 * - campo vazio de serviço vira "0" com alerta, nunca some;
 * - texto em coluna de número, fórmula sem valor, erro de fórmula e número com expoente BLOQUEIAM;
 * - linha com código e sem descrição BLOQUEIA, e preço ou quantidade negativos BLOQUEIAM
 *   (o banco recusaria na gravação; aqui o aviso sai na prévia, com a célula);
 * - código digitado como NÚMERO na planilha BLOQUEIA: o Excel come zero à esquerda ("01" vira 1)
 *   e à direita ("1.10" vira 1.1), o que quebra tanto a hierarquia quanto a conciliação por
 *   código; a linha é montada normalmente (para não perder o resto do diagnóstico), mas o
 *   alerta impede a gravação;
 * - problema na coluna de VALOR nunca bloqueia: ela só alimenta o diagnóstico (Task 9,
 *   diagnostico.ts), nunca vai para o banco como número oficial;
 * - código terminado em ponto entra como está (não é cortado), só com alerta.
 * Nada aqui calcula dinheiro.
 */

export interface LinhaBruta {
  linhaOrigem: number;
  oculta: boolean;
  codigo: CelulaLida;
  descricao: CelulaLida;
  unidade: CelulaLida;
  preco: CelulaLida;
  quantidade: CelulaLida;
  valor: CelulaLida | null;
  colunas: { codigo: number; preco: number; quantidade: number; valor: number | null };
}

export type TipoAlerta =
  | "codigo_duplicado"
  | "sem_preco"
  | "vazio_vira_zero"
  | "unidade_com_espaco"
  | "hierarquia_ambigua"
  | "codigo_sem_pai"
  | "linha_oculta"
  | "formula_sem_valor"
  | "numero_como_texto"
  | "erro_de_formula"
  | "linha_sem_codigo"
  | "codigo_como_numero"
  | "codigo_termina_com_ponto"
  | "linha_sem_descricao"
  | "numero_negativo"
  | "numero_fora_da_faixa";

export interface Alerta {
  tipo: TipoAlerta;
  bloqueia: boolean;
  ordem: number | null;
  linhaOrigem: number;
  mensagem: string;
}

export interface LinhaImportada {
  ordem: number;
  linhaOrigem: number;
  codigo: string;
  paiOrdem: number | null;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  precoUnitario: string | null;
  quantidadePrevista: string | null;
  valorPlanilha: string | null;
}

export interface Ambiguidade {
  ordem: number;
  codigo: string;
  candidatos: number[];
  sugerido: number;
}

export interface Montagem {
  linhas: LinhaImportada[];
  alertas: Alerta[];
  ambiguidades: Ambiguidade[];
  duplicados: { codigo: string; ordens: number[] }[];
}

function texto(c: CelulaLida): string | null {
  if (c.tipo === "texto" || c.tipo === "numero_fora_da_faixa") return c.bruto;
  if (c.tipo === "numero") return c.texto;
  return null;
}

/**
 * Célula de número: devolve o texto do número, null se vazia, ou o alerta que bloqueia.
 * `aceitaNegativo` é só para a coluna de valor (diagnóstico); preço e quantidade não aceitam.
 */
function numero(c: CelulaLida, linha: number, coluna: number, aceitaNegativo = false): { valor: string | null } | { alerta: Omit<Alerta, "ordem"> } {
  const endereco = enderecoCelula(linha, coluna);
  switch (c.tipo) {
    case "vazia":
      return { valor: null };
    case "numero":
      if (!aceitaNegativo && c.texto.startsWith("-")) {
        return { alerta: { tipo: "numero_negativo", bloqueia: true, linhaOrigem: linha,
          mensagem: `A célula ${endereco} tem número negativo (${c.texto}). A planilha contratual não aceita valor negativo` } };
      }
      return { valor: c.texto };
    case "formula_sem_valor":
      return { alerta: { tipo: "formula_sem_valor", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} é fórmula sem valor calculado. Abra o arquivo no Excel, salve e envie de novo` } };
    case "erro":
      return { alerta: { tipo: "erro_de_formula", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} tem erro de fórmula (${c.bruto})` } };
    case "numero_fora_da_faixa":
      return { alerta: { tipo: "numero_fora_da_faixa", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} tem um número que só se escreve com expoente (${c.bruto}). Confira o valor e arredonde no Excel` } };
    case "texto":
      return { alerta: { tipo: "numero_como_texto", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} tem o texto "${c.bruto}" onde devia haver número. Use o xlsx oficial, com a célula em formato de número` } };
  }
}

export function montarPlanilha(brutas: LinhaBruta[], paiEscolhido: Record<number, number> = {}): Montagem {
  const linhas: LinhaImportada[] = [];
  const alertas: Alerta[] = [];
  const ambiguidades: Ambiguidade[] = [];

  for (const b of brutas) {
    const codigo = texto(b.codigo)?.trim() ?? "";
    const descricao = texto(b.descricao)?.trim() ?? "";
    if (codigo === "" && descricao === "") continue;
    if (codigo === "") {
      alertas.push({ tipo: "linha_sem_codigo", bloqueia: true, ordem: null, linhaOrigem: b.linhaOrigem,
        mensagem: `A linha ${b.linhaOrigem} tem descrição mas não tem código` });
      continue;
    }
    const ordem = linhas.length + 1;

    if (descricao === "") {
      alertas.push({ tipo: "linha_sem_descricao", bloqueia: true, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A linha ${b.linhaOrigem} (código ${codigo}) não tem descrição` });
    }

    if (b.codigo.tipo === "numero" || b.codigo.tipo === "numero_fora_da_faixa") {
      const endereco = enderecoCelula(b.linhaOrigem, b.colunas.codigo);
      alertas.push({ tipo: "codigo_como_numero", bloqueia: true, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A célula ${endereco} tem o código como número (${codigo}). Formate a coluna de código como texto no Excel e envie de novo` });
    }

    const preco = numero(b.preco, b.linhaOrigem, b.colunas.preco);
    const qtd = numero(b.quantidade, b.linhaOrigem, b.colunas.quantidade);
    const valorBruto = b.valor && b.colunas.valor ? numero(b.valor, b.linhaOrigem, b.colunas.valor, true) : { valor: null };
    // Problema na coluna de valor nunca bloqueia: ela só alimenta o diagnóstico.
    const valor = "alerta" in valorBruto ? { alerta: { ...valorBruto.alerta, bloqueia: false } } : valorBruto;
    for (const r of [preco, qtd, valor]) if ("alerta" in r) alertas.push({ ...r.alerta, ordem });
    const precoTexto = "valor" in preco ? preco.valor : null;
    const qtdTexto = "valor" in qtd ? qtd.valor : null;
    const tipo: LinhaImportada["tipo"] = precoTexto !== null || qtdTexto !== null || "alerta" in preco || "alerta" in qtd ? "servico" : "titulo";

    if (tipo === "servico" && "valor" in preco && precoTexto === null) {
      alertas.push({ tipo: "sem_preco", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O serviço ${codigo} (linha ${b.linhaOrigem}) não tem preço: entra com preço zero` });
    }
    if (tipo === "servico" && "valor" in qtd && qtdTexto === null) {
      alertas.push({ tipo: "vazio_vira_zero", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O serviço ${codigo} (linha ${b.linhaOrigem}) não tem quantidade: entra com quantidade zero` });
    }

    const unidadeBruta = texto(b.unidade);
    const unidade = unidadeBruta?.trim() || null;
    if (unidadeBruta !== null && unidade !== null && unidadeBruta !== unidade) {
      alertas.push({ tipo: "unidade_com_espaco", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A unidade "${unidadeBruta}" da linha ${b.linhaOrigem} tem espaço sobrando: entra como "${unidade}"` });
    }
    if (b.oculta) {
      alertas.push({ tipo: "linha_oculta", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A linha ${b.linhaOrigem} (${codigo}) está oculta na planilha e foi importada. Confira se ela é do contrato` });
    }
    if (codigo.endsWith(".")) {
      alertas.push({ tipo: "codigo_termina_com_ponto", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O código ${codigo} (linha ${b.linhaOrigem}) termina com ponto. Confira na planilha` });
    }

    // Pai: a linha anterior com o maior código que é prefixo deste, seguido de ponto.
    let paiOrdem: number | null = null;
    const partes = codigo.split(".");
    for (let tamanho = partes.length - 1; tamanho > 0 && paiOrdem === null; tamanho--) {
      const prefixo = partes.slice(0, tamanho).join(".");
      const candidatos = linhas.filter((l) => l.codigo === prefixo).map((l) => l.ordem);
      if (candidatos.length === 0) continue;
      const sugerido = candidatos[candidatos.length - 1];
      if (candidatos.length > 1) {
        const escolhido = paiEscolhido[ordem];
        if (escolhido !== undefined && candidatos.includes(escolhido)) {
          paiOrdem = escolhido;
        } else {
          paiOrdem = sugerido;
          ambiguidades.push({ ordem, codigo, candidatos, sugerido });
          alertas.push({ tipo: "hierarquia_ambigua", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
            mensagem: `O código ${prefixo} aparece ${candidatos.length} vezes: confirme de qual linha o ${codigo} é filho` });
        }
      } else {
        paiOrdem = sugerido;
      }
    }
    if (paiOrdem === null && partes.length > 1) {
      alertas.push({ tipo: "codigo_sem_pai", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O código ${codigo} não tem linha de grupo acima dele na planilha: entra na raiz` });
    }

    linhas.push({
      ordem,
      linhaOrigem: b.linhaOrigem,
      codigo,
      paiOrdem,
      descricao,
      unidade,
      tipo,
      precoUnitario: tipo === "servico" ? (precoTexto ?? "0") : null,
      quantidadePrevista: tipo === "servico" ? (qtdTexto ?? "0") : null,
      valorPlanilha: "valor" in valor ? valor.valor : null,
    });
  }

  const porCodigo = new Map<string, number[]>();
  for (const l of linhas) porCodigo.set(l.codigo, [...(porCodigo.get(l.codigo) ?? []), l.ordem]);
  const duplicados = [...porCodigo.entries()].filter(([, ordens]) => ordens.length > 1).map(([codigo, ordens]) => ({ codigo, ordens }));
  for (const d of duplicados) {
    alertas.push({ tipo: "codigo_duplicado", bloqueia: false, ordem: d.ordens[0], linhaOrigem: linhas[d.ordens[0] - 1].linhaOrigem,
      mensagem: `O código ${d.codigo} aparece ${d.ordens.length} vezes (linhas ${d.ordens.map((o) => linhas[o - 1].linhaOrigem).join(", ")}). Entra como está: confirme que são serviços distintos` });
  }

  return { linhas, alertas, ambiguidades, duplicados };
}
