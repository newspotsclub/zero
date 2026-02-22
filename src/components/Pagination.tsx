"use client";

import { PAGE_SIZE } from "@/lib/constants";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function Pagination({
  page,
  totalPages,
  totalCount,
  onPrevious,
  onNext,
}: PaginationProps) {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="mt-7 grid grid-cols-2 items-center gap-2 text-xs text-neutral-600 md:grid-cols-4">
      <p className="md:col-span-2">
        Showing {from}-{to} of {totalCount}
      </p>
      <div className="flex items-center gap-2 md:justify-end">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="border border-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="border border-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 disabled:opacity-40"
        >
          Next
        </button>
      </div>
      <p className="text-right">
        Page {page} of {totalPages}
      </p>
    </div>
  );
}
