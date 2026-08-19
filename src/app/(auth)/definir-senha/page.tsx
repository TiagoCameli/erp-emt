import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoEmt } from "@/components/canonicos/logo-emt";
import { DefinirSenhaForm } from "@/modules/auth/components/definir-senha-form";

export const metadata: Metadata = {
  title: "Definir senha",
};

export default function PaginaDefinirSenha() {
  return (
    <Card className="w-full max-w-sm border-t-[3px] border-t-faixa">
      <CardHeader className="text-center">
        <LogoEmt titulo="EMT Construtora" className="mx-auto mb-3 w-[132px]" />
        <CardTitle className="text-secao">Defina sua senha</CardTitle>
        <CardDescription>
          Crie a senha que você vai usar para entrar no ERP EMT
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DefinirSenhaForm />
      </CardContent>
    </Card>
  );
}
