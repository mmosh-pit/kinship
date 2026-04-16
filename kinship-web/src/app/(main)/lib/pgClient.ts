import { Pool } from "pg";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────
// ObjectId compatibility shim
// ─────────────────────────────────────────────
export class ObjectId {
  private _id: string;
  constructor(id?: string) {
    this._id = id || randomUUID();
  }
  toString() {
    return this._id;
  }
  toHexString() {
    return this._id;
  }
  equals(other: ObjectId) {
    return this._id === other._id;
  }
}

// ─────────────────────────────────────────────
// Connection pool
// ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URI,
});

// ─────────────────────────────────────────────
// Table lifecycle helpers
// ─────────────────────────────────────────────
const tableCache = new Set<string>();

async function ensureTable(tableName: string): Promise<void> {
  if (tableCache.has(tableName)) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "${tableName}_data_gin"
    ON ${tableName} USING GIN (data)
  `);
  tableCache.add(tableName);
}

function collectionNameToTable(name: string): string {
  // mmosh-app-users  →  pg_mmosh_app_users
  return (
    "pg_" +
    name
      .replace(/-/g, "_")
      .replace(/[^a-z0-9_]/gi, "_")
      .toLowerCase()
  );
}

// ─────────────────────────────────────────────
// Serialise a value for comparison
// ─────────────────────────────────────────────
function ser(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof ObjectId) return v.toString();
  if (v && typeof v === "object" && v.constructor?.name === "ObjectId")
    return v.toString();
  return String(v);
}

// ─────────────────────────────────────────────
// JSONB path builder  (dot-notation → SQL)
// ─────────────────────────────────────────────
function jsonPath(key: string): string {
  const parts = key.split(".");
  if (parts.length === 1) return `data->>'${key}'`;
  const mid = parts
    .slice(0, -1)
    .map((p) => `->'${p}'`)
    .join("");
  return `data${mid}->>'${parts[parts.length - 1]}'`;
}

function jsonPathRaw(key: string): string {
  return (
    "data->" +
    key
      .split(".")
      .map((p) => `'${p}'`)
      .join("->")
  );
}

// ─────────────────────────────────────────────
// WHERE clause builder
// ─────────────────────────────────────────────
function buildWhere(
  filter: any,
  ctx: { values: any[]; n: number } = { values: [], n: 1 },
): string {
  if (!filter || Object.keys(filter).length === 0) return "TRUE";

  const parts: string[] = [];

  for (const [key, value] of Object.entries(filter as Record<string, any>)) {
    // ── logical operators ───────────────────────────────────
    if (key === "$or") {
      const branches = (value as any[]).map((f) => buildWhere(f, ctx));
      parts.push(`(${branches.join(" OR ")})`);
      continue;
    }
    if (key === "$and") {
      const branches = (value as any[]).map((f) => buildWhere(f, ctx));
      parts.push(`(${branches.join(" AND ")})`);
      continue;
    }

    // ── _id maps to the id column ───────────────────────────
    if (key === "_id") {
      const idStr =
        value instanceof ObjectId ||
          (value &&
            typeof value === "object" &&
            value.constructor?.name === "ObjectId")
          ? value.toString()
          : String(value);
      ctx.values.push(idStr);
      parts.push(`id = $${ctx.n++}::uuid`);
      continue;
    }

    const field = jsonPath(key);

    // ── operator object ─────────────────────────────────────
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof ObjectId) &&
      !(value instanceof RegExp) &&
      value.constructor?.name !== "ObjectId" &&
      Object.keys(value).some((k) => k.startsWith("$"))
    ) {
      const ops = value as Record<string, any>;
      let regexOptions = ops["$options"] || "";

      for (const [op, opVal] of Object.entries(ops)) {
        switch (op) {
          case "$eq":
            if (opVal === null) {
              parts.push(`${field} IS NULL`);
            } else {
              ctx.values.push(ser(opVal));
              parts.push(`${field} = $${ctx.n++}`);
            }
            break;

          case "$ne":
            ctx.values.push(ser(opVal));
            parts.push(`(${field} IS NULL OR ${field} != $${ctx.n++})`);
            break;

          case "$gt":
            if (opVal instanceof Date) {
              ctx.values.push(opVal.toISOString());
              parts.push(`(${field})::timestamptz > $${ctx.n++}`);
            } else {
              ctx.values.push(Number(opVal));
              parts.push(`(${field})::numeric > $${ctx.n++}`);
            }
            break;

          case "$gte":
            if (opVal instanceof Date) {
              ctx.values.push(opVal.toISOString());
              parts.push(`(${field})::timestamptz >= $${ctx.n++}`);
            } else {
              ctx.values.push(Number(opVal));
              parts.push(`(${field})::numeric >= $${ctx.n++}`);
            }
            break;

          case "$lt":
            if (opVal instanceof Date) {
              ctx.values.push(opVal.toISOString());
              parts.push(`(${field})::timestamptz < $${ctx.n++}`);
            } else {
              ctx.values.push(Number(opVal));
              parts.push(`(${field})::numeric < $${ctx.n++}`);
            }
            break;

          case "$lte":
            if (opVal instanceof Date) {
              ctx.values.push(opVal.toISOString());
              parts.push(`(${field})::timestamptz <= $${ctx.n++}`);
            } else {
              ctx.values.push(Number(opVal));
              parts.push(`(${field})::numeric <= $${ctx.n++}`);
            }
            break;

          case "$in": {
            const inVals = (opVal as any[]).map((v) =>
              v instanceof RegExp ? v.source : ser(v),
            );
            ctx.values.push(inVals);
            parts.push(`${field} = ANY($${ctx.n++}::text[])`);
            break;
          }

          case "$nin": {
            const ninVals = (opVal as any[]).map(ser);
            ctx.values.push(ninVals);
            parts.push(
              `(${field} IS NULL OR ${field} != ALL($${ctx.n++}::text[]))`,
            );
            break;
          }

          case "$exists":
            if (opVal) {
              parts.push(
                key.includes(".")
                  ? `${jsonPathRaw(key)} IS NOT NULL`
                  : `data ? '${key}'`,
              );
            } else {
              parts.push(
                key.includes(".")
                  ? `${jsonPathRaw(key)} IS NULL`
                  : `NOT (data ? '${key}')`,
              );
            }
            break;

          case "$regex": {
            const src = opVal instanceof RegExp ? opVal.source : String(opVal);
            ctx.values.push(src);
            parts.push(
              regexOptions.includes("i")
                ? `${field} ~* $${ctx.n++}`
                : `${field} ~ $${ctx.n++}`,
            );
            break;
          }

          case "$options":
            // captured above
            break;

          case "$not":
            // Negate the inner expression
            if (typeof opVal === "object") {
              const inner = buildWhere({ [key]: opVal }, ctx);
              parts.push(`NOT (${inner})`);
            }
            break;
        }
      }
      continue;
    }

    // ── simple equality ─────────────────────────────────────
    if (value === null || value === undefined) {
      parts.push(`${field} IS NULL`);
    } else if (value instanceof Date) {
      ctx.values.push(value.toISOString());
      parts.push(`(${field})::timestamptz = $${ctx.n++}`);
    } else if (
      value instanceof ObjectId ||
      (value &&
        typeof value === "object" &&
        value.constructor?.name === "ObjectId")
    ) {
      ctx.values.push(value.toString());
      parts.push(`${field} = $${ctx.n++}`);
    } else if (value instanceof RegExp) {
      ctx.values.push(value.source);
      parts.push(
        value.flags.includes("i")
          ? `${field} ~* $${ctx.n++}`
          : `${field} ~ $${ctx.n++}`,
      );
    } else if (typeof value === "number") {
      ctx.values.push(value);
      parts.push(`(${field})::numeric = $${ctx.n++}`);
    } else {
      ctx.values.push(String(value));
      parts.push(`${field} = $${ctx.n++}`);
    }
  }

  return parts.join(" AND ") || "TRUE";
}

// ─────────────────────────────────────────────
// Nested object helpers (for in-memory ops)
// ─────────────────────────────────────────────
function getNested(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setNested(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object")
      cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteNested(obj: any, path: string): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]];
    if (cur == null) return;
  }
  delete cur[parts[parts.length - 1]];
}

// ─────────────────────────────────────────────
// Apply MongoDB update operators to a document
// ─────────────────────────────────────────────
function applyUpdate(doc: any, update: any): any {
  const result = JSON.parse(JSON.stringify(doc)); // deep clone

  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) setNested(result, k, v);
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) deleteNested(result, k);
  }
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc as Record<string, number>))
      setNested(result, k, (Number(getNested(result, k)) || 0) + Number(v));
  }
  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push as Record<string, any>)) {
      const cur = getNested(result, k) || [];
      if (v && typeof v === "object" && "$each" in v) {
        cur.push(...(v as any).$each);
      } else {
        cur.push(v);
      }
      setNested(result, k, cur);
    }
  }
  if (update.$pull) {
    for (const [k, v] of Object.entries(update.$pull as Record<string, any>)) {
      const cur = getNested(result, k) || [];
      setNested(
        result,
        k,
        cur.filter((item: any) =>
          typeof v === "object"
            ? !Object.entries(v).every(([ek, ev]) => item[ek] === ev)
            : item !== v,
        ),
      );
    }
  }
  if (update.$addToSet) {
    for (const [k, v] of Object.entries(
      update.$addToSet as Record<string, any>,
    )) {
      const cur = getNested(result, k) || [];
      if (v && typeof v === "object" && "$each" in v) {
        for (const item of (v as any).$each)
          if (!cur.includes(item)) cur.push(item);
      } else {
        if (!cur.includes(v)) cur.push(v);
      }
      setNested(result, k, cur);
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Serialise a document for storage
// ─────────────────────────────────────────────
function toJson(doc: any): string {
  return JSON.stringify(doc, (_, v) =>
    v instanceof Date ? v.toISOString() : v,
  );
}

// Rehydrate a stored row into a Mongo-like document
function toDoc(row: { id: string; data: any } | undefined): any {
  if (!row) return null;
  const doc = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  if (!doc._id) doc._id = new ObjectId(row.id);
  return doc;
}

// ─────────────────────────────────────────────
// In-memory filter matching (used by aggregate)
// ─────────────────────────────────────────────
function matches(doc: any, filter: any): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, value] of Object.entries(filter as Record<string, any>)) {
    if (key === "$or") {
      if (!(value as any[]).some((f) => matches(doc, f))) return false;
      continue;
    }
    if (key === "$and") {
      if (!(value as any[]).every((f) => matches(doc, f))) return false;
      continue;
    }

    const docVal = getNested(doc, key);

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof RegExp) &&
      Object.keys(value).some((k) => k.startsWith("$"))
    ) {
      const ops = value as Record<string, any>;
      for (const [op, opVal] of Object.entries(ops)) {
        switch (op) {
          case "$eq":
            if (String(docVal) !== String(opVal)) return false;
            break;
          case "$ne":
            if (String(docVal) === String(opVal)) return false;
            break;
          case "$gt":
            if (opVal instanceof Date) {
              if (!docVal || new Date(docVal) <= opVal) return false;
            } else if (Number(docVal) <= Number(opVal)) return false;
            break;
          case "$gte":
            if (opVal instanceof Date) {
              if (!docVal || new Date(docVal) < opVal) return false;
            } else if (Number(docVal) < Number(opVal)) return false;
            break;
          case "$lt":
            if (opVal instanceof Date) {
              if (!docVal || new Date(docVal) >= opVal) return false;
            } else if (Number(docVal) >= Number(opVal)) return false;
            break;
          case "$lte":
            if (opVal instanceof Date) {
              if (!docVal || new Date(docVal) > opVal) return false;
            } else if (Number(docVal) > Number(opVal)) return false;
            break;
          case "$in": {
            const found = (opVal as any[]).some((v) => {
              if (v instanceof RegExp) return v.test(String(docVal));
              return String(docVal) === String(v);
            });
            if (!found) return false;
            break;
          }
          case "$nin":
            if ((opVal as any[]).some((v) => String(docVal) === String(v)))
              return false;
            break;
          case "$exists":
            if (opVal && (docVal === undefined || docVal === null))
              return false;
            if (!opVal && docVal !== undefined && docVal !== null) return false;
            break;
          case "$regex": {
            const src = opVal instanceof RegExp ? opVal.source : String(opVal);
            const flags =
              ops["$options"] || (opVal instanceof RegExp ? opVal.flags : "");
            if (!new RegExp(src, flags).test(String(docVal ?? "")))
              return false;
            break;
          }
          case "$options":
            break;
          case "$not":
            if (matches({ [key]: docVal }, { [key]: opVal })) return false;
            break;
        }
      }
      continue;
    }

    if (value instanceof RegExp) {
      if (!value.test(String(docVal ?? ""))) return false;
      continue;
    }

    if (value instanceof Date) {
      if (!docVal || new Date(docVal).getTime() !== value.getTime())
        return false;
      continue;
    }

    if (value === null) {
      if (docVal !== null && docVal !== undefined) return false;
      continue;
    }

    // simple equality
    if (String(docVal) !== String(value)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// FindCursor
// ─────────────────────────────────────────────
class FindCursor {
  private table: string;
  private filter: any;
  private _limit?: number;
  private _skip?: number;
  private _sort?: any;
  private _projection?: any;

  constructor(table: string, filter: any, options?: any) {
    this.table = table;
    this.filter = filter || {};
    if (options?.projection) this._projection = options.projection;
    if (options?.sort) this._sort = options.sort;
    if (options?.limit) this._limit = options.limit;
    if (options?.skip) this._skip = options.skip;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }
  skip(n: number) {
    this._skip = n;
    return this;
  }
  sort(s: any) {
    this._sort = s;
    return this;
  }
  project(p: any) {
    this._projection = p;
    return this;
  }
  collation(_opts: any) {
    // collation is a no-op – PostgreSQL's ~* already handles case-insensitive
    return this;
  }

  async toArray(): Promise<any[]> {
    await ensureTable(this.table);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(this.filter, ctx);

    let q = `SELECT id, data FROM ${this.table} WHERE ${where}`;

    if (this._sort) {
      const parts = Object.entries(this._sort).map(([k, v]) =>
        k === "_id"
          ? `id ${(v as number) === -1 ? "DESC" : "ASC"}`
          : `${jsonPath(k)} ${(v as number) === -1 ? "DESC" : "ASC"}`,
      );
      q += ` ORDER BY ${parts.join(", ")}`;
    }

    if (this._limit) q += ` LIMIT ${this._limit}`;
    if (this._skip) q += ` OFFSET ${this._skip}`;

    const res = await pool.query(q, ctx.values);
    return res.rows.map(toDoc);
  }
}

// ─────────────────────────────────────────────
// AggregateCursor  (in-memory pipeline)
// ─────────────────────────────────────────────
class AggregateCursor {
  private table: string;
  private pipeline: any[];
  private _limit?: number;
  private _skip?: number;

  constructor(table: string, pipeline: any[]) {
    this.table = table;
    this.pipeline = pipeline;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }
  skip(n: number) {
    this._skip = n;
    return this;
  }
  sort(s: any) {
    this.pipeline.push({ $sort: s });
    return this;
  }

  async toArray(): Promise<any[]> {
    await ensureTable(this.table);

    // Fetch initial dataset – optimise with first $match if present
    let docs: any[];
    const firstStage = this.pipeline[0];
    if (firstStage?.$match) {
      const ctx = { values: [] as any[], n: 1 };
      const where = buildWhere(firstStage.$match, ctx);
      const res = await pool.query(
        `SELECT id, data FROM ${this.table} WHERE ${where}`,
        ctx.values,
      );
      docs = res.rows.map(toDoc);
    } else {
      const res = await pool.query(`SELECT id, data FROM ${this.table}`);
      docs = res.rows.map(toDoc);
    }

    // Process pipeline stages
    for (const stage of this.pipeline) {
      const [op] = Object.keys(stage);

      switch (op) {
        case "$match":
          docs = docs.filter((d) => matches(d, stage.$match));
          break;

        case "$lookup": {
          const { from, localField, foreignField, as } = stage.$lookup;
          const tgt = collectionNameToTable(from);
          await ensureTable(tgt);

          for (const doc of docs) {
            const localVal = getNested(doc, localField);
            if (localVal == null) {
              doc[as] = [];
              continue;
            }
            const ctx = { values: [] as any[], n: 1 };
            const where = buildWhere({ [foreignField]: localVal }, ctx);
            const res = await pool.query(
              `SELECT id, data FROM ${tgt} WHERE ${where}`,
              ctx.values,
            );
            doc[as] = res.rows.map(toDoc);
          }
          break;
        }

        case "$unwind": {
          const raw = stage.$unwind;
          const path = typeof raw === "string" ? raw : raw.path;
          const field = path.startsWith("$") ? path.slice(1) : path;
          const preserve =
            typeof raw === "object" && raw.preserveNullAndEmptyArrays;
          const next: any[] = [];
          for (const doc of docs) {
            const arr = getNested(doc, field);
            if (!Array.isArray(arr) || arr.length === 0) {
              if (preserve) next.push(doc);
              continue;
            }
            for (const item of arr) {
              next.push({ ...doc, [field]: item });
            }
          }
          docs = next;
          break;
        }

        case "$group": {
          const { _id: groupBy, ...accDefs } = stage.$group;
          const groups = new Map<string, any>();

          for (const doc of docs) {
            const key = evalGroupId(doc, groupBy);
            const keyStr = JSON.stringify(key);
            if (!groups.has(keyStr)) {
              const init: any = { _id: key };
              for (const accKey of Object.keys(accDefs)) init[accKey] = null;
              groups.set(keyStr, init);
            }
            const g = groups.get(keyStr)!;

            for (const [accKey, accDef] of Object.entries(
              accDefs as Record<string, any>,
            )) {
              const [accOp, accArg] = Object.entries(accDef as object)[0];
              const val =
                typeof accArg === "string" && accArg.startsWith("$")
                  ? getNested(doc, accArg.slice(1))
                  : accArg;

              switch (accOp) {
                case "$sum":
                  g[accKey] = (g[accKey] ?? 0) + (Number(val) || 0);
                  break;
                case "$count":
                  g[accKey] = (g[accKey] ?? 0) + 1;
                  break;
                case "$push":
                  if (!Array.isArray(g[accKey])) g[accKey] = [];
                  g[accKey].push(val);
                  break;
                case "$first":
                  if (g[accKey] === null) g[accKey] = val;
                  break;
                case "$last":
                  g[accKey] = val;
                  break;
                case "$avg":
                  if (!g[`__sum_${accKey}`]) g[`__sum_${accKey}`] = 0;
                  if (!g[`__cnt_${accKey}`]) g[`__cnt_${accKey}`] = 0;
                  g[`__sum_${accKey}`] += Number(val) || 0;
                  g[`__cnt_${accKey}`]++;
                  g[accKey] = g[`__sum_${accKey}`] / g[`__cnt_${accKey}`];
                  break;
              }
            }
          }
          docs = Array.from(groups.values());
          break;
        }

        case "$project": {
          const proj = stage.$project;
          const hasInclusion = Object.values(proj).some(
            (v) =>
              v === 1 ||
              (typeof v === "string" && (v as string).startsWith("$")),
          );
          docs = docs.map((doc) => {
            const result: any = {};
            if (hasInclusion) {
              for (const [k, v] of Object.entries(
                proj as Record<string, any>,
              )) {
                if (v === 0) continue;
                if (v === 1) {
                  result[k] = k === "_id" ? doc._id : getNested(doc, k);
                } else if (
                  typeof v === "string" &&
                  (v as string).startsWith("$")
                ) {
                  result[k] = getNested(doc, (v as string).slice(1));
                } else {
                  result[k] = v;
                }
              }
            } else {
              Object.assign(result, doc);
              for (const [k, v] of Object.entries(
                proj as Record<string, any>,
              )) {
                if (v === 0) delete result[k];
              }
            }
            return result;
          });
          break;
        }

        case "$sort": {
          const s = stage.$sort;
          docs = [...docs].sort((a, b) => {
            for (const [k, dir] of Object.entries(s as Record<string, any>)) {
              let av = getNested(a, k);
              let bv = getNested(b, k);
              if (av == null && bv == null) continue;
              if (av == null) return dir === 1 ? -1 : 1;
              if (bv == null) return dir === 1 ? 1 : -1;
              if (av === bv) continue;
              const cmp =
                typeof av === "string"
                  ? av.localeCompare(bv)
                  : av < bv
                    ? -1
                    : 1;
              return (dir as number) === 1 ? cmp : -cmp;
            }
            return 0;
          });
          break;
        }

        case "$limit":
          docs = docs.slice(0, stage.$limit);
          break;

        case "$skip":
          docs = docs.slice(stage.$skip);
          break;

        case "$addFields": {
          const af = stage.$addFields;
          docs = docs.map((doc) => {
            const result = { ...doc };
            for (const [k, expr] of Object.entries(af as Record<string, any>)) {
              result[k] = evalExpr(doc, expr);
            }
            return result;
          });
          break;
        }
      }
    }

    if (this._skip) docs = docs.slice(this._skip);
    if (this._limit) docs = docs.slice(0, this._limit);

    return docs;
  }
}

function evalGroupId(doc: any, groupBy: any): any {
  if (groupBy === null) return null;
  if (typeof groupBy === "string" && groupBy.startsWith("$"))
    return getNested(doc, groupBy.slice(1));
  if (typeof groupBy === "object" && groupBy !== null) {
    const result: any = {};
    for (const [k, v] of Object.entries(groupBy as Record<string, any>)) {
      result[k] = evalExpr(doc, v);
    }
    return result;
  }
  return groupBy;
}

function evalExpr(doc: any, expr: any): any {
  if (typeof expr === "string" && expr.startsWith("$"))
    return getNested(doc, expr.slice(1));
  if (typeof expr !== "object" || expr === null) return expr;

  const [op, arg] = Object.entries(expr as Record<string, any>)[0];
  switch (op) {
    case "$year":
      return new Date(evalExpr(doc, arg)).getFullYear();
    case "$month":
      return new Date(evalExpr(doc, arg)).getMonth() + 1;
    case "$dayOfMonth":
      return new Date(evalExpr(doc, arg)).getDate();
    case "$sum":
      if (Array.isArray(arg))
        return arg.reduce(
          (acc: number, v: any) => acc + (Number(evalExpr(doc, v)) || 0),
          0,
        );
      return Number(evalExpr(doc, arg)) || 0;
    case "$toObjectId":
      return evalExpr(doc, arg);
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// Collection class
// ─────────────────────────────────────────────
class Collection {
  private name: string;

  constructor(name: string) {
    this.name = collectionNameToTable(name);
  }

  async findOne<T = any>(filter: any = {}, options?: any): Promise<T | null> {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `SELECT id, data FROM ${this.name} WHERE ${where} LIMIT 1`,
      ctx.values,
    );
    return toDoc(res.rows[0]);
  }

  find<T = any>(filter: any = {}, options?: any): FindCursor {
    // Eagerly schedule table creation
    ensureTable(this.name).catch(() => { });
    return new FindCursor(this.name, filter, options);
  }

  async insertOne(
    doc: any,
  ): Promise<{ insertedId: ObjectId; acknowledged: boolean }> {
    await ensureTable(this.name);
    const id = randomUUID();
    const data = { ...doc, _id: id };
    await pool.query(
      `INSERT INTO ${this.name} (id, data) VALUES ($1::uuid, $2::jsonb)`,
      [id, toJson(data)],
    );
    return { insertedId: new ObjectId(id), acknowledged: true };
  }

  async insertMany(docs: any[]): Promise<{
    insertedIds: Record<number, ObjectId>;
    insertedCount: number;
    acknowledged: boolean;
  }> {
    const ids: Record<number, ObjectId> = {};
    for (let i = 0; i < docs.length; i++) {
      const r = await this.insertOne(docs[i]);
      ids[i] = r.insertedId;
    }
    return { insertedIds: ids, insertedCount: docs.length, acknowledged: true };
  }

  async updateOne(filter: any, update: any, options?: any) {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `SELECT id, data FROM ${this.name} WHERE ${where} LIMIT 1`,
      ctx.values,
    );

    if (res.rows.length === 0) {
      if (options?.upsert) {
        const inserted = await this.insertOne({
          ...(update.$set || {}),
          ...(update.$setOnInsert || {}),
        });
        return {
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 1,
          upsertedId: inserted.insertedId,
          acknowledged: true,
        };
      }
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null,
        acknowledged: true,
      };
    }

    const row = res.rows[0];
    const newData = applyUpdate(row.data, update);
    await pool.query(
      `UPDATE ${this.name} SET data = $1::jsonb WHERE id = $2::uuid`,
      [toJson(newData), row.id],
    );
    return {
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
      acknowledged: true,
    };
  }

  async updateMany(filter: any, update: any, options?: any) {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `SELECT id, data FROM ${this.name} WHERE ${where}`,
      ctx.values,
    );

    let count = 0;
    for (const row of res.rows) {
      const newData = applyUpdate(row.data, update);
      await pool.query(
        `UPDATE ${this.name} SET data = $1::jsonb WHERE id = $2::uuid`,
        [toJson(newData), row.id],
      );
      count++;
    }
    return { matchedCount: count, modifiedCount: count, acknowledged: true };
  }

  async deleteOne(filter: any) {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `DELETE FROM ${this.name} WHERE id IN (
         SELECT id FROM ${this.name} WHERE ${where} LIMIT 1
       )`,
      ctx.values,
    );
    return { deletedCount: res.rowCount ?? 0, acknowledged: true };
  }

  async deleteMany(filter: any) {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `DELETE FROM ${this.name} WHERE ${where}`,
      ctx.values,
    );
    return { deletedCount: res.rowCount ?? 0, acknowledged: true };
  }

  async countDocuments(filter: any = {}): Promise<number> {
    await ensureTable(this.name);
    const ctx = { values: [] as any[], n: 1 };
    const where = buildWhere(filter, ctx);
    const res = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM ${this.name} WHERE ${where}`,
      ctx.values,
    );
    return res.rows[0]?.cnt ?? 0;
  }

  aggregate(pipeline: any[]): AggregateCursor {
    return new AggregateCursor(this.name, pipeline);
  }
}

// ─────────────────────────────────────────────
// Exported db object  (mirrors mongoClient API)
// ─────────────────────────────────────────────
export const db = {
  collection: (name: string) => new Collection(name),
};
