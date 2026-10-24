/**
 * `seed` s'enrichit des previews fusionnées (décision du foyer, 2026-09-27 ;
 * SPEC § 15) : ce qu'on a saisi en essayant une PR rejoint `seed`, donc toutes
 * les previews suivantes. Ajouts seulement : rien n'est écrasé ni supprimé.
 *
 * ⚠️ Le jeu fictif n'est PAS recopié : chaque preview le pose elle-même, daté
 * du jour de sa création (`scripts/remplir-preview.ts`). Recopié, il
 * s'accumulerait d'une fusion à l'autre et vieillirait. La preview note ses
 * lignes dans `preview_meta.jeu_fictif` ; elles sont écartées, avec tout ce
 * qui s'y rattache (une complétion d'une échéance fictive, une pièce jointe
 * d'une fiche fictive).
 *
 * Calculé sans base : `scripts/enrichir-seed.ts` lit les bases et applique.
 */

/** Une colonne qui pointe vers l'`id` d'une table. */
export interface Reference {
  readonly column: string;
  readonly table: string;
}

export type Row = Readonly<Record<string, unknown>>;

export interface TableSnapshot {
  readonly name: string;
  readonly references: readonly Reference[];
  readonly rows: readonly Row[];
}

export interface TableWrites {
  readonly name: string;
  /** Dans l'ordre d'insertion : une ligne après celle qu'elle vise. */
  readonly rows: readonly Row[];
}

/** Les identifiants par table, ex. les lignes du jeu fictif. */
export type IdsByTable = ReadonlyMap<string, ReadonlySet<string>>;

/** La clé d'un identifiant : une chaîne telle quelle, le reste en JSON. */
const cle = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

/** Ce qui est apparu entre deux relevés d'identifiants. */
export function newIds(before: IdsByTable, after: IdsByTable): IdsByTable {
  const added = new Map<string, Set<string>>();

  for (const [table, ids] of after) {
    const known = before.get(table) ?? new Set<string>();
    const fresh = new Set([...ids].filter(id => !known.has(id)));

    if (fresh.size > 0) {
      added.set(table, fresh);
    }
  }

  return added;
}

/** Les tables dans un ordre où chacune vient après celles qu'elle vise. */
function insertionOrder(tables: readonly TableSnapshot[]): TableSnapshot[] {
  const byName = new Map(tables.map(t => [t.name, t]));
  const ordered: TableSnapshot[] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (table: TableSnapshot) => {
    if (state.get(table.name) === "done") {
      return;
    }

    if (state.get(table.name) === "visiting") {
      throw new Error(`Références circulaires autour de « ${table.name} ».`);
    }

    state.set(table.name, "visiting");

    for (const ref of table.references) {
      const target = byName.get(ref.table);

      if (target !== undefined && target !== table) {
        visit(target);
      }
    }

    state.set(table.name, "done");
    ordered.push(table);
  };

  for (const table of tables) {
    visit(table);
  }

  return ordered;
}

/** Une ligne après celle de la même table qu'elle vise (une correction). */
function selfOrder(rows: readonly Row[], selfRefs: readonly Reference[]) {
  if (selfRefs.length === 0) {
    return rows;
  }

  const byId = new Map(rows.map(r => [cle(r.id), r]));
  const placed = new Set<Row>();
  const ordered: Row[] = [];

  const place = (row: Row) => {
    if (placed.has(row)) {
      return;
    }

    placed.add(row);

    for (const ref of selfRefs) {
      const target = byId.get(cle(row[ref.column]));

      if (target !== undefined) {
        place(target);
      }
    }

    ordered.push(row);
  };

  rows.forEach(place);

  return ordered;
}

export function planSeedMerge(
  tables: readonly TableSnapshot[],
  fictifs: IdsByTable,
): TableWrites[] {
  const excluded = new Map<string, Set<string>>(
    [...fictifs].map(([table, ids]) => [table, new Set(ids)]),
  );
  const isExcluded = (table: string, value: unknown) =>
    value !== null &&
    value !== undefined &&
    (excluded.get(table)?.has(cle(value)) ?? false);

  return insertionOrder(tables).map(table => {
    const own = excluded.get(table.name) ?? new Set<string>();
    excluded.set(table.name, own);
    let kept = [...table.rows];
    let size = -1;

    // Jusqu'au point fixe : écarter une ligne peut en écarter une autre de
    // la même table (la correction d'une complétion écartée).
    while (kept.length !== size) {
      size = kept.length;
      kept = kept.filter(row => {
        const out =
          isExcluded(table.name, row.id) ||
          table.references.some(ref => isExcluded(ref.table, row[ref.column]));

        if (out && row.id !== undefined) {
          own.add(cle(row.id));
        }

        return !out;
      });
    }

    return {
      name: table.name,
      rows: selfOrder(
        kept,
        table.references.filter(ref => ref.table === table.name),
      ),
    };
  });
}
