import { ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/canonicos";
import { getUsuarioLogado } from "@/lib/permissoes";
import { EscolherEquipamento } from "@/modules/manutencao/campo/components/escolher-equipamento";
import { LeitorQr } from "@/modules/manutencao/campo/components/leitor-qr";
import { veManutencao } from "@/modules/manutencao/campo/permissao";
import { listarEquipamentosCampo } from "@/modules/manutencao/campo/queries";

export const metadata = { title: "Leitor de QR" };

export default async function CampoInicioPage() {
  const usuario = await getUsuarioLogado();
  if (!veManutencao(usuario)) {
    return (
      <EmptyState
        icone={ShieldOff}
        titulo="Sem acesso à Manutenção"
        descricao="Peça acesso a quem cuida das permissões para abrir equipamentos pelo QR."
      />
    );
  }

  const equipamentos = await listarEquipamentosCampo();

  return (
    <>
      <div>
        <h1 className="text-titulo font-semibold">Equipamento</h1>
        <p className="text-detalhe text-muted-foreground">
          Leia o QR colado na máquina para lançar horímetro ou abrir OS.
        </p>
      </div>
      <LeitorQr />
      <EscolherEquipamento equipamentos={equipamentos} />
    </>
  );
}
