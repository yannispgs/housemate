import { describe, expect, it } from "vitest";
import {
  DELAI_RENVOI_MS,
  libelleRenvoi,
  secondesAvantRenvoi,
} from "@/lib/auth/renvoi";

const ENVOI = 1_790_000_000_000;

describe("secondesAvantRenvoi", () => {
  it("attend 60 secondes pleines juste après un envoi", () => {
    expect(secondesAvantRenvoi(ENVOI, ENVOI)).toBe(60);
  });

  it("arrondit au-dessus : il reste 1 s jusqu'à la dernière milliseconde", () => {
    expect(secondesAvantRenvoi(ENVOI, ENVOI + DELAI_RENVOI_MS - 1)).toBe(1);
    expect(secondesAvantRenvoi(ENVOI, ENVOI + 18_500)).toBe(42);
  });

  it("permet le renvoi à 60 s et au-delà", () => {
    expect(secondesAvantRenvoi(ENVOI, ENVOI + DELAI_RENVOI_MS)).toBe(0);
    expect(secondesAvantRenvoi(ENVOI, ENVOI + 5 * DELAI_RENVOI_MS)).toBe(0);
  });

  it("permet le renvoi sans envoi connu", () => {
    expect(secondesAvantRenvoi(null, ENVOI)).toBe(0);
  });
});

describe("libelleRenvoi", () => {
  it("affiche le temps restant, puis l'action", () => {
    expect(libelleRenvoi(42)).toBe("Renvoyer le code dans 42 s");
    expect(libelleRenvoi(0)).toBe("Renvoyer le code");
  });
});
