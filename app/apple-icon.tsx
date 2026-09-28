import { ImageResponse } from "next/og";
import { Marque } from "./_lib/Marque";

/**
 * L'icône de l'écran d'accueil de l'iPhone, qui ignore celles du manifeste.
 * 180 px : la taille qu'iOS attend pour les écrans Retina.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<Marque size={size.width} />, size);
}
