# @asteby/metacore-starter-monaco

Opt-in Monaco editor wrapper extracted from `@asteby/metacore-starter-core` (v5+).

Use this only if your app needs an embedded code editor. Apps without an editor avoid the ~2MB Monaco bundle entirely (and the `@monaco-editor/react` peer dependency).

## Install

```bash
pnpm add @asteby/metacore-starter-monaco @monaco-editor/react
```

## Usage

```tsx
import { CodeEditor } from '@asteby/metacore-starter-monaco'
import { useTheme } from '@asteby/metacore-starter-core' // or your local theme provider

function MyComponent() {
  const { theme } = useTheme()
  return (
    <CodeEditor
      value={code}
      onChange={setCode}
      language="json"
      theme={theme === 'dark' ? 'dark' : 'light'}
    />
  )
}
```

## Props

| Prop                | Type                                                              | Default     | Description                                          |
| ------------------- | ----------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| `value`             | `string`                                                          | —           | Editor content (controlled).                         |
| `onChange`          | `(value: string \| undefined) => void`                            | —           | Fired on every keystroke.                            |
| `language`          | `'json' \| 'sql' \| 'javascript' \| 'typescript' \| 'plaintext'`  | `'json'`    | Monaco language mode.                                |
| `height`            | `string \| number`                                                | `'200px'`   | Editor height.                                       |
| `readOnly`          | `boolean`                                                         | `false`     |                                                      |
| `minimap`           | `boolean`                                                         | `false`     | Show Monaco minimap on the right.                    |
| `theme`             | `'dark' \| 'light'`                                               | `'light'`   | Pass from your theme provider.                       |
| `disableValidation` | `boolean`                                                         | `false`     | Disable JSON schema validation markers.              |
| `onDrop`            | `(text: string) => void`                                          | —           | Fired when content is dropped via drag-and-drop.     |

## Why a separate package?

`@asteby/metacore-starter-core` v4 declared `@monaco-editor/react` as a transitive cost for every consumer. Splitting Monaco out keeps starter-core lean for apps that never embed a code editor.
