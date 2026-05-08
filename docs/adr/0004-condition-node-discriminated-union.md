# ADR-0004: ConditionNode の discriminated union 表現

**Status**: Accepted
**Date**: 2026-05-08

## Context

Backend (alpha-forge) の戦略定義で使われる「条件ノード」は、JSON 上で以下の 2 形態を取る:

1. **論理結合ノード** — `{ type: "AND" | "OR", conditions: [...] }`
2. **リーフノード** — `{ type: <operator>, left?, right? }`（operator は `">"` / `"CROSS_OVER"` / `"sma_cross"` 等の動的文字列）

PR #128 (Issue #112) でフロントの TS 型を discriminated union に昇格させた:

```typescript
type LogicalOperator = 'AND' | 'OR'
interface LogicalConditionNode { type: LogicalOperator; conditions: ConditionNode[] }
interface LeafConditionNode { type: string; left?; right? }
type ConditionNode = LogicalConditionNode | LeafConditionNode
```

しかし `LeafConditionNode.type: string` は文字列型の super type として `'AND' | 'OR'` も受理してしまう。TS の構造的型システムでは、リテラルユニオンを除外する `Exclude<string, 'AND' | 'OR'>` は **`string` のまま** に評価されてしまうため、真の判別は実現できない。

## Decision

**現状の `isLogicalConditionNode` 型ガードベースの narrowing を採用する**。

```typescript
export function isLogicalConditionNode(node: ConditionNode): node is LogicalConditionNode {
  return node.type === 'AND' || node.type === 'OR'
}
```

合わせて以下を契約として明記:

### Backend (alpha-forge) 側の保証

- 戦略 JSON の `entry_conditions` / `exit_conditions` に登場する `type` は:
  - 論理結合の場合: 大文字の `"AND"` または `"OR"`
  - リーフの場合: それ以外（operator 名・関数名・小文字 / 記号）
- alpha-forge の戦略バリデータがこの規約を担保する（現実コードでの実態確認済）

### Frontend 側の規約

- `ConditionNode` を扱うコードは **必ず `isLogicalConditionNode` を経由して narrowing** する
- `LeafConditionNode.type` を `string` のままにすることで、新規 operator (`"GT"` / `"BB_TOUCH"` 等) の追加に追従できる柔軟性を保つ

## なぜ「真の discriminated union」を採用しないか

候補となる手法とその欠点:

### 案 A: `kind` フィールドを追加して discriminator にする

```typescript
type ConditionNode =
  | { kind: 'logical'; type: 'AND' | 'OR'; conditions: ConditionNode[] }
  | { kind: 'leaf'; type: string; left?: string; right?: ... }
```

**欠点**: backend JSON のスキーマを変える必要がある。alpha-forge / 戦略 JSON ファイル群も全て移行が必要で、影響範囲が大きい。

### 案 B: TypeScript template literal types で operator を限定

```typescript
type LeafType = '>' | '<' | '==' | 'CROSS_OVER' | 'sma_cross' | ... // 既知の operator のみ
```

**欠点**: 新規 operator を alpha-forge 側で追加するたびに TS 型を更新する必要がある。動的拡張性を犠牲にする。

### 案 C: `string & { __brand: 'leaf' }` 等の branded types

**欠点**: ランタイム保証が無く、結局型ガードを書く必要がある。複雑度だけが上がる。

### 結論

**型ガード経由が最もシンプルかつ実用的**。runtime の不変条件は backend 契約と型ガードの 2 層で守る。

## Consequences

### メリット

- backend スキーマ変更不要
- 新規 operator 追加に追従できる柔軟性
- `isLogicalConditionNode` 経由で narrowing は正しく動作

### コスト

- TS 型システム単体では `LeafConditionNode.type` が `'AND' | 'OR'` を含み得る
- 開発者は `if (isLogicalConditionNode(node))` を書く必要がある（直接 `node.type === 'AND'` で narrow しない規約）

### モニタリング

- backend 契約違反（リーフに AND/OR が混入）は `services` 層の早期検証や lint で検出するのが望ましい（今後の検討事項）
