import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { sessionSnapshot } from "./useSession";

type Callbacks<D, V> = {
  onSuccess?: (data: D, vars: V) => unknown;
  onError?: (error: unknown, vars: V) => unknown;
};

// A mutation whose callbacks do nothing once the session changed since it started, so a late answer
// cannot restore an ended account or clear a newer one. For requests that carry no secret.
export function useSessionMutation<D, V = void>(
  options: { mutationFn: (vars: V) => Promise<D> } & Callbacks<D, V>,
): UseMutationResult<D, unknown, V, () => boolean> {
  const queryClient = useQueryClient();
  return useMutation<D, unknown, V, () => boolean>({
    mutationFn: options.mutationFn,
    onMutate: () => sessionSnapshot(queryClient),
    onSuccess: (data, vars, check) => (check?.() ? options.onSuccess?.(data, vars) : undefined),
    onError: (error, vars, check) => (check?.() ? options.onError?.(error, vars) : undefined),
  });
}

type State<D> = { status: "idle" | "pending" | "success" | "error"; data?: D; error?: unknown };

// For requests that carry a password. The TanStack mutation cache keeps each mutation's variables and
// function for minutes, so these stay out of it: the secret only lives in this call and the input.
export function useSecretSubmit<D, V = void>(
  fn: (vars: V) => Promise<D>,
  callbacks: Callbacks<D, V> = {},
) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State<D>>({ status: "idle" });
  const latest = useRef({ fn, callbacks });
  const alive = useRef(true);
  useEffect(() => {
    latest.current = { fn, callbacks };
  });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const mutate = useCallback((vars: V) => {
    const stillCurrent = sessionSnapshot(queryClient);
    setState({ status: "pending" });
    latest.current.fn(vars).then(
      (data) => {
        if (stillCurrent()) latest.current.callbacks.onSuccess?.(data, vars);
        if (alive.current) setState({ status: "success", data });
      },
      (error: unknown) => {
        if (stillCurrent()) latest.current.callbacks.onError?.(error, vars);
        if (alive.current) setState({ status: "error", error });
      },
    );
  }, [queryClient]);
  const reset = useCallback(() => setState({ status: "idle" }), []);

  return {
    mutate,
    reset,
    isPending: state.status === "pending",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    error: state.error,
  };
}
