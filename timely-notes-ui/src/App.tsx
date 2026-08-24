import { useRef } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import NoteEditor from './components/NoteEditor'

function App() {
  const editorRef = useRef<MDXEditorMethods>(null)

  const handleSave = () => {
    const markdown = editorRef.current?.getMarkdown() ?? ''
    console.log(markdown)
  }

  return (
    <div>
      <h1>Timely Notes</h1>
      <NoteEditor ref={editorRef} markdown="" />
      <button type="button" onClick={handleSave}>
        Save
      </button>
    </div>
  )
}

export default App
