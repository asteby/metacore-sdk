import { useRef, useState } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import { useTheme } from '../../context/theme-provider'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CodeEditorProps {
    value: string
    onChange?: (value: string | undefined) => void
    language?: 'json' | 'sql' | 'javascript' | 'typescript' | 'plaintext'
    height?: string | number
    readOnly?: boolean
    minimap?: boolean
    onDrop?: (text: string) => void
    disableValidation?: boolean
}

export function CodeEditor({
    value,
    onChange,
    language = 'json',
    height = '200px',
    readOnly = false,
    minimap = false,
    onDrop,
    disableValidation = false,
}: CodeEditorProps) {
    const { theme } = useTheme()
    const editorRef = useRef<any>(null)
    const [isDragOver, setIsDragOver] = useState(false)

    const handleEditorWillMount: BeforeMount = (monaco) => {
        if (disableValidation && language === 'json') {
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: false,
                schemaValidation: 'ignore',
            })
        }
    }

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor
        editor.updateOptions({
            scrollBeyondLastLine: false,
            fontSize: 12,
            fontFamily: "'Geist Mono', monospace",
            padding: { top: 8, bottom: 8 },
        })

        // Disable validation markers if requested
        if (disableValidation) {
            monaco.editor.setModelMarkers(editor.getModel()!, 'json', [])
        }

        // Enable drop on the editor
        const domNode = editor.getDomNode()
        if (domNode) {
            domNode.addEventListener('dragover', (e: DragEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(true)
            })

            domNode.addEventListener('dragleave', (e: DragEvent) => {
                e.preventDefault()
                setIsDragOver(false)
            })

            domNode.addEventListener('drop', (e: DragEvent) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(false)

                const droppedText = e.dataTransfer?.getData('variable') || e.dataTransfer?.getData('text/plain')
                if (!droppedText) return

                // Get drop position in editor coordinates
                const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
                
                if (target?.position) {
                    // Insert at drop position
                    const position = target.position
                    editor.executeEdits('drop', [{
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: position.column,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column,
                        },
                        text: droppedText,
                    }])
                    // Move cursor after inserted text
                    editor.setPosition({
                        lineNumber: position.lineNumber,
                        column: position.column + droppedText.length,
                    })
                    editor.focus()
                } else {
                    // Fallback: insert at current cursor or end
                    const currentPosition = editor.getPosition()
                    if (currentPosition) {
                        editor.executeEdits('drop', [{
                            range: {
                                startLineNumber: currentPosition.lineNumber,
                                startColumn: currentPosition.column,
                                endLineNumber: currentPosition.lineNumber,
                                endColumn: currentPosition.column,
                            },
                            text: droppedText,
                        }])
                    }
                }

                // Trigger onChange with new value
                const newValue = editor.getValue()
                onChange?.(newValue)
                onDrop?.(droppedText)
            })
        }
    }

    return (
        <div 
            className={cn(
                "border rounded-md overflow-hidden bg-background transition-all duration-200",
                isDragOver && "ring-2 ring-violet-500 ring-offset-2 border-violet-500"
            )}
        >
            <Editor
                height={height}
                language={language}
                value={value}
                onChange={onChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                    readOnly,
                    minimap: { enabled: minimap },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    fontFamily: "'Geist Mono', monospace",
                    padding: { top: 8, bottom: 8 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    automaticLayout: true,
                    dropIntoEditor: { enabled: true },
                }}
                loading={
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Cargando editor...</span>
                    </div>
                }
            />
        </div>
    )
}
