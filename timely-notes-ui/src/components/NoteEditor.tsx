import { forwardRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CodeToggle,
  StrikeThroughSupSubToggles,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

interface NoteEditorProps {
  markdown: string;
}

const NoteEditor = forwardRef<MDXEditorMethods, NoteEditorProps>(({ markdown }, ref) => {
  return (
    <MDXEditor
      ref={ref}
      markdown={markdown}
      className="note-editor"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <BoldItalicUnderlineToggles />
              <CodeToggle />
              <StrikeThroughSupSubToggles />
              <ListsToggle />
              <BlockTypeSelect />
            </>
          ),
        }),
      ]}
    />
  );
});

export default NoteEditor;
