import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AdiantamentosAcoesCabecalho } from "@/modules/rh/adiantamentos/components/adiantamentos-acoes-cabecalho";
import { AdiantamentosTabela } from "@/modules/rh/adiantamentos/components/adiantamentos-tabela";
import { listarAdiantamentos } from "@/modules/rh/adiantamentos/queries";
import { listarFormasPagamento } from "@/modules/financeiro/lancamentos/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaAdiantamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.adiantamentos", "ver")) {
    notFound();
  }

  const [adiantamentos, colaboradores, formasPagamento] = await Promise.all([
    listarAdiantamentos(),
    listarColaboradores(),
    // O adiantamento exige a forma de pagamento, então a lista vem com a página.
    listarFormasPagamento(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.adiantamentos", "criar");
  const podeEditar = temPermissao(usuario, "rh.adiantamentos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.adiantamentos", "excluir");
  const podeVerLancamento = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "ver",
  );
  const podeVerFolha = temPermissao(usuario, "rh.folha", "ver");

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Adiantamentos"
        descricao="Adiantamentos por colaborador e competência, descontados na folha gerencial"
        acoes={
          podeCriar ? (
            <AdiantamentosAcoesCabecalho
              colaboradores={colaboradores}
              formasPagamento={formasPagamento}
            />
          ) : undefined
        }
      />
      <AdiantamentosTabela
        adiantamentos={adiantamentos}
        colaboradores={colaboradores}
        formasPagamento={formasPagamento}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeVerLancamento={podeVerLancamento}
        podeVerFolha={podeVerFolha}
      />
    </>
  );
}
