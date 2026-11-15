import type { ClientBatchCheckItem, TupleKey } from "@openfga/sdk";

export type Action = "can_view" | "can_edit" | "can_delete" | "can_share";

export const USERS = [
  { id: "alice", name: "Alice", role: "組織オーナー" },
  { id: "bob", name: "Bob", role: "組織管理者" },
  { id: "carol", name: "Carol", role: "メンバー / Webのマネージャー" },
  { id: "dave", name: "Dave", role: "メンバー / Webの編集者" },
  { id: "erin", name: "Erin", role: "外部委託（組織外）" },
] as const;

export const PROJECTS = [
  { id: "web", name: "Webリニューアル", note: "全社公開" },
  { id: "secret", name: "M&A（極秘）", note: "非公開" },
] as const;

export const FILES = [
  { id: "design", name: "デザイン案.fig", project: "web" },
  { id: "spec", name: "要件定義書.pdf", project: "web" },
  { id: "handover", name: "納品物.zip", project: "web" },
  { id: "plan", name: "買収計画.xlsx", project: "secret" },
  { id: "minutes", name: "取締役会議事録.docx", project: "secret" },
] as const;

export const ACTIONS: readonly { relation: Action; label: string }[] = [
  { relation: "can_view", label: "閲覧" },
  { relation: "can_edit", label: "編集" },
  { relation: "can_delete", label: "削除" },
  { relation: "can_share", label: "共有" },
];

export type Tuple = TupleKey & { note: string };

/** 初期状態の関係データ（＝誰がどこに所属し、何を共有されているか） */
export const BASE_TUPLES: readonly Tuple[] = [
  { user: "user:alice", relation: "owner", object: "organization:acme", note: "Alice は組織オーナー" },
  { user: "user:bob", relation: "admin", object: "organization:acme", note: "Bob は組織管理者" },
  { user: "user:carol", relation: "member", object: "organization:acme", note: "Carol は組織メンバー" },
  { user: "user:dave", relation: "member", object: "organization:acme", note: "Dave は組織メンバー" },
  { user: "organization:acme", relation: "organization", object: "project:web", note: "Web は ACME のプロジェクト" },
  { user: "organization:acme", relation: "organization", object: "project:secret", note: "M&A は ACME のプロジェクト" },
  { user: "organization:acme#member", relation: "viewer", object: "project:web", note: "Web は全社員が閲覧可" },
  { user: "user:carol", relation: "manager", object: "project:web", note: "Carol は Web のマネージャー" },
  { user: "user:dave", relation: "editor", object: "project:web", note: "Dave は Web の編集者" },
  ...FILES.map((f) => ({
    user: `project:${f.project}`,
    relation: "project",
    object: `file:${f.id}`,
    note: `${f.name} は ${f.project} 配下`,
  })),
  { user: "user:dave", relation: "owner", object: "file:spec", note: "Dave は要件定義書の作成者" },
  { user: "user:erin", relation: "viewer", object: "file:handover", note: "Erin に納品物だけ個別共有" },
  { user: "user:bob", relation: "owner", object: "file:plan", note: "Bob は買収計画の作成者" },
  { user: "user:carol", relation: "viewer", object: "file:plan", note: "Carol に買収計画を個別共有" },
  { user: "user:bob", relation: "restricted", object: "file:minutes", note: "Bob は議事録を閲覧禁止（利益相反）" },
];

/** UI から ON/OFF できる「もしも」の関係変更 */
export const WHAT_IFS: readonly { id: string; label: string; tuple: TupleKey }[] = [
  { id: "erin-joins", label: "Erin が組織に入社する", tuple: { user: "user:erin", relation: "member", object: "organization:acme" } },
  { id: "carol-admin", label: "Carol を組織管理者に昇格", tuple: { user: "user:carol", relation: "admin", object: "organization:acme" } },
  { id: "dave-secret", label: "Dave を M&A の閲覧者に追加", tuple: { user: "user:dave", relation: "viewer", object: "project:secret" } },
  { id: "alice-restricted", label: "Alice を議事録の閲覧禁止に", tuple: { user: "user:alice", relation: "restricted", object: "file:minutes" } },
];

const SEP = "__";

export function toCorrelationId(user: string, file: string, action: string): string {
  return [user, file, action].join(SEP);
}

export function fromCorrelationId(id: string): { user: string; file: string; action: string } {
  const parts = id.split(SEP);
  if (parts.length !== 3) throw new Error(`invalid correlationId: ${id}`);
  const [user, file, action] = parts;
  return { user, file, action };
}

/** 5人 × 5ファイル × 4操作 = 100 件の Check リクエスト */
export function buildCheckItems(): ClientBatchCheckItem[] {
  return USERS.flatMap((u) =>
    FILES.flatMap((f) =>
      ACTIONS.map((a) => ({
        user: `user:${u.id}`,
        relation: a.relation,
        object: `file:${f.id}`,
        correlationId: toCorrelationId(u.id, f.id, a.relation),
      })),
    ),
  );
}
