import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoEmt } from "@/components/canonicos/logo-emt";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; destino?: string }>;
}) {
  const { erro, destino } = await searchParams;
  const erroInicial =
    erro === "link-invalido"
      ? "Link inválido ou expirado. Peça um novo convite ao administrador"
      : undefined;

  return (
    <Card className="w-full max-w-sm border-t-[3px] border-t-faixa">
      <CardHeader className="text-center">
        {/* A logo inteira, com o "Construtora Ltda": esta é a única tela do app
            onde há espaço para a marca completa, e é a primeira que o usuário vê. */}
        <LogoEmt titulo="EMT Construtora" className="mx-auto mb-3 w-[132px]" />
        <CardTitle className="text-secao">ERP EMT</CardTitle>
        <CardDescription>Entre com seu email e senha</CardDescription>
      </CardHeader>
      <CardContent>
        {/* O destino vem cru da URL de propósito: quem decide se ele presta é o
            destinoSeguro() dentro do entrar(), no servidor, não esta página. */}
        <LoginForm erroInicial={erroInicial} destino={destino} />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-legenda text-muted-foreground">
          Acesso por convite. Fale com o administrador.
        </p>
      </CardFooter>
    </Card>
  );
}
