import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const erroInicial =
    erro === "link-invalido"
      ? "Link inválido ou expirado. Peça um novo convite ao administrador"
      : undefined;

  return (
    <Card className="w-full max-w-sm border-t-[3px] border-t-faixa">
      <CardHeader className="text-center">
        <span className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary font-mono text-detalhe font-bold tracking-tight text-primary-foreground">
          EMT
        </span>
        <CardTitle className="text-secao">ERP EMT</CardTitle>
        <CardDescription>Entre com seu email e senha</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm erroInicial={erroInicial} />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-legenda text-muted-foreground">
          Acesso por convite. Fale com o administrador.
        </p>
      </CardFooter>
    </Card>
  );
}
