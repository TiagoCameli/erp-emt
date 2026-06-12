import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DefinirSenhaForm } from "@/modules/auth/components/definir-senha-form";

export const metadata: Metadata = {
  title: "Definir senha",
};

export default function PaginaDefinirSenha() {
  return (
    <Card className="w-full max-w-sm border-t-[3px] border-t-faixa">
      <CardHeader className="text-center">
        <span className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary font-mono text-detalhe font-bold tracking-tight text-primary-foreground">
          EMT
        </span>
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
