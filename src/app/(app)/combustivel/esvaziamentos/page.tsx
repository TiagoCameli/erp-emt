import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { EsvaziamentosAcoesCabecalho } from "@/modules/combustivel/esvaziamentos/components/esvaziamentos-acoes-cabecalho";
import { EsvaziamentosTabela } from "@/modules/combustivel/esvaziamentos/components/esvaziamentos-tabela";
import { listarEsvaziamentos } from "@/modules/combustivel/esvaziamentos/queries";
import { podeEsvaziar } from "@/modules/combustivel/esvaziamentos/schemas";
import { listarTanques } from "@/modules/combustivel/tanques/queries";
import { podeRestaurarMovimento } from "@/modules/combustivel/transferencias/regras";

const RECURSO = "combustivel.esvaziamentos" as const;

export default async function PaginaEsvaziamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const podeRestaurar = podeRestaurarMovimento((recurso, acao) => temPermissao(usuario, recurso, acao), RECURSO);

  const [esvaziamentos, tanques] = await Promise.all([
    listarEsvaziamentos({ incluirExcluidos: podeRestaurar }),
    listarTanques(),
  ]);

  // Como a origem: só tanque da EMT com combustível (nível > 0) se esvazia.
  const daEmt = tanques.filter((tanque) => !tanque.ehExterno);
  const opcoes = daEmt
    .filter(podeEsvaziar)
    .map((tanque) => ({
      id: tanque.id,
      nome: tanque.nome,
      nivel: tanque.nivel,
      combustivelNome: tanque.combustivelNome,
    }));
  const tanquesFiltro = daEmt.map((tanque) => ({ id: tanque.id, nome: tanque.nome }));

  return (
    <>
      {/* Fora da barra de abas: na origem o esvaziamento é ação do card do tanque. */}
      <Link
        href="/combustivel/tanques"
        className="mb-2 inline-flex items-center gap-1 text-detalhe text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Tanques
      </Link>
      <TituloAba
        titulo="Esvaziamentos"
        descricao="Descarte do combustível de um tanque da EMT, com o motivo, para trocar de combustível"
        acoes={<EsvaziamentosAcoesCabecalho podeCriar={podeCriar} tanques={opcoes} />}
      />
      <EsvaziamentosTabela
        esvaziamentos={esvaziamentos}
        tanquesFiltro={tanquesFiltro}
        podeExcluir={podeExcluir}
        podeRestaurar={podeRestaurar}
      />
    </>
  );
}
