/**
 * Le stockage des pièces jointes : Cloudflare R2, dans l'UE, buckets privés
 * (`housemate-prod`, `housemate-previews`). Jamais d'adresse publique (SPEC
 * § 7.1) : tout accès passe par un lien signé, court, produit par le serveur
 * après vérification des droits.
 *
 * Le fichier va directement du navigateur au stockage (décision du foyer,
 * 2026-10-14) : la limite de 4,5 Mo des fonctions Vercel ne s'applique pas.
 * D'où deux zones :
 * - `attente/` : ce que le navigateur envoie, par un lien qui fige la clé, le
 *   type et la taille. Effacé par le stockage au bout d'un jour (règle de
 *   cycle de vie du bucket) : un envoi jamais confirmé ne reste pas.
 * - `fiches/` : ce que le serveur a vérifié (taille, type, premiers octets)
 *   puis recopié. Seule cette zone est enregistrée en base.
 *
 * Les clés d'accès sont limitées à UN bucket (Object Read & Write) : une clé
 * de preview ne peut rien sur la prod.
 */
import { AwsClient } from "aws4fetch";

export interface R2Config {
  /** Adresse S3 du compte, juridiction UE : `https://<compte>.eu.r2…`. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export function r2Config(
  env: Readonly<Record<string, string | undefined>>,
): R2Config {
  const {
    R2_ENDPOINT: endpoint,
    R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;

  if (!endpoint?.startsWith("https://") || !bucket) {
    throw new Error("R2_ENDPOINT (HTTPS) et R2_BUCKET sont requis.");
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY sont requis pour les pièces jointes.",
    );
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

/* ------------------------------------------------------------------------ */
/* Fichiers acceptés                                                        */
/* ------------------------------------------------------------------------ */

/** 25 Mo : large pour une facture ou un contrat scanné de plusieurs pages. */
export const TAILLE_MAX = 25 * 1024 * 1024;

/**
 * 2 Go par foyer, envois en attente compris : un compte volé ou un script
 * fou ne peut pas remplir le stockage (10 Go gratuits pour tout le compte).
 */
export const QUOTA_FOYER = 2 * 1024 * 1024 * 1024;

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

export type TypeAccepte = keyof typeof EXTENSIONS;

export type Verification =
  | { readonly ok: true; readonly type: TypeAccepte }
  | { readonly ok: false; readonly erreur: string };

export function verifierFichier(fichier: {
  readonly type: string;
  readonly size: number;
}): Verification {
  if (!(fichier.type in EXTENSIONS)) {
    return {
      ok: false,
      erreur: "Seules les photos (JPEG, PNG, WebP) et les PDF sont acceptés.",
    };
  }

  if (!Number.isInteger(fichier.size) || fichier.size <= 0) {
    return { ok: false, erreur: "Le fichier est vide." };
  }

  if (fichier.size > TAILLE_MAX) {
    return { ok: false, erreur: "Le fichier dépasse 25 Mo." };
  }

  return { ok: true, type: fichier.type as TypeAccepte };
}

/** Les premiers octets attendus de chaque type (`null` : octet quelconque). */
const SIGNATURES: Record<TypeAccepte, readonly (number | null)[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // « RIFF », la taille sur 4 octets, puis « WEBP ».
  "image/webp": [
    0x52,
    0x49,
    0x46,
    0x46,
    null,
    null,
    null,
    null,
    0x57,
    0x45,
    0x42,
    0x50,
  ],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // « %PDF- »
};

/** Nombre d'octets à lire pour reconnaître n'importe quel type accepté. */
export const OCTETS_SIGNATURE = 12;

/**
 * Le contenu est-il bien du type annoncé ? Le type est déclaré par le
 * navigateur : un HTML ou un exécutable renommé en `.pdf` est refusé ici.
 */
export function signatureConforme(
  type: TypeAccepte,
  octets: Uint8Array,
): boolean {
  const attendue = SIGNATURES[type];

  return (
    octets.length >= attendue.length &&
    attendue.every((octet, i) => octet === null || octets[i] === octet)
  );
}

/* ------------------------------------------------------------------------ */
/* Clés                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * La clé d'un fichier vérifié : sous sa fiche, avec un identifiant aléatoire.
 * Jamais le nom d'origine, qui peut dire des choses (« facture-dupont-12-rue-… »).
 */
export function cleDe(ficheId: string, type: TypeAccepte, id: string): string {
  return `fiches/${ficheId}/${id}.${EXTENSIONS[type]}`;
}

export const ZONE_ATTENTE = "attente/";

/** La clé d'un envoi en attente de vérification. */
export function cleEnAttente(
  ficheId: string,
  type: TypeAccepte,
  id: string,
): string {
  return `${ZONE_ATTENTE}${cleDe(ficheId, type, id)}`;
}

const ATTENTE =
  /^attente\/fiches\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp|pdf)$/;

/**
 * Relit une clé en attente envoyée par le navigateur. Rend `null` si elle
 * n'a pas la forme exacte produite par `cleEnAttente`, ou si elle relève
 * d'une autre fiche : le navigateur ne peut désigner rien d'autre.
 */
