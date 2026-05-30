const { build } = require('esbuild')
const { readFileSync } = require('fs')
const { load } = require('js-yaml')

/** @type {import('esbuild').Plugin} */
const yamlPlugin = {
  name: 'yaml',
  setup(build) {
    build.onLoad({ filter: /\.ya?ml$/ }, (args) => {
      const content = readFileSync(args.path, 'utf8')
      const json = JSON.stringify(load(content))
      return { contents: `export default ${json}`, loader: 'js' }
    })
  },
}

build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  outfile: 'lib/index.js',
  format: 'cjs',
  external: [
    'koishi',
    '@satorijs/element',
    '@koishijs/plugin-help',
    '@koishijs/plugin-notifier',
    'koishi-plugin-adapter-onebot',
    'meme-generator-rs-api',
    'p-limit',
  ],
  plugins: [yamlPlugin],
}).catch(() => process.exit(1))
