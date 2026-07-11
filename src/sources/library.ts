import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Reference } from "./references.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/sources/library.js -> ../../data/references.json (repo-root data/, one level above dist/)
const DEFAULT_REGISTER_PATH = path.resolve(__dirname, "../../data/references.json");
const BANK_ID = "soapbox-costing";

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;

export interface LibraryOpts {
  fetchImpl?: FetchLike;
  hindsightUrl?: string;
  hindsightToken?: string;
  /** Overrides where the register is read/written — tests must pass a temp path so the
   * committed data/references.json is never mutated by a test run. */
  registerPath?: string;
}

export interface AddReferenceResult {
  registered: boolean;
  bank_synced: boolean;
  note?: string;
}

export interface RecallResult {
  results: unknown[];
  bank_synced: boolean;
  note?: string;
}

function readRegister(registerPath: string): { references: Reference[] } {
  let raw: string;
  try {
    raw = readFileSync(registerPath, "utf-8");
  } catch {
    return { references: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { references: [] };
  }
  const data = parsed as Partial<{ references: Reference[] }>;
  if (!data || !Array.isArray(data.references)) return { references: [] };
  return { references: data.references };
}

function writeRegister(registerPath: string, data: { references: Reference[] }): void {
  writeFileSync(registerPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function resolveHindsight(opts: LibraryOpts): { url?: string; token?: string } {
  return {
    url: opts.hindsightUrl ?? process.env.HINDSIGHT_URL,
    token: opts.hindsightToken ?? process.env.HINDSIGHT_TOKEN,
  };
}

/**
 * Appends `ref` to the local references.json register (replacing any existing entry
 * with the same id) AND retains it into the hindsight `soapbox-costing` bank, tagged
 * `costing`, `reference`, and the ref's `system_type`, so the growing reference
 * library survives beyond this service's filesystem.
 *
 * Degrades gracefully by design: if HINDSIGHT_URL/HINDSIGHT_TOKEN are unset, the
 * retain HTTP call fails, or it returns a non-ok status, the register is still
 * updated and this returns `{ registered: true, bank_synced: false, note }` —
 * it never throws for a bank-sync problem. Actual hindsight wiring/verification
 * is a follow-on task; this client only needs to behave sensibly against the
 * documented REST shape.
 */
export async function addReference(ref: Reference, opts: LibraryOpts = {}): Promise<AddReferenceResult> {
  const registerPath = opts.registerPath ?? DEFAULT_REGISTER_PATH;
  const register = readRegister(registerPath);
  const withoutExisting = register.references.filter((r) => r.id !== ref.id);
  writeRegister(registerPath, { references: [...withoutExisting, ref] });

  const { url, token } = resolveHindsight(opts);
  if (!url || !token) {
    return {
      registered: true,
      bank_synced: false,
      note: "HINDSIGHT_URL/HINDSIGHT_TOKEN not set — register updated locally; bank sync skipped.",
    };
  }

  const f = opts.fetchImpl ?? (fetch as FetchLike);
  const tags = ["costing", "reference", ref.system_type];
  try {
    const res = await f(`${url.replace(/\/$/, "")}/v1/default/banks/${BANK_ID}/memories`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{
          content: JSON.stringify(ref),
          tags,
          context: `costing reference: ${ref.citation}`,
        }],
      }),
    });
    if (!res.ok) {
      return {
        registered: true,
        bank_synced: false,
        note: `Register updated locally; hindsight retain returned HTTP ${res.status ?? "error"} — bank sync skipped.`,
      };
    }
    return { registered: true, bank_synced: true };
  } catch (e) {
    return {
      registered: true,
      bank_synced: false,
      note: `Register updated locally; hindsight retain failed (${(e as Error).message}) — bank sync skipped.`,
    };
  }
}

/**
 * Recalls references from the hindsight `soapbox-costing` bank by free-text query.
 * Degrades the same way as addReference: no configuration or a failed call returns
 * an empty, clearly-noted result rather than throwing.
 */
export async function recallReferences(query: string, opts: LibraryOpts = {}): Promise<RecallResult> {
  const { url, token } = resolveHindsight(opts);
  if (!url || !token) {
    return { results: [], bank_synced: false, note: "HINDSIGHT_URL/HINDSIGHT_TOKEN not set — bank recall skipped." };
  }

  const f = opts.fetchImpl ?? (fetch as FetchLike);
  try {
    const res = await f(`${url.replace(/\/$/, "")}/v1/default/banks/${BANK_ID}/memories/recall`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      return { results: [], bank_synced: false, note: `hindsight recall returned HTTP ${res.status ?? "error"}.` };
    }
    const json: any = await res.json();
    return { results: Array.isArray(json?.results) ? json.results : [], bank_synced: true };
  } catch (e) {
    return { results: [], bank_synced: false, note: `hindsight recall failed (${(e as Error).message}).` };
  }
}
