---
"@asteby/metacore-runtime-react": minor
---

resolveWidget now maps `image`, `file`, and `media-gallery` field types to the `upload` widget (UploadField). Previously these fell through to the text-input default, so media fields in the declarative form rendered as a paste-a-URL input instead of the file uploader.
