// Stub — phase A3 will port the real theme-provider.
// Minimal surface so sonner.tsx / code-editor.tsx compile during phase A2.
export type Theme = 'light' | 'dark' | 'system'

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  return {
    theme: 'system',
    setTheme: () => {},
  }
}
