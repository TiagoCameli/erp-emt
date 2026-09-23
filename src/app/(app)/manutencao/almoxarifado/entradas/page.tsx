import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EntradasAcoesCabecalho } from "@/modules/manutencao/almoxarifado/components/entradas-acoes-cabecalho";
import { EntradasTabela } from "@/modules/manutencao/almoxarifado/components/entradas-tabela";
import { NavegacaoAlmoxarifado } from "@/modules/manutencao/almoxarifado/components/navegacao-almoxarifado";
import {
  listarDepositos,
  listarEntradas,
  listarFornecedoresAtivos,
  listarInsumosAtivos,
  type InsumoOpcao,
  type Opcao,
} from "@/modules/manutencao/almoxarifado/queries";

export default async function PaginaEntradasAlmoxarifado() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.almoxarifado", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.almoxarifado", "criar");
  const podeEditar = temPermissao(usuario, "manutencao.almoxarifado", "editar");
  const podeExcluir = temPermissao(usuario, "manutencao.almoxarifado", "excluir");

  // Fornecedor entra no registro e na edição; insumo, só no registro. Quem não
  // pode nenhum dos dois não paga a leitura de 3 mil insumos.
  const [entradas, depositos, fornecedores, insumos] = await Promise.all([
    listarEntradas(),
    listarDepositos(),
    podeCriar || podeEditar ? listarFornecedoresAtivos() : Promise.resolve<Opcao[]>([]),
    podeCriar ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
  ]);

  const todosDepositos = depositos.map((deposito) => ({ id: deposito.id, nome: deposito.nome }));
  const depositosAtivos = depositos
    .filter((deposito) => deposito.ativo)
    .map((deposito) => ({ id: deposito.id, nome: deposito.nome }));

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Entradas do almoxarifado"
        descricao="Peças que entraram por nota fiscal. Cada linha soma no saldo e no custo médio do depósito"
        acoes={
          <>
            <NavegacaoAlmoxarifado atual="entradas" />
            <EntradasAcoesCabecalho
              podeCriar={podeCriar}
              depositos={depositosAtivos}
              fornecedores={fornecedores}
              insumos={insumos}
            />
          </>
        }
      />
      <EntradasTabela
        entradas={entradas}
        depositos={todosDepositos}
        fornecedores={fornecedores}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
