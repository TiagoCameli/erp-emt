"use client";

import { usePathname } from "next/navigation";

import type { RecursoDef } from "@/config/recursos";
import { TabNav } from "./tab-nav";

interface TabNavAtivoProps {
  /** Recursos do módulo JÁ filtrados pela permissão de ver. */
  recursos: readonly RecursoDef[];
}

/** Variante client do TabNav: descobre o pathname sozinha via usePathname(). */
export function TabNavAtivo({ recursos }: TabNavAtivoProps) {
  const pathname = usePathname();
  return <TabNav recursos={recursos} pathname={pathname} />;
}
