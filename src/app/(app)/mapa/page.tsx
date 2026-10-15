import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TelaMapa } from "@/modules/mapa/components/tela-mapa";
import { carregarEstadoMapa } from "@/modules/mapa/queries";

/**
 * Mapa: a frota e as pessoas em 3D sobre a BR-364, arrastáveis. Leitura numa RPC só
 * (`fn_mapa_estado`, que recusa quem não tem mapa.mapa/ver); as ações pedem editar.
 *
 * A chave e o Map ID do Google vão para o navegador de propósito (a chave é restrita por domínio).
 * Lidos aqui, no servidor, a cada requisição, e passados como prop: sem chave a tela avisa e segue
 * com tiles da Esri em vez de quebrar. Na Vercel as variáveis se chamam NEXT_GOOGLE_MAPS_* (sem
 * PUBLIC_); por serem lidas no servidor, não precisam do prefixo que o Next embute no build.
 * NEXT_PUBLIC_GOOGLE_MAPS_* continua valendo como reserva (.env.local antigo).
 */
export default async function PaginaMapa() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "mapa.mapa", "ver")) notFound();

  const cabecalho = (
    <PageHeader
      compacto
      modulo="Mapa"
      titulo="Frota no mapa"
      descricao="Onde cada máquina e cada pessoa está hoje. Arraste para transferir; a confirmação registra a movimentação."
    />
  );

  const { estado, erro } = await carregarEstadoMapa();
  if (!estado) {
    return (
      <>
        {cabecalho}
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar o mapa"
          descricao={erro ?? undefined}
        />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      {/* Sem cabeçalho visível: o espaço é do mapa (pedido do Tiago, 15/10). */}
      <h1 className="sr-only">Frota no mapa</h1>
      <TelaMapa
        inicial={estado}
        google={{
          chave:
            process.env.NEXT_GOOGLE_MAPS_API_KEY ||
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
            "",
          mapId:
            process.env.NEXT_GOOGLE_MAPS_MAP_ID ||
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ||
            "",
        }}
        permissoes={{
          editar: temPermissao(usuario, "mapa.mapa", "editar"),
          criar: temPermissao(usuario, "mapa.mapa", "criar"),
        }}
      />
    </div>
  );
}
