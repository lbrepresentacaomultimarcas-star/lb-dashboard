"use client";

import { toast } from "sonner";

export const notify = {
  success: (msg: string, desc?: string) => toast.success(msg, { description: desc }),
  error: (msg: string, desc?: string) => toast.error(msg, { description: desc }),
  info: (msg: string, desc?: string) => toast(msg, { description: desc }),
  asyncOp: <T,>(
    p: Promise<T>,
    opts: { loading: string; success: string; error?: string },
  ) =>
    toast.promise(p, {
      loading: opts.loading,
      success: opts.success,
      error: (e) => (opts.error ?? "Erro: ") + (e instanceof Error ? e.message : String(e)),
    }),
};
