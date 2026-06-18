import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { DepositosAcoesCabecalho } from "@/modules/cadastros/depositos/components/depositos-acoes-cabecalho";
import { DepositosTabela } from "@/modules/cadastros/depositos/components/depositos-tabela";
import {
  listar,
  listarInsumos,
  listarObras,
} from "@/modules/cadastros/depositos/queries";

export default async function PaginaDepositos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.depositos", "ver")) {
    notFound();
  }

  const [depositos, obras, insumos] = await Promise.all([
    listar(),
    listarObras(),
    listarInsumos(),
  ]);

  const podeCriar = temPermissao(usuario, "cadastros.depositos", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.depositos", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.depositos", "excluir");

  return (
    <>
      <PageHeader
        titulo="Depósitos e tanques"
        descricao="Depósitos centrais, de obra, almoxarifados e tanques de combustível ou betuminoso"
        acoes={
          <DepositosAcoesCabecalho
            obras={obras}
            insumos={insumos}
            podeCriar={podeCriar}
          />
        }
      />
      <DepositosTabela
        depositos={depositos}
        obras={obras}
        insumos={insumos}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
