const { DateTime } = require('luxon')
const fs = require('fs')
const pluginRss = require('@11ty/eleventy-plugin-rss')
const pluginSyntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight')
const pluginNavigation = require('@11ty/eleventy-navigation')
const pluginTOC = require('eleventy-plugin-toc')
const markdownIt = require('markdown-it')
const iterator = require('markdown-it-for-inline')
const markdownItAnchor = require('markdown-it-anchor')

module.exports = function (eleventyConfig) {
  // Add plugins
  eleventyConfig.addPlugin(pluginRss)
  eleventyConfig.addPlugin(pluginSyntaxHighlight)
  eleventyConfig.addPlugin(pluginNavigation)
  eleventyConfig.addPlugin(pluginTOC, {
    wrapper: 'div'
  })

  // https://www.11ty.dev/docs/data-deep-merge/
  eleventyConfig.setDataDeepMerge(true)

  // Alias `layout: post` to `layout: post.njk`
  eleventyConfig.addLayoutAlias('post', 'post.njk')

  eleventyConfig.addFilter('readableDate', dateObj => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).setLocale('ru').toLocaleString(DateTime.DATE_FULL)
  })

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toISO()
  })

  // Get the first `n` elements of a collection.
  eleventyConfig.addFilter('head', (array, n) => {
    if (!Array.isArray(array) || array.length === 0) {
      return []
    }
    if (n < 0) {
      return array.slice(n)
    }

    return array.slice(0, n)
  })

  // Return the smallest number argument
  eleventyConfig.addFilter('min', (...numbers) => {
    return Math.min.apply(null, numbers)
  })

  function filterTagList (tags) {
    return (tags || []).filter(tag => ['all', 'nav', 'post', 'posts'].indexOf(tag) === -1)
  }

  eleventyConfig.addFilter('filterTagList', filterTagList)

  eleventyConfig.addFilter('count', array => array.length)

  eleventyConfig.addFilter('slugTitle', title => eleventyConfig.getFilter('slug')(title)
    .replace(/[^a-z0-9 -]/g, '')
  )

  eleventyConfig.addCollection('postsReverse', function (collection) {
    return collection.getFilteredByTag('posts').reverse()
  })

  eleventyConfig.addCollection('tags', function (collection) {
    const posts = collection.getFilteredByTag('posts').reverse()
    const tags = posts
      .map(item => item.data.tags)
      .flat()
      .filter(Boolean)
    const uniqueTags = filterTagList([...new Set(tags)])
    const pageSize = 4

    return uniqueTags.map(tag => {
      const postsWithTag = posts.filter(post => post.data.tags.includes(tag))

      const chunk = (arr, size) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
          arr.slice(i * size, i * size + size)
        )

      const chunks = chunk(postsWithTag, pageSize)
      const pages = chunks.length
      const tagSlug = eleventyConfig.getFilter('slug')(tag)

      return chunks.map((item, index) => ({
        tagName: tag,
        pageNumber: index,
        pages,
        pageData: item,
        pagination: {
          first: index === 0 ? null : `/tags/${tagSlug}`,
          previous: index === 0 ? null : (index === 1 ? `/tags/${tagSlug}` : `/tags/${tagSlug}/${index}`),
          next: index === pages - 1 ? null : `/tags/${tagSlug}/${index + 2}`,
          last: index === pages - 1 ? null : `/tags/${tagSlug}/${pages - 1}`,
        }
      }))
    }).flat()
  })

  // Create an array of all tags
  eleventyConfig.addCollection('tagList', function (collection) {
    const tagSet = new Map()
    collection.getAll().forEach(item => {
      filterTagList(item.data.tags || []).forEach(tag => {
        tagSet.set(tag, (tagSet.get(tag) ?? 0) + 1)
      })
    })

    return new Map([...tagSet].sort((a, b) => String(b[1]).localeCompare(a[1])))
  })

  // Copy the `img`, `css` and `js` folders to the output
  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('fonts')
  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('js')

  // Customize Markdown library and settings:
  let markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: false,
    typographer: true
  })
    .use(iterator, 'process_link', 'link_open', function (tokens, idx) {
      const hrefIndex = tokens[idx].attrIndex('href');
      const relIndex = tokens[idx].attrIndex('rel');
      const targetIndex = tokens[idx].attrIndex('target');

      if (tokens[idx].attrs[hrefIndex][1].substr(0, 1) !== '/') {
        if (relIndex < 0) {
          tokens[idx].attrPush(['rel', 'nofollow']);
        } else {
          tokens[idx].attrs[relIndex][1] = 'nofollow';
        }
      }

      if (targetIndex < 0) {
        tokens[idx].attrPush(['target', '_blank']);
      } else {
        tokens[idx].attrs[targetIndex][1] = '_blank';
      }
    })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.ariaHidden({
        placement: 'after',
        class: 'direct-link',
        symbol: '#',
        level: [1, 2, 3, 4],
      }),
      slugify: eleventyConfig.getFilter('slug')
    })
  eleventyConfig.setLibrary('md', markdownLibrary)

  // Override Browsersync defaults (used only with --serve)
  eleventyConfig.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync('_site/404.html')

        browserSync.addMiddleware('*', (req, res) => {
          // Provides the 404 content without redirect.
          res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' })
          res.write(content_404)
          res.end()
        })
      },
    },
    ui: false,
    ghostMode: false
  })

  return {
    // Control which files Eleventy will process
    // e.g.: *.md, *.njk, *.html, *.liquid
    templateFormats: [
      'md',
      'njk',
      'html',
      'liquid'
    ],

    // -----------------------------------------------------------------
    // If your site deploys to a subdirectory, change `pathPrefix`.
    // Don’t worry about leading and trailing slashes, we normalize these.

    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for link URLs (it does not affect your file structure)
    // Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

    // You can also pass this in on the command line using `--pathprefix`

    // Optional (default is shown)
    pathPrefix: '/',
    // -----------------------------------------------------------------

    // Pre-process *.md files with: (default: `liquid`)
    markdownTemplateEngine: 'njk',

    // Pre-process *.html files with: (default: `liquid`)
    htmlTemplateEngine: 'njk',

    // Opt-out of pre-processing global data JSON files: (default: `liquid`)
    dataTemplateEngine: false,

    // These are all optional (defaults are shown):
    dir: {
      input: '.',
      includes: '_includes',
      data: '_data',
      output: '_site'
    }
  }
}
