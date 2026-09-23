import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { getUsuarioLogado } from "@/lib/permissoes";
import {
  equipamentoDoLegado,
  equipamentoPeloCodigo,
  pareceUuid,
} from "@/modules/manutencao/campo/queries";
import { veManutencao } from "@/modules/manutencao/campo/permissao";

/**
 * Endereço do adesivo antigo do Gestão Obras (`/m/eq/<id de lá>`), e do código digitado
 * no leitor. Tenta, nesta ordem: o id antigo no de-para, o id do ERP, o código impresso
 * na etiqueta. Conferido em 23/09: dos 109 ids antigos, 69 são iguais a um código do ERP,
 * e todos os 69 apontam para o MESMO equipamento, então a ordem não troca de máquina.
 */
export default async function AdesivoAntigoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bruto } = await params;
  const id = decodeURIComponent(bruto);

  const usuario = await getUsuarioLogado();
  if (!veManutencao(usuario)) {
    return (
      <EmptyState
        icone={SearchX}
        titulo="Sem acesso à Manutenção"
        descricao="Peça acesso a quem cuida das permissões para abrir equipamentos pelo QR."
      />
    );
  }

  const destino =
    (await equipamentoDoLegado(id)) ?? (pareceUuid(id) ? id : null) ?? (await equipamentoPeloCodigo(id));
  if (destino) redirect(`/m/equipamento/${destino}`);

  return (
    <EmptyState
      icone={SearchX}
      titulo="Equipamento não encontrado"
      descricao={`Nenhum equipamento com o código "${id}". Escolha da lista ou leia o QR de novo.`}
      acao={
        <Button asChild>
          <Link href="/m/leitor">Voltar ao leitor</Link>
        </Button>
      }
    />
  );
}
