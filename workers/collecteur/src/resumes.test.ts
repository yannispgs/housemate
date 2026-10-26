import { describe, expect, it, vi } from "vitest";
import { demanderResumes } from "./resumes";

const URL_RESUMES = "https://www.house-mate.app/api/resumes";

describe("demanderResumes", () => {
  it("appelle l'app avec le jeton", async () => {
    const fetcher = vi.fn(async () => Response.json({ envoyes: 1 }));

    await demanderResumes(URL_RESUMES, "s3cret", fetcher);

    expect(fetcher).toHaveBeenCalledWith(URL_RESUMES, {
      method: "POST",
      headers: { Authorization: "Bearer s3cret" },
      redirect: "manual",
    });
  });

  it("échoue si l'app refuse, pour que l'échec se voie dans les journaux", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(demanderResumes(URL_RESUMES, "faux", fetcher)).rejects.toThrow(
      "Résumés : HTTP 401.",
    );
  });
});
