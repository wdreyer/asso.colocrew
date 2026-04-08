"use client";

import { useEffect, useRef, useState } from "react";

const COMMANDS = [
  { key: "bold", label: "Gras", icon: "B" },
  { key: "italic", label: "Italique", icon: "I" },
  { key: "insertUnorderedList", label: "Liste", icon: "•" },
  { key: "insertOrderedList", label: "Num", icon: "1." },
  { key: "formatBlock", value: "h2", label: "Titre", icon: "H2" },
  { key: "formatBlock", value: "p", label: "Paragraphe", icon: "P" },
];

export default function WysiwygEditor({ value, onChange, minHeight = 220 }) {
  const editorRef = useRef(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command, cmdValue) => {
    editorRef.current?.focus();
    if (cmdValue) {
      document.execCommand(command, false, cmdValue);
    } else {
      document.execCommand(command, false);
    }
    onChange?.(editorRef.current?.innerHTML || "");
  };

  const onLink = () => {
    const url = window.prompt("URL du lien");
    if (!url) return;
    exec("createLink", url);
  };

  return (
    <div className={`dash-wysiwyg ${focused ? "is-focused" : ""}`}>
      <div className="dash-wysiwyg-toolbar">
        {COMMANDS.map((cmd) => (
          <button
            key={`${cmd.key}-${cmd.value || ""}`}
            type="button"
            className="dash-wysiwyg-btn"
            onClick={() => exec(cmd.key, cmd.value)}
            title={cmd.label}
          >
            {cmd.icon}
          </button>
        ))}
        <button type="button" className="dash-wysiwyg-btn" onClick={onLink} title="Lien">
          🔗
        </button>
        <button type="button" className="dash-wysiwyg-btn" onClick={() => exec("removeFormat")} title="Nettoyer">
          Tx
        </button>
      </div>

      <div
        ref={editorRef}
        className="dash-wysiwyg-editor"
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onChange?.(editorRef.current?.innerHTML || "");
        }}
        onInput={() => onChange?.(editorRef.current?.innerHTML || "")}
      />
    </div>
  );
}
