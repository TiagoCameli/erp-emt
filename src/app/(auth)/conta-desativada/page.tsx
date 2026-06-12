import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioLogado } from "@/lib/permissoes";
import { sair } from "@/modules/auth/actions";

export const metadata = { title: "Conta desativada" };

/**
 * Destino de quem tem sessão válida mas está desativado (ou sem
 * cadastro em usuarios). Evita o loop /login <-> / do middleware.
 */
export default async function ContaDesativadaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Usuário ativo não tem nada que ver aqui.
  const usuario = await getUsuarioLogado();
  if (usuario) redirect("/");

  return (
    <Card className="w-full max-w-sm border-t-[3px] border-t-faixa">
      <CardHeader>
        <CardTitle className="text-secao">Conta desativada</CardTitle>
        <CardDescription>
          Seu acesso ao ERP EMT está desativado. Fale com o administrador do
          sistema para reativar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={sair}>
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
