import { describe, expect, it } from "vitest";
import { linkAbort } from "./abort";

describe("linkAbort", () => {
  it("aborta o controller interno quando o externo aborta", () => {
    const controller = new AbortController();
    const external = new AbortController();
    linkAbort(controller, external.signal);

    expect(controller.signal.aborted).toBe(false);
    external.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("aborta na hora se o externo já veio abortado", () => {
    const controller = new AbortController();
    const external = new AbortController();
    external.abort();

    linkAbort(controller, external.signal);
    expect(controller.signal.aborted).toBe(true);
  });

  it("para de escutar depois do cleanup", () => {
    const controller = new AbortController();
    const external = new AbortController();
    const cleanup = linkAbort(controller, external.signal);

    cleanup();
    external.abort();
    expect(controller.signal.aborted).toBe(false);
  });

  it("não faz nada sem signal externo", () => {
    const controller = new AbortController();
    expect(() => linkAbort(controller, undefined)()).not.toThrow();
    expect(controller.signal.aborted).toBe(false);
  });
});
