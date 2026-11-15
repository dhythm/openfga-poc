import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createAuthz } from "./authz.js";
import { ACTIONS, BASE_TUPLES, FILES, PROJECTS, SHARE_EXPIRES_AT, SHARE_GRANT, USERS, WHAT_IFS } from "./scenario.js";

const API_URL = process.env.FGA_API_URL ?? "http://localhost:8080";
const PORT = Number(process.env.PORT ?? 3000);
const INDEX = new URL("../public/index.html", import.meta.url);
const MAX_BODY = 1024;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new HttpError(413, "payload too large");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

/** 判定時刻（ISO 8601）。未指定なら現在時刻 */
function parseAt(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  if (typeof value !== "string") throw new HttpError(400, "at は ISO 8601 文字列で指定してください");
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, `不正な日時です: ${value}`);
  return at;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function main() {
  const authz = await createAuthz({ apiUrl: API_URL, storeName: `poc-${Date.now()}` });
  console.log(`OpenFGA store: ${authz.storeId}`);

  const meta = {
    users: USERS, projects: PROJECTS, files: FILES, actions: ACTIONS,
    tuples: BASE_TUPLES, whatIfs: WHAT_IFS, modelDsl: authz.modelDsl,
    shareGrant: { ...SHARE_GRANT, expiresAt: SHARE_EXPIRES_AT.toISOString() },
  };

  async function checkResponse(at: Date) {
    return { ...(await authz.checkAll({ at })), activeWhatIfs: authz.activeWhatIfs() };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(INDEX));
      } else if (req.method === "GET" && url.pathname === "/api/meta") {
        sendJson(res, 200, meta);
      } else if (req.method === "GET" && url.pathname === "/api/check") {
        sendJson(res, 200, await checkResponse(parseAt(url.searchParams.get("at"))));
      } else if (req.method === "POST" && url.pathname === "/api/what-if") {
        const body = (await readJson(req)) as { id?: unknown; enabled?: unknown; at?: unknown };
        const at = parseAt(body.at);
        if (typeof body.id !== "string" || typeof body.enabled !== "boolean") throw new HttpError(400, "id(string) と enabled(boolean) が必要です");
        if (!WHAT_IFS.some((w) => w.id === body.id)) throw new HttpError(400, `unknown what-if: ${body.id}`);
        await authz.setWhatIf(body.id, body.enabled);
        sendJson(res, 200, await checkResponse(at));
      } else if (req.method === "GET" && url.pathname === "/api/list-objects") {
        const user = url.searchParams.get("user") ?? "";
        if (!USERS.some((u) => u.id === user)) throw new HttpError(400, "unknown user");
        const at = parseAt(url.searchParams.get("at"));
        sendJson(res, 200, { user, files: await authz.listViewableFiles(user, { at }) });
      } else {
        sendJson(res, 404, { error: "not found" });
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      sendJson(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  server.listen(PORT, "127.0.0.1", () => console.log(`PoC UI: http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
