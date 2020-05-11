#!/usr/bin/env bash
set -euo pipefail
cd $(dirname $0)
PWD=$(pwd)

#./build.sh
docker run \
    -it \
    -v "${PWD}/../out":/out \
    lolrscrape \
    "$@"
