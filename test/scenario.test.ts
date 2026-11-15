import { describe, expect, it } from "vitest";
import { ACTIONS, BASE_TUPLES, SHARE_GRANT, shareExpiresAt, shareGrantFor, FILES, USERS, WHAT_IFS, buildCheckItems, toCorrelationId, fromCorrelationId } from "../src/scenario.js";

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

  it("判定時刻を condition のコンテキスト current_time として各リクエストに渡す", () => {
    const at = new Date("2026-11-15T12:00:00Z");
    const items = buildCheckItems(at);
    expect(items.every((i) => (i.context as { current_time?: string })?.current_time === "2026-11-15T12:00:00.000Z")).toBe(true);
  });

  it("Erin への共有タプルには期限付き共有の condition が付いている", () => {
    const share = BASE_TUPLES.find((t) => t.user === "user:erin" && t.object === "file:handover");
    expect(share?.condition).toEqual({ name: "non_expired_grant", context: SHARE_GRANT });
  });

  it("期限付き共有は「基準日の14日前 0時(UTC)から30日間」なので、いつ起動しても期限内から始まる", () => {
    const grant = shareGrantFor(new Date("2026-11-15T10:30:00Z"));
    expect(grant).toEqual({ grant_time: "2026-11-01T00:00:00.000Z", grant_duration: "720h" });
    expect(shareExpiresAt(grant).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("不正な日時は判定コンテキストにできない", () => {
    expect(() => buildCheckItems(new Date("invalid"))).toThrow(/invalid date/);
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
