"use client";

import * as React from "react";
import { Archive, Move, X } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import {
  TIPOS_LOCAL,
  type LocalidadeMapa,
  type ObraMapa,
} from "@/modules/mapa/tipos";

/**
 * A ficha do local tocado no mapa: nome e tipos (um local pode ser pátio, jazida e oficina ao
 * mesmo tempo; o primeiro é o principal e decide o estado da máquina que cai nele), o que está ali
 * (tanques, depósitos), "Mover no mapa" e o tamanho da área, que decide até onde uma máquina
 * solta "cai" no local. O raio muda no mapa enquanto a pessoa mexe (prévia) e só grava em
 * "Salvar área". Jazida é de uma obra: quem opera nela trabalha para essa obra, e trocar a obra
 * da jazida leva junto quem está ali. "Inativar" tira o local do mapa (volta pelo Cadastros).
 */

const OPCOES_TIPO = TIPOS_LOCAL.map((t) => ({
  valor: t,
  rotulo: rotuloTipoLocalidade(t),
}));

const RAIO_MIN = 10;
const RAIO_MAX = 5000;
/** O slider vai até 2 km (passo de 10 m); o campo aceita até 5 km. */
const SLIDER_MAX = 2000;

export function FichaLocal({
  local,
  obras,
  itens,
  padraoM,
  podeEditar,
  salvando,
  onFechar,
  onPrevia,
  onSalvar,
  onSalvarDados,
  onMover,
  onInativar,
}: {
  local: LocalidadeMapa;
  /** Obras ativas, para atrelar o local (obrigatório na jazida). */
  obras: readonly ObraMapa[];
  /** Tanques e depósitos ligados ao local. */
  itens: readonly string[];
  /** Raio quando o local não tem um próprio (configuração mapa.snap_local_m). */
  padraoM: number;
  podeEditar: boolean;
  salvando: boolean;
  onFechar: () => void;
  /** Raio em prévia no mapa; null tira a prévia. */
  onPrevia: (raioM: number | null) => void;
  /** null volta ao padrão. false = recusou (o toast já avisou). */
  onSalvar: (raioM: number | null) => Promise<boolean>;
  /** Nome, tipos e obra (null = não mexe). false = recusou. */
  onSalvarDados: (
    nome: string,
    tipos: string[],
    obraId: string | null,
  ) => Promise<boolean>;
  /** Escolher o novo ponto do local no mapa. */
  onMover: () => void;
  /** Tira o local do mapa. false = recusou. */
  onInativar: () => Promise<boolean>;
}) {
  const [nome, setNome] = React.useState(local.nome);
  const [tipos, setTipos] = React.useState<string[]>(local.tipos);
  const [obraId, setObraId] = React.useState(local.obraId ?? "");
  const [confirmarInativar, setConfirmarInativar] = React.useState(false);
  const idNome = React.useId();
  const idTipos = React.useId();
  const idObra = React.useId();
  const ehJazida = tipos.includes("jazida");
  const faltaObra = ehJazida && !obraId;
  const obraAtual = obras.find((o) => o.id === local.obraId) ?? null;
  const opcoesObra = React.useMemo(
    () => obras.map((o) => ({ valor: o.id, rotulo: o.nome })),
    [obras],
  );
  const dadosMudaram =
    nome.trim() !== local.nome ||
    obraId !== (local.obraId ?? "") ||
    tipos.length !== local.tipos.length ||
    tipos.some((t, i) => t !== local.tipos[i]);
  const atual = local.raioM ?? padraoM;
  const [raio, setRaio] = React.useState(atual);
  const [texto, setTexto] = React.useState(String(Math.round(atual)));
  const idRaio = React.useId();
  const mudou = Math.round(raio) !== Math.round(atual);

  const aplicar = (valor: number) => {
    const limitado = Math.min(RAIO_MAX, Math.max(RAIO_MIN, Math.round(valor)));
    setRaio(limitado);
    setTexto(String(limitado));
    onPrevia(limitado);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{local.nome}</p>
          <p className="text-detalhe text-muted-foreground">
            {local.tipos.map(rotuloTipoLocalidade).join(" · ")}
          </p>
          {obraAtual ? (
            <p className="text-detalhe text-foreground">{obraAtual.nome}</p>
          ) : local.tipos.includes("jazida") ? (
            <p className="text-detalhe text-status-pendente">
              Jazida sem obra: escolha a obra para quem opera aqui contar nela.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onFechar}
          aria-label="Fechar"
        >
          <X />
        </Button>
      </div>

      {podeEditar ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idNome}>Nome</Label>
            <Input
              id={idNome}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={300}
              disabled={salvando}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idTipos}>Tipos (o primeiro é o principal)</Label>
            <Combobox
              id={idTipos}
              valor=""
              onValorChange={() => undefined}
              valores={tipos}
              onValoresChange={setTipos}
              opcoes={OPCOES_TIPO}
              placeholder="Escolha os tipos"
              disabled={salvando}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idObra}>
              {ehJazida ? "Obra (obrigatória na jazida)" : "Obra"}
            </Label>
            <Combobox
              id={idObra}
              valor={obraId}
              rotuloDoValor={obraAtual?.nome}
              onValorChange={setObraId}
              opcoes={opcoesObra}
              placeholder="Sem obra"
              buscaPlaceholder="Buscar obra"
              disabled={salvando}
            />
            {ehJazida ? (
              <p className="text-legenda text-muted-foreground">
                Quem opera na jazida trabalha para esta obra. Trocar a obra leva
                junto quem está aqui agora.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={
                !dadosMudaram ||
                salvando ||
                !nome.trim() ||
                tipos.length === 0 ||
                faltaObra
              }
              onClick={() =>
                void onSalvarDados(nome.trim(), tipos, obraId || null)
              }
            >
              Salvar dados
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={salvando}
              onClick={onMover}
            >
              <Move />
              Mover no mapa
            </Button>
          </div>
        </div>
      ) : null}

      {itens.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-detalhe">
          {itens.map((nome) => (
            <li key={nome} className="text-foreground">
              {nome}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-detalhe text-muted-foreground">
          Nenhum tanque ou depósito ligado a este local.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={idRaio}>Área (raio)</Label>
          <span className="text-legenda text-muted-foreground">
            {local.raioM === null
              ? `padrão, ${Math.round(padraoM)} m`
              : "próprio"}
          </span>
        </div>
        <Slider
          value={[Math.min(raio, SLIDER_MAX)]}
          min={RAIO_MIN}
          max={SLIDER_MAX}
          step={10}
          disabled={!podeEditar || salvando}
          onValueChange={(v) => aplicar(v[0] ?? raio)}
          aria-label="Raio da área"
        />
        <div className="flex items-center gap-2">
          <Input
            id={idRaio}
            inputMode="numeric"
            value={texto}
            disabled={!podeEditar || salvando}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
            onBlur={() => aplicar(Number(texto) || atual)}
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar(Number(texto) || atual);
            }}
            className="w-24"
          />
          <span className="text-detalhe text-muted-foreground">metros</span>
        </div>
      </div>

      {podeEditar ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!mudou || salvando}
            onClick={async () => {
              if (await onSalvar(raio)) onPrevia(null);
            }}
          >
            Salvar área
          </Button>
          {mudou ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={salvando}
              onClick={() => {
                setRaio(atual);
                setTexto(String(Math.round(atual)));
                onPrevia(null);
              }}
            >
              Desfazer
            </Button>
          ) : null}
          {local.raioM !== null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={async () => {
                if (await onSalvar(null)) {
                  setRaio(padraoM);
                  setTexto(String(Math.round(padraoM)));
                  onPrevia(null);
                }
              }}
            >
              Voltar ao padrão
            </Button>
          ) : null}
        </div>
      ) : null}

      {podeEditar ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {confirmarInativar ? (
            <>
              <span className="text-detalhe text-muted-foreground">
                Tirar {local.nome} do mapa?
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={salvando}
                onClick={async () => {
                  if (!(await onInativar())) setConfirmarInativar(false);
                }}
              >
                Inativar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={salvando}
                onClick={() => setConfirmarInativar(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={() => setConfirmarInativar(true)}
            >
              <Archive />
              Inativar local
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
