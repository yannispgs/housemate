import { ImageResponse } from "next/og";
import { Marque } from "./_lib/Marque";

/**
 * Les icônes de l'app, toutes tirées de la même marque : l'onglet du
 * navigateur (32 px) et les deux tailles qu'exige un manifeste installable
 * (192 et 512 px). Servies en `/icon/<id>`.
 */
const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map(size => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({
  id,
}: Readonly<{ id: Promise<string | number> }>) {
  const size = Number(await id);

  return new ImageResponse(<Marque size={size} />, {
    width: size,
    height: size,
  });
}
