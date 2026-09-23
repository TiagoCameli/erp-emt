import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { NavegacaoAlmoxarifado } from "@/modules/manutencao/almoxarifado/components/navegacao-almoxarifado";
import { PecasAcoesCabecalho } from "@/modules/manutencao/almoxarifado/components/pecas-acoes-cabecalho";
import { PecasLista } from "@/modules/manutencao/almoxarifado/components/pecas-lista";
import {
  listarEquipamentos,
  listarInsumosAtivos,
  listarPecas,
  listarTiposOleoAtivos,
  type InsumoOpcao,
  type Opcao,
} from "@/modules/manutencao/almoxarifado/queries";

export default async function PaginaPecasAlmoxarifado() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.almoxarifado", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.almoxarifado", "criar");
  const podeEditar = temPermissao(usuario, "manutencao.almoxarifado", "editar");
  const precisaDasListas = podeCriar || podeEditar;

  const [pecas, insumos, tiposOleo, equipamentos] = await Promise.all([
    listarPecas(),
    precisaDasListas ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
    precisaDasListas ? listarTiposOleoAtivos() : Promise.resolve<Opcao[]>([]),
    precisaDasListas
      ? listarEquipamentos()
      : Promise.resolve<(Opcao & { ativo: boolean })[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Peças do almoxarifado"
        descricao="Os insumos que a manutenção guarda, com estoque mínimo, tipo de óleo e equipamentos compatíveis"
        acoes={
          <>
            <NavegacaoAlmoxarifado atual="pecas" />
            <PecasAcoesCabecalho
              podeCriar={podeCriar}
              insumos={insumos}
              insumosJaCadastrados={pecas.map((peca) => peca.insumoId)}
              tiposOleo={tiposOleo}
              equipamentos={equipamentos}
            />
          </>
        }
      />
      <PecasLista
        pecas={pecas}
        insumos={insumos}
        tiposOleo={tiposOleo}
        equipamentos={equipamentos}
        podeEditar={podeEditar}
      />
    </>
  );
}
