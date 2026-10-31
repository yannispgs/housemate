import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification } }));

import { AbonnementPerime } from "@/lib/data/envoi-push";
import { clePubliqueVapid, envoyerWebPush } from "@/lib/data/web-push";

const ABONNEMENT = {
  endpoint: "https://push.exemple/1",
  keys: { p256dh: "p", auth: "a" },
};
const MESSAGE = { title: "Vidange", body: "Aujourd'hui", url: "/" };

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "publique");
  vi.stubEnv("VAPID_PRIVATE_KEY", "privee");
  sendNotification.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("envoyerWebPush", () => {
  it("sans clés VAPID, pas de push", () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(envoyerWebPush()).toBeNull();

    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(clePubliqueVapid()).toBeNull();
    expect(envoyerWebPush()).toBeNull();
  });

  it("envoie le message, signé par les clés de l'app", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });

    await envoyerWebPush()?.(ABONNEMENT, MESSAGE);

    expect(sendNotification).toHaveBeenCalledWith(
      ABONNEMENT,
      JSON.stringify(MESSAGE),
      expect.objectContaining({
        vapidDetails: {
          subject: "https://www.house-mate.app",
          publicKey: "publique",
          privateKey: "privee",
        },
      }),
    );
  });

  it("un appareil disparu (404, 410) est périmé", async () => {
    const envoyer = envoyerWebPush();

    for (const statusCode of [404, 410]) {
      sendNotification.mockRejectedValueOnce({ statusCode });
      await expect(envoyer?.(ABONNEMENT, MESSAGE)).rejects.toBeInstanceOf(
        AbonnementPerime,
      );
    }
  });

  it("toute autre erreur remonte telle quelle", async () => {
    const panne = new Error("réseau");
    sendNotification.mockRejectedValueOnce(panne);

    await expect(envoyerWebPush()?.(ABONNEMENT, MESSAGE)).rejects.toBe(panne);
  });
});
