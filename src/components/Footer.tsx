const CONTACT_EMAIL = "hello@newspots.club";

export function Footer() {
  return (
    <footer className="mt-10 flex flex-col gap-4 border-t border-black/20 pt-6 pb-2 text-xs text-neutral-600 md:mt-12 md:flex-row md:items-start md:justify-between">
      <div>
        <p>New Spots Club is curated list of new spots to explore in and around you.</p>
        <p>Only for Bengaluru for now.</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.13em] text-neutral-900 underline decoration-black/35 underline-offset-4 hover:decoration-black"
        >
          Add your place.
        </a>
      </div>
      <p className="md:text-right">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-mono text-[11px] uppercase tracking-[0.13em] text-neutral-900 underline decoration-black/35 underline-offset-4 hover:decoration-black"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </footer>
  );
}
