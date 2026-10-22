/**
 * L'archive déposée (SPEC § 14.1, § 14.5, décisions du foyer du
 * 2026-10-22) : `export.json` et `export.md` dans un `tar`, compressé en
 * gzip — sans perte, lisible partout — puis chiffré par `age` vers la clé
 * publique du foyer. Compresser d'abord : un fichier chiffré ne se compresse
 * plus. L'app n'a que la clé publique ; elle peut chiffrer, jamais relire.
 */
import { gzipSync } from "node:zlib";
import { Encrypter } from "age-encryption";
import { createTar } from "nanotar";

/** L'en-tête de tout fichier `age` binaire (age-encryption.org/v1). */
const EN_TETE_AGE = new TextEncoder().encode("age-encryption.org/v1\n");

export function archiver(json: string, markdown: string, le: Date): Uint8Array {
  const attrs = { mtime: le.getTime(), mode: "644" };

  return gzipSync(
    createTar([
      { name: "export.json", data: json, attrs },
      { name: "export.md", data: markdown, attrs },
    ]),
  );
}

export async function chiffrer(
  contenu: Uint8Array,
  clePublique: string,
): Promise<Uint8Array> {
  const e = new Encrypter();
  e.addRecipient(clePublique);

  return e.encrypt(contenu);
}

/**
 * La vérification que la machine peut faire seule (§ 14.5) : le fichier
 * déposé est bien un fichier `age`. Le déchiffrer demande la clé privée,
 * que seul le foyer détient.
 */
export function estChiffreAge(contenu: Uint8Array): boolean {
  return (
    contenu.length > EN_TETE_AGE.length &&
    EN_TETE_AGE.every((octet, i) => contenu[i] === octet)
  );
}
