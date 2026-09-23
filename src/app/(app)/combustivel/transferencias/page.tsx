import { notFound } from "next/navigation";

import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { ultimosDias } from "@/modules/combustivel/relatorios/periodo";
import { listarTanques } from "@/modules/combustivel/tanques/queries";
import { TransferenciasTabela } from "@/modules/combustivel/transferencias/components/transferencias-tabela";
import { lerFiltrosTransferencias } from "@/modules/combustivel/transferencias/filtros";
import { listarTransferencias } from "@/modules/combustivel/transferencias/queries";
import { podeRestaurarMovimento } from "@/modules/combustivel/transferencias/regras";

const RECURSO = "combustivel.transferencias" as const;

/** A origem abre as listas nos últimos 30 dias (preset "ultimos_30"), como o painel. */
const DIAS_PADRAO = 30;

export default async function PaginaTransferencias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const podeRestaurar = podeRestaurarMovimento((recurso, acao) => temPermissao(usuario, recurso, acao), RECURSO);
  const filtrosUrl = lerFiltrosTransferencias(await searchParams, ultimosDias(dataHojeISO(), DIAS_PADRAO));

  const [transferencias, tanques] = await Promise.all([
    listarTransferencias({ incluirExcluidos: podeRestaurar }),
    listarTanques(),
  ]);

  // Transferência nunca envolve tanque de terceiro: o banco recusa, e a tela nem oferece.
  const daEmt = tanques.filter((tanque) => !tanque.ehExterno);
  const opcoes = daEmt
    .filter((tanque) => tanque.ativo)
    .map((tanque) => ({
      id: tanque.id,
      nome: tanque.nome,
      nivel: tanque.nivel,
      capacidade: tanque.capacidade,
      combustivelId: tanque.combustivelId,
      combustivelNome: tanque.combustivelNome,
    }));
  const tanquesFiltro = daEmt.map((tanque) => ({ id: tanque.id, nome: tanque.nome }));

  return (
    <>
      <TituloAba titulo="Transferências" />
      <TransferenciasTabela
        transferencias={transferencias}
        filtrosUrl={filtrosUrl}
        podeCriar={podeCriar}
        tanques={opcoes}
        tanquesFiltro={tanquesFiltro}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeRestaurar={podeRestaurar}
      />
    </>
  );
}
