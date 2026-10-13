/**
 * Le stockage des pièces jointes : Cloudflare R2, dans l'UE, buckets privés
 * (`housemate-prod`, `housemate-previews`). Deux opérations seulement :
 * déposer un fichier (depuis le serveur, après vérification des droits), et
 * produire un lien de lecture temporaire signé (SPEC § 7.1 : jamais
 * d'adresse publique).
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

/** 4 Mo : le fichier passe par une fonction Vercel (limite 4,5 Mo). */
export const TAILLE_MAX = 4 * 1024 * 1024;

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

  if (fichier.size === 0) {
    return { ok: false, erreur: "Le fichier est vide." };
  }

  if (fichier.size > TAILLE_MAX) {
    return {
      ok: false,
      erreur:
        "Le fichier dépasse 4 Mo. Pour un PDF, réduis-le avant de l'envoyer.",
    };
  }

  return { ok: true, type: fichier.type as TypeAccepte };
}

/**
 * La clé de l'objet : sous sa fiche, avec un identifiant aléatoire. Jamais le
 * nom d'origine, qui peut dire des choses (« facture-dupont-12-rue-… »).
 */
export function cleDe(ficheId: string, type: TypeAccepte, id: string): string {
  return `fiches/${ficheId}/${id}.${EXTENSIONS[type]}`;
}

/* ------------------------------------------------------------------------ */
/* Accès                                                                    */
/* ------------------------------------------------------------------------ */

/** Durée de validité d'un lien de lecture. */
export const LIEN_SECONDES = 300;

export interface Stockage {
  deposer(cle: string, contenu: ArrayBuffer, type: string): Promise<void>;
  lienDeLecture(cle: string, nom: string): Promise<string>;
}

export function creerStockage(config: R2Config): Stockage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = (cle: string) =>
    `${config.endpoint}/${config.bucket}/${cle.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async deposer(cle, contenu, type) {
      const reponse = await client.fetch(url(cle), {
        method: "PUT",
        body: contenu,
        headers: { "content-type": type },
      });

      if (!reponse.ok) {
        throw new Error(
          `Dépôt refusé par le stockage : HTTP ${reponse.status}.`,
        );
      }
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
