#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

for plugin in plugins/*/package.json; do
  npm run build -w "$(dirname "$plugin")"
done

./test/pack.sh

# Bundler pages must consume the packed artifact, not the workspace source.
rm -rf node_modules/mapbox-gl
# Install under the unscoped name so that `mapbox-gl` imports resolve to the @iventis/mapbox-gl tarball.
npm install --no-save "mapbox-gl@file:./test/mapbox-gl.tgz"
