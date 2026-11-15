import { describe, expect, it } from "vitest";
import { ACTIONS, FILES, USERS, WHAT_IFS, buildCheckItems, toCorrelationId, fromCorrelationId } from "../src/scenario.js";

describe("シナリオ定義", () => {
  it("メンバー5人 × ファイル5件 × 操作4種 = 100パターンの判定リクエストを作る", () => {
    const items = buildCheckItems();
    expect(items).toHaveLength(100);
    const keys = new Set(items.map((i) => `${i.user}|${i.relation}|${i.object}`));
    expect(keys.size).toBe(100);
  });

  it("各リクエストは OpenFGA の user/relation/object 形式になっている", () => {
    const [first] = buildCheckItems();
    expect(first).toMatchObject({
      user: `user:${USERS[0].id}`,
      relation: ACTIONS[0].relation,
      object: `file:${FILES[0].id}`,
    });
  });

  it("correlationId から (user, file, action) に戻せる", () => {
    const id = toCorrelationId("carol", "plan", "can_edit");
    expect(fromCorrelationId(id)).toEqual({ user: "carol", file: "plan", action: "can_edit" });
  });

  it("不正な correlationId はエラーにする", () => {
    expect(() => fromCorrelationId("broken")).toThrow();
  });

  it("What-if の id は一意", () => {
    const ids = WHAT_IFS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
