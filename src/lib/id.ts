import { z } from "zod";

/**
 * Schema canônico de id de registro. Todo `*_id` que vai para o banco valida
 * por aqui, e não pelo `uuid()` do Zod.
 *
 * É `z.guid()` de propósito, e endurecer de volta para o `uuid()` do Zod
 * quebra o sistema: o `uuid()` do Zod 4 exige os bits de versão e variante do
 * RFC 9562, e a coluna `uuid` do Postgres não exige nada disso. A importação
 * da BR-364 (`fn_importar_br364_lote09`) derivou id determinístico com
 * `md5(...)::uuid` para poder rodar duas vezes sem duplicar, e md5 devolve 32
 * hex crus: o dígito de versão sai qualquer coisa de 0 a f e a variante
 * também. Exemplo real em produção: `c4e0f922-3aec-8c72-7089-225523e04557`
 * (variante 7, quando o RFC só aceita 8, 9, a ou b). São milhares de
 * lançamentos, parcelas, rateios, fornecedores e categorias assim, todos id
 * legítimo para o banco. Com a validação estrita a própria tela recusava o id
 * que ela mesma tinha acabado de ler do banco, e escolher a conta bancária,
 * aprovar ou excluir esses registros dava "inválido".
 *
 * O papel da validação aqui é barrar lixo antes de chegar no banco (string
 * vazia, texto solto, tentativa de injeção, id de tamanho errado). Quem
 * garante que o id existe e que o usuário pode tocar nele é a FK e a RLS.
 */
export const idSchema = z.guid({ error: "Identificador inválido" });

/**
 * Mesmo id canônico com a mensagem do campo, para o formulário dizer qual
 * escolha está faltando ("Selecione o fornecedor") em vez do genérico.
 */
export function idSchemaCom(mensagem: string) {
  return z.guid({ error: mensagem });
}
