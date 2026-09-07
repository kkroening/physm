#!/usr/bin/env bash
# Regenerate the light/dark SVG pairs from the shared templates.
#
# Each figure is authored once as <name>.tpl.svg with four colour placeholders, and
# rendered into the two variants that docs/algorithm.md selects between with <picture>.
# Edit the template, run this, commit all three files.
set -euo pipefail
cd "$(dirname "$0")"

render () {  # <name> <variant> <FG> <BLUE> <OXIDE> <BG>
  sed -e "s/@FG@/$3/g" -e "s/@BLUE@/$4/g" -e "s/@OXIDE@/$5/g" -e "s/@BG@/$6/g" \
    "$1.tpl.svg" > "$1-$2.svg"
  printf '  %s-%s.svg\n' "$1" "$2"
}

for fig in tree-sparsity dataflow; do
  render "$fig" light '#1f2328' '#0969da' '#953800' '#ffffff'
  render "$fig" dark  '#e6edf3' '#4493f8' '#db6d28' '#0d1117'
done
