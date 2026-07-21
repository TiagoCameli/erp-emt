import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/canonicos";

export const metadata = {
  title: "Sem acesso",
};

export default function SemAcessoPage() {
  return (
    <EmptyState
      icone={Inbox}
      titulo="Você ainda não tem acesso a nenhum módulo"
      descricao="Fale com o administrador do sistema para liberar seu acesso."
    />
  );
}
