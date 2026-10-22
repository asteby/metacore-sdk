// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { prepareHtml } from './html-sandbox'

const EVIL = `<p onclick="x()">hi</p><script>alert(1)</script><iframe src="https://e.com"></iframe>
<a href="javascript:alert(1)">bad</a><a href="https://ok.com">ok</a>
<img src="https://t.example/pixel.gif" srcset="https://t.example/2x.gif 2x"><img src="cid:logo"><form action="https://e.com"><input></form>
<div style="background:url(https://t.example/bg.png)">x</div><base href="https://e.com">`

describe('prepareHtml', () => {
  it('strips active content and sets a strict CSP', () => {
    const { srcDoc } = prepareHtml(EVIL)
    expect(srcDoc).not.toMatch(/<script|<iframe|<form|<base|onclick|javascript:/i)
    expect(srcDoc).toContain("default-src 'none'")
    expect(srcDoc).toContain('img-src data: blob: cid:;')
    expect(srcDoc).not.toMatch(/img-src[^;]*https:/)
  })
  it('blocks remote images by default and counts them', () => {
    const r = prepareHtml(EVIL)
    expect(r.remoteImageCount).toBe(2)
    expect(r.srcDoc).not.toContain('pixel.gif')
    expect(r.srcDoc).not.toContain('bg.png')
    expect(r.srcDoc).toContain('data-blocked')
  })
  it('loads (and proxies) remote images only on opt-in', () => {
    const r = prepareHtml(EVIL, { loadImages: true, rewriteImageUrl: (u) => `/proxy?u=${encodeURIComponent(u)}` })
    expect(r.srcDoc).toContain('/proxy?u=https%3A%2F%2Ft.example%2Fpixel.gif')
    expect(r.srcDoc).toMatch(/img-src[^;]*https:/)
    expect(r.srcDoc).not.toContain('srcset')
  })
  it('resolves cid images and drops unknown ones', () => {
    expect(prepareHtml('<img src="cid:logo">', { inlineResources: { logo: 'blob:abc' } }).srcDoc).toContain('src="blob:abc"')
    expect(prepareHtml('<img src="cid:other">', { inlineResources: { logo: 'blob:abc' } }).srcDoc).not.toContain('blob:abc')
  })
  it('opens links safely', () => {
    const { srcDoc } = prepareHtml('<a href="https://ok.com">x</a>')
    expect(srcDoc).toContain('target="_blank"')
    expect(srcDoc).toContain('rel="noopener noreferrer nofollow"')
  })
  it('detects and hides quoted history', () => {
    const html = '<p>new</p><div class="gmail_quote">old</div>'
    expect(prepareHtml(html).hasQuoted).toBe(true)
    expect(prepareHtml(html, { hideQuoted: true }).srcDoc).toContain('display:none!important')
    expect(prepareHtml('<p>x</p>').hasQuoted).toBe(false)
  })
})
