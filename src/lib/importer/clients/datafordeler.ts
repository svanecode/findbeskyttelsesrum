type DatafordelerClientOptions = {
  endpoint: string;
  apiKey: string;
  requestTimeoutMs: number;
};

const retryableStatusCodes = new Set([429, 500, 502, 503, 504]);
const maxRequestAttempts = 4;
const baseRetryDelayMs = 1000;

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

class DatafordelerRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  readonly contentType: string | null;
  readonly bodyPreview: string | null;

  constructor(input: {
    message: string;
    retryable: boolean;
    status?: number | null;
    contentType?: string | null;
    bodyPreview?: string | null;
  }) {
    super(input.message);
    this.name = "DatafordelerRequestError";
    this.retryable = input.retryable;
    this.status = input.status ?? null;
    this.contentType = input.contentType ?? null;
    this.bodyPreview = input.bodyPreview ?? null;
  }
}

function toSafeBodyPreview(value: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return null;
  }

  return collapsed.slice(0, 240);
}

function looksLikeTransientProxyBody(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return (
    normalized.includes("<html") ||
    normalized.includes("upstream") ||
    normalized.includes("gateway") ||
    normalized.includes("proxy error") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("service unavailable")
  );
}

export class DatafordelerGraphqlClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;

  constructor(options: DatafordelerClientOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  private async waitBeforeRetry(attempt: number) {
    const jitterMs = Math.floor(Math.random() * 250);
    const delayMs = baseRetryDelayMs * 2 ** (attempt - 1) + jitterMs;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async buildResponseError(input: {
    operationName: string;
    response: Response;
    expectJson: boolean;
  }) {
    const contentType = input.response.headers.get("content-type");
    const responseText = await input.response.text();
    const bodyPreview = toSafeBodyPreview(responseText);
    const isJsonResponse = contentType?.toLowerCase().includes("application/json") ?? false;
    const retryable =
      retryableStatusCodes.has(input.response.status) ||
      (!isJsonResponse && looksLikeTransientProxyBody(bodyPreview));

    if (!input.expectJson) {
      return new DatafordelerRequestError({
        message: `Datafordeler request for ${input.operationName} failed with ${input.response.status} ${input.response.statusText}${contentType ? ` (content-type: ${contentType})` : ""}${bodyPreview ? `. Body preview: ${bodyPreview}` : ""}.`,
        retryable,
        status: input.response.status,
        contentType,
        bodyPreview,
      });
    }

    return new DatafordelerRequestError({
      message: `Datafordeler response for ${input.operationName} was not valid JSON${input.response.status ? ` (status ${input.response.status})` : ""}${contentType ? ` (content-type: ${contentType})` : ""}${bodyPreview ? `. Body preview: ${bodyPreview}` : ""}.`,
      retryable,
      status: input.response.status,
      contentType,
      bodyPreview,
    });
  }

  async query<TData, TVariables extends Record<string, unknown>>(input: {
    query: string;
    variables: TVariables;
    operationName: string;
  }): Promise<TData> {
    const url = new URL(this.endpoint);

    if (!url.searchParams.has("apiKey")) {
      url.searchParams.set("apiKey", this.apiKey);
    }

    for (let attempt = 1; attempt <= maxRequestAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            operationName: input.operationName,
            query: input.query,
            variables: input.variables,
          }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const responseError = await this.buildResponseError({
            operationName: input.operationName,
            response,
            expectJson: false,
          });

          if (responseError.retryable && attempt < maxRequestAttempts) {
            console.warn(
              `[importer] datafordeler: retrying ${input.operationName} after ${responseError.status ?? "unknown"} response (attempt ${attempt + 1}/${maxRequestAttempts})`,
            );
            await this.waitBeforeRetry(attempt);
            continue;
          }

          throw responseError;
        }

        const responseText = await response.text();
        let payload: GraphqlResponse<TData>;

        try {
          payload = JSON.parse(responseText) as GraphqlResponse<TData>;
        } catch {
          const responseError = await this.buildResponseError({
            operationName: input.operationName,
            response: new Response(responseText, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }),
            expectJson: true,
          });

          if (responseError.retryable && attempt < maxRequestAttempts) {
            console.warn(
              `[importer] datafordeler: retrying ${input.operationName} after non-JSON response (attempt ${attempt + 1}/${maxRequestAttempts})`,
            );
            await this.waitBeforeRetry(attempt);
            continue;
          }

          throw responseError;
        }

        if (payload.errors && payload.errors.length > 0) {
          const summary = payload.errors
            .map((error) => error.message ?? "Unknown GraphQL error")
            .join("; ");
          throw new Error(`Datafordeler GraphQL error in ${input.operationName}: ${summary}`);
        }

        if (!payload.data) {
          throw new Error(
            `Datafordeler GraphQL response for ${input.operationName} did not include data.`,
          );
        }

        return payload.data;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < maxRequestAttempts) {
            console.warn(
              `[importer] datafordeler: retrying ${input.operationName} after timeout (attempt ${attempt + 1}/${maxRequestAttempts})`,
            );
            await this.waitBeforeRetry(attempt);
            continue;
          }

          throw new Error(
            `Datafordeler request for ${input.operationName} timed out after ${this.requestTimeoutMs}ms.`,
          );
        }

        if (error instanceof DatafordelerRequestError) {
          throw error;
        }

        if (error instanceof TypeError) {
          throw new Error(`Datafordeler network error in ${input.operationName}: ${error.message}`);
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Datafordeler request for ${input.operationName} failed after retries.`);
  }
}
