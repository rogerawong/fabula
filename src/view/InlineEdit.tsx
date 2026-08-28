/**
 * InlineEdit.tsx — The one inline title editor (sections + topics).
 * Enter commits, Escape cancels, blur commits; IME composition is
 * tracked explicitly so Enter never commits mid-composition. Pointer events stop here so editing never starts a drag.
 */

import { useRef, useState } from "react";

interface InlineEditProps {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}

export function InlineEdit({ value, onCommit, onCancel, className }: InlineEditProps) {
  const [text, setText] = useState(value);
  const composing = useRef(false);
  const settled = useRef(false);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    const next = text.trim();
    if (next && next !== value) {
      onCommit(next);
    } else {
      onCancel();
    }
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <input
      autoFocus
      data-testid="inline-edit"
      className={`min-w-0 rounded-sm border border-neutral-300 bg-white px-1 py-0 font-[inherit] text-[inherit] text-neutral-800 outline-none focus:border-neutral-500 ${className ?? ""}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => (composing.current = false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (composing.current || e.nativeEvent.isComposing) return;
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
