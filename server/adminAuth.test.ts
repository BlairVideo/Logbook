import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("./env", () => ({
  env: { adminKey: "correct-passphrase" },
}));

function makeReq(key?: string): Request {
  return {
    header: (name: string) => (name.toLowerCase() === "x-admin-key" ? key : undefined),
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAdmin", () => {
  it("calls next() and does not touch the response when the key is correct", async () => {
    const { requireAdmin } = await import("./adminAuth");
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireAdmin(makeReq("correct-passphrase"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 401 and does not call next() when no key is provided", async () => {
    const { requireAdmin } = await import("./adminAuth");
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireAdmin(makeReq(undefined), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("responds 401 for a wrong key of the same length", async () => {
    const { requireAdmin } = await import("./adminAuth");
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await requireAdmin(makeReq("wrong-passphrase!"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("responds 401 (without throwing) for a wrong key of a different length", async () => {
    const { requireAdmin } = await import("./adminAuth");
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await expect(requireAdmin(makeReq("short"), res, next)).resolves.toBeUndefined();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
