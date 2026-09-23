import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarTanques } from "@/modules/combustivel/tanques/queries";
import { TransferenciasAcoesCabecalho } from "@/modules/combustivel/transferencias/components/transferencias-acoes-cabecalho";
import { TransferenciasTabela } from "@/modules/combustivel/transferencias/components/transferencias-tabela";
import { listarTransferencias } from "@/modules/combustivel/transferencias/queries";

const RECURSO = "combustivel.transferencias" as const;

export default async function PaginaTransferencias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const [transferencias, tanques] = await Promise.all([listarTransferencias(), listarTanques()]);

  // Transferência nunca envolve tanque de terceiro: o banco recusa, e a tela nem oferece.
  const daEmt = tanques.filter((tanque) => !tanque.ehExterno);
  const opcoes = daEmt
    .filter((tanque) => tanque.ativo)
    .map((tanque) => ({
      id: tanque.id,
      nome: tanque.nome,
      nivel: tanque.nivel,
      combustivelNome: tanque.combustivelNome,
    }));
  const tanquesFiltro = daEmt.map((tanque) => ({ id: tanque.id, nome: tanque.nome }));

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Transferências"
        descricao="Combustível passado de um tanque da EMT para outro, com o valor pelo preço médio da origem"
        acoes={<TransferenciasAcoesCabecalho podeCriar={podeCriar} tanques={opcoes} />}
      />
      <TransferenciasTabela
        transferencias={transferencias}
        tanques={opcoes}
        tanquesFiltro={tanquesFiltro}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
