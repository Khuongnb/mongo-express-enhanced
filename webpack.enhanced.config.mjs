// Frontend build for the enhanced layer (UI tier 2). Separate from upstream's webpack.config.mjs so upstream's
// config, entries and build-assets.json stay untouched. Output goes to enhanced/build/ (already covered by
// upstream's `build/` .gitignore pattern); the app reads enhanced/build/enhanced-assets.json.
import { fileURLToPath } from 'node:url';
// Build-only tooling; upstream's webpack.config.mjs is exempted from this rule in eslint.config.js, ours is not.
/* eslint-disable import/no-extraneous-dependencies */
import AssetsPlugin from 'assets-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
/* eslint-enable import/no-extraneous-dependencies */

const isProd = (process.env.NODE_ENV || 'development') !== 'development';
const outputPath = fileURLToPath(new URL('enhanced/build', import.meta.url));

export default {
  mode: isProd ? 'production' : 'development',
  entry: {
    enhanced: './enhanced/scripts/enhanced.js',
  },
  output: {
    filename: `[name]${isProd ? '-[chunkhash].min' : ''}.js`,
    chunkFilename: `[name]${isProd ? '-[chunkhash].min' : ''}.js`,
    path: outputPath,
    // Upstream's bundles register lazy chunks on a global named after package.json; sharing it would hand our chunks to their runtime.
    chunkLoadingGlobal: 'webpackChunkMongoExpressEnhanced',
    publicPath: '', // keep manifest entries as bare filenames; the app serves the directory itself
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: { presets: ['@babel/preset-env'] },
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new AssetsPlugin({ filename: 'enhanced-assets.json', path: outputPath }),
  ],
};
