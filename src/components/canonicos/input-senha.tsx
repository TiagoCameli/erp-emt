"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com botão de mostrar/ocultar (olho). Aceita os mesmos props
 * do Input (inclusive o ref/registro do react-hook-form).
 */
export const InputSenha = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(function InputSenha({ className, disabled, ...props }, ref) {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visivel ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        disabled={disabled}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {visivel ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
