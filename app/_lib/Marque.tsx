/**
 * Couleurs de la marque, en dur : les images générées (`next/og`) ne lisent
 * pas les variables CSS. Mêmes valeurs que `--color-accent` et
 * `--color-surface` du design system Organic.
 */
export const BRAND = {
  accent: "#9d4925",
  surface: "#e7e8e9",
  page: "#d5d6d8",
} as const;

/**
 * La marque de l'app : une maison sur fond d'accent, à fond perdu. iOS
 * arrondit lui-même les coins de l'icône ; Android la découpe selon le
 * lanceur, d'où la maison contenue dans les 80 % centraux (zone sûre des
 * icônes « maskable »).
 *
 * ⚠️ Provisoire : aucun logo n'a encore été dessiné dans Claude Design. À
 * remplacer par la version dessinée quand elle existera.
 */
export function Marque({ size }: Readonly<{ size: number }>) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.accent,
      }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <path
          d="M50 8 L94 46 L82 46 L82 92 L60 92 L60 64 L40 64 L40 92 L18 92 L18 46 L6 46 Z"
          fill={BRAND.surface}
        />
      </svg>
    </div>
  );
}
