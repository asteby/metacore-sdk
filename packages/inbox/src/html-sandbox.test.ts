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
    expect(r.srcDoc).toContain("img-src data: blob: cid: 'self';")
    expect(r.srcDoc).not.toMatch(/img-src[^;]*https?:/)
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

describe('prepareHtml: image vectors beyond <img>', () => {
  const VECTORS = `<input type="image" src="https://t.example/i.png">
<svg><image href="https://t.example/s1.png"/><image xlink:href="https://t.example/s2.png"/><use href="https://t.example/u.svg#a"/></svg>
<div style="background:url('https://t.example/c1.png')">a</div>
<div style="background-image:image-set('https://t.example/c2.png' 1x)">b</div>
<div style="background:u\\72l(https://t.example/c3.png)">c</div>
<style>.x{background:url(https://t.example/c4.png)} @import url(https://t.example/e.css);</style>`
  it('counts and blocks every remote image when loadImages is off', () => {
    const r = prepareHtml(VECTORS)
    expect(r.remoteImageCount).toBe(8)
    expect(r.srcDoc).not.toContain('t.example')
  })
  it('routes every one of them through the proxy when loading is on', () => {
    const r = prepareHtml(VECTORS, { loadImages: true, rewriteImageUrl: (u) => `/p?u=${encodeURIComponent(u)}` })
    expect(r.srcDoc.match(/t\.example/g)?.length ?? 0).toBe(r.srcDoc.match(/%2F%2Ft\.example/g)?.length ?? 0)
    expect(r.srcDoc).not.toMatch(/(src|href)="https?:\/\/t\.example/)
    expect(r.srcDoc).not.toMatch(/url\("?https?:\/\/t\.example/)
    expect(r.srcDoc).toContain("'self'")
    expect(r.srcDoc).not.toContain('@import')
  })
  it('limits img-src to an absolute proxy origin', () => {
    const r = prepareHtml('<img src="https://t.example/a.png">', { loadImages: true, rewriteImageUrl: (u) => `https://img.proxy.test/?u=${encodeURIComponent(u)}` })
    expect(r.srcDoc).toContain('img-src data: blob: cid: https://img.proxy.test;')
  })
})

describe('prepareHtml: links', () => {
  it('hardens svg xlink:href and leaves #anchors in-document', () => {
    const { srcDoc } = prepareHtml('<svg><a xlink:href="https://ok.com"><text>x</text></a><a xlink:href="javascript:alert(1)"><text>y</text></a></svg><a href="#top">t</a>')
    expect(srcDoc).not.toContain('javascript:')
    expect(srcDoc).toMatch(/<a[^>]*xlink:href="https:\/\/ok\.com"[^>]*target="_blank"/)
    expect(srcDoc).toMatch(/<a href="#top">/)
  })
})
