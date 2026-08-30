import type { Instrumentation } from "next";

function stripQuery(path: string) {
  return path.split(/[?#]/, 1)[0] ?? "";
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String(error.digest)
    : undefined;

  console.error("[SERVER_REQUEST_ERROR]", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown server error",
    digest,
    method: request.method,
    path: stripQuery(request.path),
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
