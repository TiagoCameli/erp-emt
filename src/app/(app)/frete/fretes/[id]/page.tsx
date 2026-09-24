import Link from "next/link";
import { Truck } from "lucide-react";

import { EmptyState, PageHeader, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FreteDetalheAcoes } from "@/modules/frete/fretes/components/frete-detalhe-acoes";
import { FreteDetalheConteudo } from "@/modules/frete/fretes/components/frete-detalhe-drawer";
import { buscarFrete, listarOpcoesFrete } from "@/modules/frete/fretes/queries";
import { diaBR, tituloDoFrete } from "@/modules/frete/fretes/schemas";
import type { OpcoesFrete } from "@/modules/frete/fretes/tipos";

const RECURSO = "frete.fretes" as const;
const VOLTAR = { rota: "/frete/fretes", rotulo: "Voltar para fretes" };
const OPCOES_VAZIAS: OpcoesFrete = { localidades: [], transportadoras: [], insumos: [], obras: [] };

/** Frete que não existe, id inválido ou sem permissão: a mesma resposta, sem dizer qual. */
function FreteNaoEncontrado() {
  return (
    <>
      <PageHeader modulo="Frete" titulo="Frete" voltarPara={VOLTAR} />
      <EmptyState
        icone={Truck}
        titulo="Frete não encontrado"
        descricao="O link pode estar errado, o frete pode ter sido apagado, ou você não tem acesso aos fretes"
        acao={
          <Button asChild size="sm" variant="outline">
            <Link href={VOLTAR.rota}>{VOLTAR.rotulo}</Link>
          </Button>
        }
      />
    </>
  );
}

/**
 * Página de um frete (`/frete/fretes/[id]`), o destino dos links da aba Anomalias. Mesmo
 * conteúdo do drawer da lista. O excluído também abre, com o selo "Excluído" e o motivo.
 */
export default async function PaginaFrete({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) return <FreteNaoEncontrado />;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return <FreteNaoEncontrado />;

  const frete = await buscarFrete(id);
  if (!frete) return <FreteNaoEncontrado />;

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;
  const opcoes = podeEditar && !frete.excluidoEm ? await listarOpcoesFrete() : OPCOES_VAZIAS;

  const excluido = frete.excluidoEm !== null;
  const descricao = excluido
    ? `Excluído em ${formatarDataHora(frete.excluidoEm)}${frete.motivoExclusao ? ` · Motivo: ${frete.motivoExclusao}` : ""}`
    : `${diaBR(frete.data)} · ${frete.transportadoraNome}`;

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo={tituloDoFrete(frete)}
        descricao={descricao}
        voltarPara={VOLTAR}
        selos={excluido ? <StatusBadge status="rejeitado" rotulo="Excluído" /> : undefined}
        acoes={
          <FreteDetalheAcoes
            frete={frete}
            opcoes={opcoes}
            podeEditar={podeEditar}
            podeExcluir={podeExcluir}
            podeRestaurar={podeRestaurar}
          />
        }
      />
      <FreteDetalheConteudo
        key={`${frete.id}-${frete.updatedAt}-${frete.excluidoEm ?? ""}`}
        frete={frete}
        podeEditar={podeEditar}
      />
    </>
  );
}
