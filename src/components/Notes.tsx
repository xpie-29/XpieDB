import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button, Field, Input } from "@fluentui/react-components";
import {
  TextBold20Regular,
  TextItalic20Regular,
  TextUnderline20Regular,
  TextBulletListLtr20Regular,
  TextNumberListLtr20Regular,
  Link20Regular,
  LinkDismiss20Regular,
} from "@fluentui/react-icons";
import { Modal } from "./Shared";

export function NotesEditor({
  value,
  change,
}: {
  value: string;
  change: (html: string) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https"],
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => change(editor.getHTML()),
    editorProps: {
      attributes: {
        "aria-label": "Rich-text notes",
        class: "notes-editor",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });
  if (!editor) return null;
  const tools = [
    {
      name: "Bold",
      icon: <TextBold20Regular />,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      name: "Italic",
      icon: <TextItalic20Regular />,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      name: "Underline",
      icon: <TextUnderline20Regular />,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      name: "Bulleted list",
      icon: <TextBulletListLtr20Regular />,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      name: "Numbered list",
      icon: <TextNumberListLtr20Regular />,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];
  return (
    <div className="notes-control">
      <div
        className="format-toolbar"
        role="toolbar"
        aria-label="Notes formatting"
      >
        {tools.map((t) => (
          <Button
            key={t.name}
            type="button"
            appearance="subtle"
            title={t.name}
            aria-label={t.name}
            icon={t.icon}
            onClick={t.run}
          />
        ))}
        <Button
          type="button"
          appearance="subtle"
          title="Insert link"
          aria-label="Insert link"
          icon={<Link20Regular />}
          onClick={() => {
            setError("");
            setLink(editor.getAttributes("link").href ?? "https://");
          }}
        />
        <Button
          type="button"
          appearance="subtle"
          title="Remove link"
          aria-label="Remove link"
          icon={<LinkDismiss20Regular />}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
      </div>
      <EditorContent editor={editor} />
      {link !== null && (
        <Modal
          title="Insert hyperlink"
          close={() => setLink(null)}
          actions={
            <>
              <Button onClick={() => setLink(null)}>Cancel</Button>
              <Button
                appearance="primary"
                onClick={() => {
                  try {
                    const url = new URL(link);
                    if (
                      !["http:", "https:"].includes(url.protocol) ||
                      url.username ||
                      url.password
                    )
                      throw Error();
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({ href: url.href })
                      .run();
                    setLink(null);
                  } catch {
                    setError("Enter an HTTP or HTTPS URL without credentials.");
                  }
                }}
              >
                Insert
              </Button>
            </>
          }
        >
          <Field
            label="URL"
            validationMessage={error}
            validationState={error ? "error" : "none"}
          >
            <Input value={link} onChange={(_, d) => setLink(d.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
