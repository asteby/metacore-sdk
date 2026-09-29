// PortalDragOverlay — dnd-kit's <DragOverlay> rendered into <body>.
//
// The overlay is `position: fixed` at the viewport coordinates of the item
// being dragged. Any ancestor with a transform, filter or backdrop-filter
// becomes the containing block of a fixed descendant, so inside such an
// ancestor (a glass panel from @asteby/metacore-theme/glass.css, an animated
// dialog) the lifted item shows up shifted by that ancestor's offset instead of
// under the pointer. Rendering it into <body> keeps the viewport as its
// containing block wherever the board or list is mounted. React context (the
// DndContext) still reaches it through the portal.
import * as React from 'react'
import { createPortal } from 'react-dom'
import { DragOverlay } from '@dnd-kit/core'

export type PortalDragOverlayProps = React.ComponentProps<typeof DragOverlay>

export function PortalDragOverlay(props: PortalDragOverlayProps) {
    if (typeof document === 'undefined') return null
    return createPortal(<DragOverlay {...props} />, document.body)
}
