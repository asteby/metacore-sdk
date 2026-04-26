import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Metacore SDK',
  description: 'Declarative addons. Zero-glue UI. The SDK for the Metacore runtime.',
  base: '/metacore-sdk/',
  cleanUrls: true,
  lastUpdated: true,

  // Some docs cross-link to package READMEs and external repos that VitePress
  // cannot resolve at build time. Don't fail the build over those.
  ignoreDeadLinks: [
    /\/packages\//,
    /github\.com/,
  ],

  head: [
    ['link', { rel: 'icon', href: '/metacore-sdk/assets/metacore.svg' }],
  ],

  themeConfig: {
    logo: '/assets/metacore.svg',
    siteTitle: 'Metacore SDK',

    nav: [
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'Dynamic UI', link: '/dynamic-ui' },
      { text: 'Cookbook', link: '/addon-cookbook' },
      {
        text: 'Reference',
        items: [
          { text: 'Manifest spec', link: '/manifest-spec' },
          { text: 'Capabilities', link: '/capabilities' },
          { text: 'WASM ABI', link: '/wasm-abi' },
        ],
      },
      {
        text: 'Ecosystem',
        items: [
          { text: 'metacore-kernel', link: 'https://github.com/asteby/metacore-kernel' },
          { text: 'GitHub', link: 'https://github.com/asteby/metacore-sdk' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Get Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Consumer Guide', link: '/CONSUMER_GUIDE' },
          { text: 'Internal Setup', link: '/internal-setup' },
        ],
      },
      {
        text: 'Dynamic UI Framework',
        items: [
          { text: 'Dynamic UI', link: '/dynamic-ui' },
          { text: 'Addon Cookbook', link: '/addon-cookbook' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Manifest Spec', link: '/manifest-spec' },
          { text: 'Capabilities', link: '/capabilities' },
          { text: 'WASM ABI', link: '/wasm-abi' },
        ],
      },
      {
        text: 'Publishing',
        items: [
          { text: 'Addon Publishing', link: '/addon-publishing' },
          { text: 'SDK Release', link: '/PUBLISHING' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/asteby/metacore-sdk' },
    ],

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © Asteby',
    },

    search: {
      provider: 'local',
    },
  },
})
