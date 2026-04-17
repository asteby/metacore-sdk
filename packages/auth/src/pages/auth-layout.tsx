import type { ReactNode } from 'react'

export interface AuthLayoutProps {
  children: ReactNode
  /** Slot for the brand logo (rendered at the top, centered). */
  logo?: ReactNode
  /** Brand name displayed next to the logo. */
  brandName?: string
}

/**
 * Minimal centered auth layout — drop children in and optionally pass a logo
 * slot + brand name. No hardcoded branding.
 */
export function AuthLayout({ children, logo, brandName }: AuthLayoutProps) {
  return (
    <div className='container grid h-svh max-w-none items-center justify-center'>
      <div className='mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:w-[480px] sm:p-8'>
        {(logo || brandName) && (
          <div className='mb-4 flex items-center justify-center'>
            {logo && <span className='me-2'>{logo}</span>}
            {brandName && <h1 className='text-xl font-medium'>{brandName}</h1>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
