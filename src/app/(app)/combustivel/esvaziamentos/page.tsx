import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EsvaziamentosAcoesCabecalho } from "@/modules/combustivel/esvaziamentos/components/esvaziamentos-acoes-cabecalho";
import { EsvaziamentosTabela } from "@/modules/combustivel/esvaziamentos/components/esvaziamentos-tabela";
import { listarEsvaziamentos } from "@/modules/combustivel/esvaziamentos/queries";
import { listarTanques } from "@/modules/combustivel/tanques/queries";

const RECURSO = "combustivel.esvaziamentos" as const;

export default async function PaginaEsvaziamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const [esvaziamentos, tanques] = await Promise.all([listarEsvaziamentos(), listarTanques()]);

  // Tanque de terceiro não se esvazia (o estoque é do dono): nem aparece.
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
        titulo="Esvaziamentos"
        descricao="Combustível retirado de um tanque da EMT, com o motivo. Tira do nível sem consumir o PEPS"
        acoes={<EsvaziamentosAcoesCabecalho podeCriar={podeCriar} tanques={opcoes} />}
      />
      <EsvaziamentosTabela esvaziamentos={esvaziamentos} tanquesFiltro={tanquesFiltro} podeExcluir={podeExcluir} />
    </>
  );
}
