import { describe, expect, it } from "vitest";

import { atestadoCobre } from "@/modules/rh/ocorrencias/atestado";

describe("atestadoCobre", () => {
  it("cobre um dia dentro do intervalo", () => {
    expect(atestadoCobre("2026-03-12", "2026-03-14", "2026-03-13")).toBe(true);
  });

  it("cobre a borda de início", () => {
    expect(atestadoCobre("2026-03-12", "2026-03-14", "2026-03-12")).toBe(true);
  });

  it("cobre a borda de fim", () => {
    expect(atestadoCobre("2026-03-12", "2026-03-14", "2026-03-14")).toBe(true);
  });

  it("não cobre um dia antes do início", () => {
    expect(atestadoCobre("2026-03-12", "2026-03-14", "2026-03-11")).toBe(false);
  });

  it("não cobre um dia depois do fim", () => {
    expect(atestadoCobre("2026-03-12", "2026-03-14", "2026-03-15")).toBe(false);
  });

  it("com fim nulo, cobre só o dia de início", () => {
    expect(atestadoCobre("2026-03-12", null, "2026-03-12")).toBe(true);
  });

  it("com fim nulo, não cobre outro dia", () => {
    expect(atestadoCobre("2026-03-12", null, "2026-03-13")).toBe(false);
  });
});
