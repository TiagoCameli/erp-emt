import { redirect } from "next/navigation";

/**
 * `/m` fica fora do escopo `/m/` do service worker (escopo é prefixo, e `/m` sem barra
 * pegaria `/manutencao` do computador). O leitor mora em `/m/leitor`, dentro do escopo.
 */
export default function CampoRaizPage() {
  redirect("/m/leitor");
}
