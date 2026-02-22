"use client";

type ToastProps = {
  tone: "success" | "error";
  text: string;
};

export function Toast({ tone, text }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`rounded-sm border px-3 py-2 text-xs shadow-sm ${
          tone === "success"
            ? "border-black/20 bg-white/90 text-neutral-800"
            : "border-red-700/30 bg-red-50/95 text-red-700"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
