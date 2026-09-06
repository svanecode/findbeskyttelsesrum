import { readFile } from "node:fs/promises";
import ts from "typescript";

/** Execute the actual server module with explicit dependency mocks and no network. */
export async function loadServerModule<T>(url: URL, dependencies: Record<string, unknown>): Promise<T> {
  const source = await readFile(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: url.pathname,
  });
  const moduleState = { exports: {} };
  const requireDependency = (name: string) => {
    if (name === "server-only") return {};
    if (!(name in dependencies)) throw new Error(`Unmocked server dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", outputText)(requireDependency, moduleState, moduleState.exports);
  return moduleState.exports as T;
}