export function lireCleEnAttente(
  cle: string,
  ficheId: string,
): { readonly type: TypeAccepte; readonly definitive: string } | null {
  const morceaux = ATTENTE.exec(cle);

  if (morceaux === null || morceaux[1] !== ficheId) {
    return null;
  }

  const type = (Object.keys(EXTENSIONS) as TypeAccepte[]).find(
    t => EXTENSIONS[t] === morceaux[3],
  ) as TypeAccepte;

  return { type, definitive: cle.slice(ZONE_ATTENTE.length) };
}

/* ------------------------------------------------------------------------ */
/* Accès                                                                    */
/* ------------------------------------------------------------------------ */

/** Durée de validité d'un lien, d'envoi comme de lecture. */
export const LIEN_SECONDES = 300;

export interface Stockage {
  /**
   * Un lien d'envoi signé pour UN fichier. Sa clé, son type, sa taille et
   * l'interdiction d'écraser (`if-none-match: *`) sont dans la signature
   * (mesuré le 2026-10-14 : autre taille ou autre type → 403, second envoi
   * → 412). Valable `LIEN_SECONDES`.
   */
  lienDEnvoi(cle: string, type: string, taille: number): Promise<string>;
  /** Ce que le stockage contient vraiment à cette clé, ou `null`. */
  decrire(cle: string): Promise<{ taille: number; type: string } | null>;
  /** Les `n` premiers octets de l'objet. */
  debut(cle: string, n: number): Promise<Uint8Array>;
  /** Copie côté stockage : rien ne transite par le serveur. */
  copier(source: string, destination: string): Promise<void>;
  supprimer(cle: string): Promise<void>;
  /** Le volume total des objets sous ce préfixe, en octets. */
  volume(prefixe: string): Promise<number>;
  lienDeLecture(cle: string, nom: string): Promise<string>;
}

/** Les en-têtes que le navigateur doit envoyer avec le lien d'envoi. */
export function enTetesDEnvoi(type: string): Record<string, string> {
  return { "content-type": type, "if-none-match": "*" };
}

export function creerStockage(config: R2Config): Stockage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const racine = `${config.endpoint}/${config.bucket}`;
  const url = (cle: string) =>
    `${racine}/${cle.split("/").map(encodeURIComponent).join("/")}`;

  async function exiger(reponse: Response, action: string): Promise<Response> {
    if (!reponse.ok) {
      throw new Error(
        `${action} refusé par le stockage : HTTP ${reponse.status}.`,
      );
    }

    return reponse;
  }

  return {
    async lienDEnvoi(cle, type, taille) {
      const lien = new URL(url(cle));
      lien.searchParams.set("X-Amz-Expires", String(LIEN_SECONDES));
      const signe = await client.sign(lien.toString(), {
        method: "PUT",
        headers: { ...enTetesDEnvoi(type), "content-length": String(taille) },
        aws: { signQuery: true, allHeaders: true },
      });

      return signe.url;
    },

    async decrire(cle) {
      const reponse = await client.fetch(url(cle), { method: "HEAD" });

      if (reponse.status === 404) {
        return null;
      }

      await exiger(reponse, "Lecture");

      return {
        taille: Number(reponse.headers.get("content-length")),
        type: reponse.headers.get("content-type") ?? "",
      };
    },

    async debut(cle, n) {
      const reponse = await exiger(
        await client.fetch(url(cle), {
          headers: { range: `bytes=0-${n - 1}` },
        }),
        "Lecture",
      );

      return new Uint8Array(await reponse.arrayBuffer());
    },

    async copier(source, destination) {
      await exiger(
        await client.fetch(url(destination), {
          method: "PUT",
          headers: {
            "x-amz-copy-source": `/${config.bucket}/${source.split("/").map(encodeURIComponent).join("/")}`,
          },
        }),
        "Copie",
      );
    },

    async supprimer(cle) {
      await exiger(
        await client.fetch(url(cle), { method: "DELETE" }),
        "Suppression",
      );
    },

    async volume(prefixe) {
      let total = 0;
      let suite: string | null = null;

      do {
        const liste = new URL(racine);
        liste.searchParams.set("list-type", "2");
        liste.searchParams.set("prefix", prefixe);

        if (suite !== null) {
          liste.searchParams.set("continuation-token", suite);
        }

        const xml = await (
          await exiger(await client.fetch(liste.toString()), "Liste")
        ).text();

        for (const [, taille] of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
          total += Number(taille);
        }

        suite =
          /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
            xml,
          )?.[1] ?? null;
      } while (suite !== null);

      return total;
    },

    async lienDeLecture(cle, nom) {
      const lien = new URL(url(cle));
      lien.searchParams.set("X-Amz-Expires", String(LIEN_SECONDES));
      // Ouvert dans le navigateur, sous un nom lisible.
      lien.searchParams.set(
        "response-content-disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(nom)}`,
      );
      const signe = await client.sign(lien.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });

      return signe.url;
    },
  };
}
