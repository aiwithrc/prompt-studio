import postgres from "postgres";

const globalForSql = globalThis as unknown as { __promptStudioSql?: postgres.Sql };

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => {} });
}

/** Created on first use, so importing this module (for example during `next build`) does not need a database. */
function instance(): postgres.Sql {
  if (!globalForSql.__promptStudioSql) globalForSql.__promptStudioSql = create();
  return globalForSql.__promptStudioSql;
}

/** Shared connection pool. Works as a tagged template, sql.json(), sql.begin() and sql(array). */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply(_target, thisArg, args) {
    return Reflect.apply(instance() as unknown as (...a: unknown[]) => unknown, thisArg, args);
  },
  get(_target, prop) {
    const i = instance() as unknown as Record<PropertyKey, unknown>;
    const v = i[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(i) : v;
  },
});

/** pgvector literal, e.g. [0.1,0.2] -> '[0.1,0.2]'. */
export function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
