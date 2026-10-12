import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/centros-custo/actions";
import { ArvoreCentrosCusto } from "@/modules/cadastros/centros-custo/components/arvore-centros-custo";
import {
  listarAplicacoesDasEtapas,
  listarArvore,
  listarBloqueiosDeExclusao,
  listarContasParaAplicacao,
} from "@/modules/cadastros/centros-custo/queries";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";

export default async function PaginaCentrosCusto() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.centros-custo", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "cadastros.centros-custo", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.centros-custo", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.centros-custo", "excluir");

  const [nos, aplicacoes, contas, bloqueiosExclusao] = await Promise.all([
    listarArvore(),
    listarAplicacoesDasEtapas(),
    listarContasParaAplicacao(),
    podeExcluir ? listarBloqueiosDeExclusao() : Promise.resolve({}),
  ]);

  return (
    <>
      <PageHeader
        modulo="Cadastros"
        titulo="Centros de custo"
        descricao="A árvore Obra, Etapa e Item que organiza todo o custo do sistema"
        acoes={
          podeCriar ? (
            <ImportarCadastro
              titulo="Importar centros de custo"
              modeloHref="/cadastros/centros-custo/modelo"
              validarAction={validarImport}
              importarAction={importar}
            />
          ) : undefined
        }
      />
      <ArvoreCentrosCusto
        nos={nos}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        bloqueiosExclusao={bloqueiosExclusao}
        aplicacoes={aplicacoes}
        contas={contas}
      />
    </>
  );
}
