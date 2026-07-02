// @vitest-environment happy-dom
//
// Rich URL & media rendering: URLs are never shown raw. The shared primitives
// classify a URL (image / file / link), derive a smart short label, and
// linkify URLs embedded in free text (bare or markdown), rendering images as
// inline thumbnails, files as chips, and everything else as a compact link.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
    classifyUrl,
    isImageUrl,
    isFileUrl,
    smartUrlLabel,
    fileNameFromUrl,
    ensureHref,
    splitTrailingPunct,
    linkifyText,
    UrlChip,
    FileChip,
    ImageThumbnail,
    MediaValue,
    RichText,
} from '../rich-url'

afterEach(cleanup)

describe('classifyUrl', () => {
    it('detects images by extension', () => {
        for (const u of [
            'https://cdn.example.com/a.jpg',
            'https://cdn.example.com/a.JPEG',
            'http://x/y/z.png?w=200',
            'https://x/pic.webp#frag',
            'https://x/i.avif',
            'https://x/logo.svg',
        ]) {
            expect(isImageUrl(u)).toBe(true)
            expect(classifyUrl(u)).toBe('image')
        }
    })

    it('detects images served from a storage media path without extension', () => {
        const u = 'https://link.asteby.com/storage/media/9f3ac2b1'
        expect(isImageUrl(u)).toBe(true)
        expect(classifyUrl(u)).toBe('image')
    })

    it('detects non-image files by extension', () => {
        for (const u of [
            'https://x/report.pdf',
            'https://x/archive.zip',
            'https://x/sheet.xlsx',
            'https://x/doc.docx?dl=1',
            'https://x/clip.mp4',
        ]) {
            expect(isFileUrl(u)).toBe(true)
            expect(classifyUrl(u)).toBe('file')
        }
    })

    it('treats a plain page URL as a link', () => {
        const u = 'https://github.com/asteby/doctores.lat/issues/212'
        expect(isImageUrl(u)).toBe(false)
        expect(isFileUrl(u)).toBe(false)
        expect(classifyUrl(u)).toBe('link')
    })
})

describe('smartUrlLabel / fileNameFromUrl / ensureHref', () => {
    it('uses the bare hostname for a page URL (no raw long URL)', () => {
        expect(
            smartUrlLabel('https://github.com/asteby/doctores.lat/issues/212')
        ).toBe('github.com')
        expect(smartUrlLabel('https://www.example.com/path/to/thing')).toBe(
            'example.com'
        )
    })

    it('uses the file name for a file/image URL', () => {
        expect(smartUrlLabel('https://x/y/report.pdf')).toBe('report.pdf')
        expect(fileNameFromUrl('https://x/y/My%20File.pdf')).toBe('My File.pdf')
    })

    it('makes a schemeless URL absolute', () => {
        expect(ensureHref('github.com/x')).toBe('https://github.com/x')
        expect(ensureHref('https://a.com')).toBe('https://a.com')
        expect(ensureHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    })
})

describe('splitTrailingPunct', () => {
    it('peels a trailing sentence period', () => {
        expect(splitTrailingPunct('https://a.com/x.')).toEqual([
            'https://a.com/x',
            '.',
        ])
    })

    it('keeps a paren the URL itself opened', () => {
        expect(
            splitTrailingPunct('https://en.wikipedia.org/wiki/Foo_(bar)')
        ).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)', ''])
    })

    it('peels a closing paren the URL did not open', () => {
        expect(splitTrailingPunct('https://a.com/x)')).toEqual([
            'https://a.com/x',
            ')',
        ])
    })
})

describe('linkifyText', () => {
    it('linkifies a bare URL and keeps surrounding text', () => {
        const nodes = linkifyText('see https://github.com/a/b for details')
        render(<p>{nodes}</p>)
        const link = screen.getByRole('link')
        expect(link.getAttribute('href')).toBe('https://github.com/a/b')
        expect(link.getAttribute('target')).toBe('_blank')
        // short label, not the raw URL
        expect(link.textContent).toContain('github.com')
        expect(screen.getByText(/see/)).toBeTruthy()
        expect(screen.getByText(/for details/)).toBeTruthy()
    })

    it('does not swallow the trailing period into the href', () => {
        const nodes = linkifyText('go to https://a.com/x.')
        render(<p>{nodes}</p>)
        expect(screen.getByRole('link').getAttribute('href')).toBe('https://a.com/x')
    })

    it('renders an embedded image URL as an inline thumbnail', () => {
        const nodes = linkifyText('pic https://cdn.x/p.png here')
        const { container } = render(<p>{nodes}</p>)
        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        expect(img!.getAttribute('src')).toBe('https://cdn.x/p.png')
    })

    it('honors a markdown link label', () => {
        const nodes = linkifyText('[the issue](https://github.com/a/b/issues/1)')
        render(<p>{nodes}</p>)
        const link = screen.getByRole('link')
        expect(link.getAttribute('href')).toBe('https://github.com/a/b/issues/1')
        expect(link.textContent).toContain('the issue')
    })
})

describe('primitives render', () => {
    it('UrlChip opens in a new tab with the full URL in the title', () => {
        render(<UrlChip url="https://github.com/asteby/x/issues/9" />)
        const link = screen.getByRole('link')
        expect(link.getAttribute('href')).toBe('https://github.com/asteby/x/issues/9')
        expect(link.getAttribute('title')).toBe('https://github.com/asteby/x/issues/9')
        expect(link.getAttribute('rel')).toBe('noopener noreferrer')
        expect(link.textContent).toContain('github.com')
    })

    it('FileChip shows the file name', () => {
        render(<FileChip url="https://x/y/quarterly-report.pdf" />)
        expect(screen.getByText('quarterly-report.pdf')).toBeTruthy()
    })

    it('ImageThumbnail falls back to a link chip on load error', () => {
        const { container } = render(
            <ImageThumbnail url="https://cdn.x/broken.png" />
        )
        const img = container.querySelector('img') as HTMLImageElement
        expect(img).toBeTruthy()
        // simulate a broken image (React synthetic onError)
        fireEvent.error(img)
        // after error, a link chip is rendered instead
        expect(screen.queryByRole('link')).toBeTruthy()
    })

    it('MediaValue dispatches by kind', () => {
        const { rerender, container } = render(
            <MediaValue url="https://cdn.x/a.png" />
        )
        expect(container.querySelector('img')).toBeTruthy()

        rerender(<MediaValue url="https://x/a.pdf" />)
        expect(screen.getByText('a.pdf')).toBeTruthy()

        rerender(<MediaValue url="https://github.com/a/b" />)
        expect(screen.getByRole('link').textContent).toContain('github.com')
    })

    it('RichText linkifies a body while preserving text', () => {
        render(
            <RichText text={'Fixes the bug. Ref https://github.com/a/b/pull/3'} />
        )
        expect(screen.getByText(/Fixes the bug/)).toBeTruthy()
        expect(screen.getByRole('link').getAttribute('href')).toBe('https://github.com/a/b/pull/3')
    })
})
