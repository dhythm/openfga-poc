import { readFile } from "node:fs/promises";
import { OpenFgaClient } from "@openfga/sdk";
import { transformer } from "@openfga/syntax-transformer";
import { BASE_TUPLES, FILES, USERS, WHAT_IFS, buildCheckItems, fromCorrelationId } from "./scenario.js";

export type Matrix = Record<string, Record<string, Record<string, boolean>>>;

export type CheckAllResult = {
  matrix: Matrix;
  total: number;
  allowedCount: number;
  elapsedMs: number;
};

export type Authz = {
  storeId: string;
  modelDsl: string;
  checkAll: () => Promise<CheckAllResult>;
  setWhatIf: (id: string, enabled: boolean) => Promise<void>;
  activeWhatIfs: () => string[];
  listViewableFiles: (userId: string) => Promise<string[]>;
};

const MODEL_PATH = new URL("./model.fga", import.meta.url);

/** ストア作成 → モデル登録 → 初期タプル投入まで行い、判定用の関数群を返す */
export async function createAuthz(opts: { apiUrl: string; storeName: string }): Promise<Authz> {
  const modelDsl = await readFile(MODEL_PATH, "utf8");

  const bootstrap = new OpenFgaClient({ apiUrl: opts.apiUrl });
  const store = await bootstrap.createStore({ name: opts.storeName }).catch((e: unknown) => {
    throw new Error(`OpenFGA (${opts.apiUrl}) に接続できません。\`npm run fga:up\` で起動してください: ${String(e)}`);
  });

  const storeClient = new OpenFgaClient({ apiUrl: opts.apiUrl, storeId: store.id });
  const model = await storeClient.writeAuthorizationModel(transformer.transformDSLToJSONObject(modelDsl));
  const client = new OpenFgaClient({ apiUrl: opts.apiUrl, storeId: store.id, authorizationModelId: model.authorization_model_id });

  // Write API は 1 リクエスト 100 タプルまで。今回は 20 件程度なので一括で投入
  await client.writeTuples(BASE_TUPLES.map(({ user, relation, object }) => ({ user, relation, object })));

  const active = new Set<string>();

  async function checkAll(): Promise<CheckAllResult> {
    const started = performance.now();
    const { result } = await client.batchCheck({ checks: buildCheckItems() });
    const elapsedMs = performance.now() - started;

    const matrix: Matrix = Object.fromEntries(USERS.map((u) => [u.id, Object.fromEntries(FILES.map((f) => [f.id, {}]))]));
    let allowedCount = 0;
    for (const r of result) {
      if (r.error) throw new Error(`check failed (${r.correlationId}): ${r.error.message ?? "unknown"}`);
      const { user, file, action } = fromCorrelationId(r.correlationId);
      matrix[user][file][action] = r.allowed;
      if (r.allowed) allowedCount++;
    }
    return { matrix, total: result.length, allowedCount, elapsedMs };
  }

  async function setWhatIf(id: string, enabled: boolean): Promise<void> {
    const w = WHAT_IFS.find((x) => x.id === id);
    if (!w) throw new Error(`unknown what-if: ${id}`);
    if (enabled === active.has(id)) return;
    if (enabled) await client.writeTuples([w.tuple]);
    else await client.deleteTuples([w.tuple]);
    if (enabled) active.add(id);
    else active.delete(id);
  }

  async function listViewableFiles(userId: string): Promise<string[]> {
    const res = await client.listObjects({ user: `user:${userId}`, relation: "can_view", type: "file" });
    return res.objects.map((o) => o.replace(/^file:/, ""));
  }

  return { storeId: store.id, modelDsl, checkAll, setWhatIf, activeWhatIfs: () => [...active], listViewableFiles };
}
