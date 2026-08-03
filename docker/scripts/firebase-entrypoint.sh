#!/bin/sh
set -eu

data_dir="${FIREBASE_DATA_DIR:-/data/firebase}"
project_id="${FIREBASE_PROJECT_ID:-demo-stock-league-event-local}"

mkdir -p "$data_dir"

set -- firebase emulators:start \
  --config /workspace/firebase.json \
  --project "$project_id" \
  --only auth,firestore,functions,pubsub,storage \
  --export-on-exit "$data_dir"

if [ -f "$data_dir/firebase-export-metadata.json" ]; then
  set -- "$@" --import "$data_dir"
fi

exec "$@"
