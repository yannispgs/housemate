/**
 * Fait tourner sous Node des modules de l'app (`src/`), écrits pour Next et
 * Vitest : l'alias `@/` de tsconfig.json, et des imports sans extension.
 * Node retire lui-même les types ; seule la résolution lui manque.
 *
 *   node --import ./scripts/alias.mjs scripts/remplir-preview.ts
 */
import { registerHooks } from "node:module";

const SRC = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const cible = specifier.startsWith("@/")
      ? new URL(specifier.slice(2), SRC).href
      : specifier;

    try {
      return nextResolve(cible, context);
    } catch (erreur) {
      // Un paquet (`zod`, `postgres`) se résout tel quel, ou pas du tout.
      if (!/^(\.|\/|file:)/.test(cible)) {
        throw erreur;
      }

      for (const suffixe of [".ts", "/index.ts"]) {
        try {
          return nextResolve(cible + suffixe, context);
        } catch {
          // Suffixe suivant.
        }
      }

      throw erreur;
    }
  },
});
