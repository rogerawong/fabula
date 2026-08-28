/**
 * CodeView.tsx — Read-only YAML view of one section, serialized on
 * demand through the document's adapter (docs/02 §2). CodeMirror 6,
 * loaded lazily — this module is only fetched when a card first
 * toggles to code (a Monaco-class editor is most of a bundle; CM6
 * lazy-loads).
 */

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";

const theme = EditorView.theme({
  "&": { fontSize: "11.5px", maxHeight: "320px" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "#a3a3a3",
  },
});

export default function CodeView({ text }: { text: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          yaml(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          theme,
        ],
      }),
    });
    return () => view.destroy();
  }, [text]);

  return <div ref={hostRef} data-testid="code-view" className="text-left" />;
}
