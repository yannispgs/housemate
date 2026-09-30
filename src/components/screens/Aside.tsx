/**
 * La colonne latérale du bureau, sur l'accueil et le récap : ce qui vient, et
 * ce qui sera notifié ce soir.
 */
import { SectionLabel } from "../Screen";

export interface AsideContent {
  readonly upcoming: readonly {
    readonly title: string;
    readonly when: string;
  }[];
  readonly notifications: string;
}

export function DeadlinesAside({
  content,
}: Readonly<{ content: AsideContent }>) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>À venir</SectionLabel>
        <div className="flex flex-col border-b border-grid">
          {content.upcoming.map(entry => (
            <span
              key={entry.title}
              className="flex justify-between gap-3 border-t border-grid py-2.5 text-[13.5px] leading-[1.4] text-ink-secondary"
            >
              {entry.title}
              <span className="flex-none tabular-nums text-ink-muted">
                {entry.when}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Notifications ce soir</SectionLabel>
        <span className="text-[13px] leading-[1.55] text-pretty text-ink-secondary">
          {content.notifications}
        </span>
      </div>
    </>
  );
}
