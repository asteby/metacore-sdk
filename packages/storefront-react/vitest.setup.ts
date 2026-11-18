// `waitFor`/`findBy*` default to a 1s ceiling. These waits are already by condition (they return as
// soon as it holds), but under turbo + several vitest workers on a small CI runner a commit plus
// timers can exceed 1s and the test fails with "expected null not to be null". A longer ceiling
// only affects waits that would fail anyway. Same setting as @asteby/metacore-runtime-react.
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 5000 })
