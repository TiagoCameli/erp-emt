import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/colaboradores/actions";
import { ColaboradoresFormDrawer } from "@/modules/cadastros/colaboradores/components/colaboradores-form-drawer";
import { ColaboradoresTabela } from "@/modules/cadastros/colaboradores/components/colaboradores-tabela";
import { listarDependentesPorColaborador } from "@/modules/cadastros/colaboradores/dependentes";
import {
  listar,
  listarCentrosCusto,
  listarObras,
} from "@/modules/cadastros/colaboradores/queries";
import { listarFuncoesAtivas } from "@/modules/cadastros/funcoes/queries";

export default async function PaginaColaboradores() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.colaboradores", "ver")) {
    notFound();
  }

  const [
    colaboradores,
    obras,
    centrosCusto,
    funcoes,
    dependentesPorColaborador,
  ] = await Promise.all([
    listar(),
    listarObras(),
    listarCentrosCusto(),
    listarFuncoesAtivas(),
    listarDependentesPorColaborador(),
  ]);

  const podeCriar = temPermissao(usuario, "cadastros.colaboradores", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.colaboradores", "editar");
  const podeExcluir = temPermissao(
    usuario,
    "cadastros.colaboradores",
    "excluir",
  );

  return (
    <>
      <PageHeader
        titulo="Colaboradores"
        descricao="Equipe de campo e escritório, com vínculo, obra e centro de custo"
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar colaboradores"
                modeloHref="/cadastros/colaboradores/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
              <ColaboradoresFormDrawer
                obras={obras}
                centrosCusto={centrosCusto}
                funcoes={funcoes}
                mostrarGatilho
              />
            </>
          ) : undefined
        }
      />
      <ColaboradoresTabela
        colaboradores={colaboradores}
        obras={obras}
        centrosCusto={centrosCusto}
        funcoes={funcoes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        dependentesPorColaborador={dependentesPorColaborador}
      />
    </>
  );
}
