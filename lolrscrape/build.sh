#!/usr/bin/env bash
set -euo pipefail
cd $(dirname $0)
PWD=$(pwd)

rm -rf ../wheelhouse
wheelock . ../wheelhouse
cd ../wheelhouse

docker build -t lolrscrape . -f ../docker/Dockerfile
