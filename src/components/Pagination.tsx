"use client";

type PaginationProps = {
  page: number;
  totalPages: number;
  onGoToPage: (page: number) => void;
};

export function Pagination({ page, totalPages, onGoToPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers: number[] = [];
  for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);

  return (
    <div className="mt-7 flex items-center justify-center gap-1 text-xs">
      {page > 1 ? (
        <button
          type="button"
          onClick={() => onGoToPage(1)}
          className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700"
        >
          First
        </button>
      ) : null}
      {page > 1 ? (
        <button
          type="button"
          onClick={() => onGoToPage(page - 1)}
          className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700"
        >
          Prev
        </button>
      ) : null}
      {pageNumbers.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onGoToPage(p)}
          className={`border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
            p === page
              ? "border-black bg-black text-white"
              : "border-black/20 text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {p}
        </button>
      ))}
      {page < totalPages ? (
        <button
          type="button"
          onClick={() => onGoToPage(page + 1)}
          className="border border-black/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700"
        >
          Next
        </button>
      ) : null}
    </div>
  );
}
