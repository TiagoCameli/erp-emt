import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoEmt } from "@/components/canonicos";
import { getUsuarioLogado } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { FilaCampoProvider, IndicadorFila } from "@/modules/manutencao/campo/components/fila-campo";
import { RegistrarServiceWorker } from "@/modules/manutencao/campo/components/registrar-service-worker";

export const metadata: Metadata = {
  title: "Campo",
  manifest: "/campo.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3E7744",
};

/**
 * Telas de campo (celular, abertas pelo QR): sem a moldura do sistema. As travas de
 * conta são as mesmas do layout do app, que este grupo não herda: sem sessão o proxy já
 * mandou para o login; desativado e senha provisória são conferidos aqui.
 */
export default async function CampoLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!usuario) {
    if (user) redirect("/conta-desativada");
    redirect("/login");
  }
  if (user?.user_metadata?.senha_temporaria === true) redirect("/definir-senha");

  return (
    <FilaCampoProvider usuarioId={usuario.id}>
      <RegistrarServiceWorker usuarioId={usuario.id} />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
          <Link href="/m/leitor" aria-label="Leitor de QR">
            <LogoEmt variante="completa" className="h-7 w-auto" />
          </Link>
          <IndicadorFila />
        </header>
        <main className="flex flex-1 flex-col gap-5 px-4 py-5">{children}</main>
        <footer className="px-4 pb-6 text-center text-legenda text-muted-foreground">
          {usuario.nome} ·{" "}
          <Link href="/" className="underline">
            Abrir o sistema completo
          </Link>
        </footer>
      </div>
    </FilaCampoProvider>
  );
}
