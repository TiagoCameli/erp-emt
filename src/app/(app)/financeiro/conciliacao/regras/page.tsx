import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { contaPorEtapa } from "@/modules/financeiro/aplicacoes/queries";
import { RegrasCliente } from "@/modules/financeiro/conciliacao/components/regras-cliente";
import {
  listarContasBancarias,
  listarRegras,
} from "@/modules/financeiro/conciliacao/queries";
import {
  listarCategorias,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";

/**
 * Regras de conciliação por histórico (Bloco H, 05/10/2026): o que o app faz
 * sozinho com "BB RENDE FÁCIL", tarifas e outros históricos que se repetem.
 * Fica sob a permissão da Conciliação; editar exige "editar".
 */
export default async function PaginaRegras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.conciliacao", "ver")) {
    notFound();
  }

  const [regras, contas, centros, categorias, fornecedores, contasDasAplicacoes] = await Promise.all([
    listarRegras(),
    listarContasBancarias(),
    listarCentrosCusto(),
    listarCategorias(),
    listarFornecedores(),
    contaPorEtapa(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Regras de conciliação"
        descricao="O que o app faz sozinho quando o histórico do banco tem um texto"
      />
      <RegrasCliente
        regras={regras}
        opcoes={{ contas, centros, categorias, fornecedores, contaPorEtapa: contasDasAplicacoes }}
        podeEditar={temPermissao(usuario, "financeiro.conciliacao", "editar")}
      />
    </>
  );
}
