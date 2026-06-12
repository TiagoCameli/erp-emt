/**
 * Layout das telas de autenticação: conteúdo centrado sobre a superfície
 * neutra, sem sidebar nem navegação.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-surface p-4">
      {children}
    </div>
  );
}
