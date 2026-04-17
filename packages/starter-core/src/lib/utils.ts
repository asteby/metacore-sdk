import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Gets the full URL for a storage file
 * @param filename - File name (e.g., "20260112_uuid.png")
 * @param folder - Storage folder (e.g., "organizations", "uploads")
 * @returns Full URL with backend base URL
 */
export function getStorageUrl(filename: string | undefined | null, folder: string): string {
  if (!filename) return ''

  // If it's already a full URL, return as is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename
  }

  // Get base URL from env (remove /api suffix if present)
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
  const baseUrl = apiUrl.replace(/\/api$/, '')

  // If it's already an absolute storage path, use it directly
  if (filename.startsWith('/storage/')) {
    return `${baseUrl}${filename}`
  }

  return `${baseUrl}/storage/${folder}/${filename}`
}

/**
 * Helper to get the full URL for an image path stored in the DB (e.g. /storage/uploads/...)
 */
export function getImageUrl(path: string | undefined | null): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path

  // Get base URL (backend)
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  // Remove /api if present to get root backend URL
  const baseUrl = apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')

  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${cleanPath}`
}

export function sleep(ms: number = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generates page numbers for pagination with ellipsis
 * @param currentPage - Current page number (1-based)
 * @param totalPages - Total number of pages
 * @returns Array of page numbers and ellipsis strings
 *
 * Examples:
 * - Small dataset (≤5 pages): [1, 2, 3, 4, 5]
 * - Near beginning: [1, 2, 3, 4, '...', 10]
 * - In middle: [1, '...', 4, 5, 6, '...', 10]
 * - Near end: [1, '...', 7, 8, 9, 10]
 */
export function getPageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5 // Maximum number of page buttons to show
  const rangeWithDots = []

  if (totalPages <= maxVisiblePages) {
    // If total pages is 5 or less, show all pages
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push(i)
    }
  } else {
    // Always show first page
    rangeWithDots.push(1)

    if (currentPage <= 3) {
      // Near the beginning: [1] [2] [3] [4] ... [10]
      for (let i = 2; i <= 4; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    } else if (currentPage >= totalPages - 2) {
      // Near the end: [1] ... [7] [8] [9] [10]
      rangeWithDots.push('...')
      for (let i = totalPages - 3; i <= totalPages; i++) {
        rangeWithDots.push(i)
      }
    } else {
      // In the middle: [1] ... [4] [5] [6] ... [10]
      rangeWithDots.push('...')
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    }
  }

  return rangeWithDots
}
