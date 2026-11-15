/**
 * OpenFGA 実サーバーに対する仕様テスト（期待する権限表＝仕様）。
 * 事前に `npm run fga:up` で OpenFGA を起動しておくこと。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createAuthz, type Authz } from "../src/authz.js";
import { FILES, USERS } from "../src/scenario.js";

// 文字列は [閲覧 V / 編集 E / 削除 D / 共有 S]、"-" は拒否
const EXPECTED: Record<string, Record<string, string>> = {
  //        デザイン案  要件定義書  納品物      買収計画    取締役会議事録
  alice: { design: "VEDS", spec: "VEDS", handover: "VEDS", plan: "VEDS", minutes: "VEDS" },
  bob:   { design: "VEDS", spec: "VEDS", handover: "VEDS", plan: "VEDS", minutes: "----" },
  carol: { design: "VEDS", spec: "VEDS", handover: "VEDS", plan: "V---", minutes: "----" },
  dave:  { design: "VE--", spec: "VEDS", handover: "VE--", plan: "----", minutes: "----" },
  erin:  { design: "----", spec: "----", handover: "V---", plan: "----", minutes: "----" },
};
const LETTERS = ["V", "E", "D", "S"] as const;

function toCodeMatrix(matrix: Awaited<ReturnType<Authz["checkAll"]>>["matrix"]) {
  const out: Record<string, Record<string, string>> = {};
  for (const u of USERS) {
    out[u.id] = {};
    for (const f of FILES) {
      const cells = matrix[u.id][f.id];
      out[u.id][f.id] = ["can_view", "can_edit", "can_delete", "can_share"]
        .map((a, i) => (cells[a] ? LETTERS[i] : "-"))
        .join("");
    }
  }
  return out;
}

const apiUrl = process.env.FGA_API_URL ?? "http://localhost:8080";

describe("OpenFGA による 100 パターン判定", () => {
  let authz: Authz;

  beforeAll(async () => {
    authz = await createAuthz({ apiUrl, storeName: `test-${Date.now()}` });
  });

  it("初期状態の権限表が仕様どおり（許可58 / 拒否42）", async () => {
    const result = await authz.checkAll();
    expect(toCodeMatrix(result.matrix)).toEqual(EXPECTED);
    expect(result.allowedCount).toBe(58);
    expect(result.total).toBe(100);
  });

  it("What-if: Erin を組織メンバーに追加すると、全社公開の Web プロジェクトが見えるようになる", async () => {
    await authz.setWhatIf("erin-joins", true);
    const m = toCodeMatrix((await authz.checkAll()).matrix);
    expect(m.erin).toEqual({ design: "V---", spec: "V---", handover: "V---", plan: "----", minutes: "----" });
    await authz.setWhatIf("erin-joins", false);
    expect(toCodeMatrix((await authz.checkAll()).matrix)).toEqual(EXPECTED);
  });

  it("What-if: Carol を組織管理者に昇格すると、全プロジェクトのマネージャー権限を継承する", async () => {
    await authz.setWhatIf("carol-admin", true);
    const m = toCodeMatrix((await authz.checkAll()).matrix);
    expect(m.carol).toEqual({ design: "VEDS", spec: "VEDS", handover: "VEDS", plan: "VEDS", minutes: "VEDS" });
    await authz.setWhatIf("carol-admin", false);
  });

  it("What-if: Alice を議事録の閲覧禁止にすると、組織オーナーでも拒否される（but not）", async () => {
    await authz.setWhatIf("alice-restricted", true);
    const m = toCodeMatrix((await authz.checkAll()).matrix);
    expect(m.alice.minutes).toBe("----");
    await authz.setWhatIf("alice-restricted", false);
  });

  it("存在しない What-if はエラー", async () => {
    await expect(authz.setWhatIf("nope", true)).rejects.toThrow(/unknown what-if/);
  });

  it("ListObjects: Dave が閲覧できるファイル一覧を逆引きできる", async () => {
    const files = await authz.listViewableFiles("dave");
    expect(files.sort()).toEqual(["design", "handover", "spec"]);
  });
});
