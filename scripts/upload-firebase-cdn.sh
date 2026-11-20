#!/usr/bin/env bash
set -euo pipefail

# Uploads heavy game assets (models, maps, sounds) to Firebase Storage CDN
# Bucket provisioned in firebase-applet-config.json:
BUCKET="${FIREBASE_STORAGE_BUCKET:-gen-lang-client-0974852104.firebasestorage.app}"
PREFIX="cdn"

echo "Applying CORS rules to gs://${BUCKET}..."
gcloud storage buckets update "gs://${BUCKET}" --cors-file="storage-cors.json"

echo "Uploading models, maps, and sounds with 1-year immutable cache headers..."
for dir in models maps sounds; do
  if [ -d "public/${dir}" ]; then
    gcloud storage rsync -r \
      --cache-control="public, max-age=31536000, immutable" \
      "public/${dir}" "gs://${BUCKET}/${PREFIX}/${dir}"
  fi
done

echo ""
echo "Upload concluído! Configure no .env de build (Web/Capacitor):"
echo "VITE_ASSET_CDN_URL=firebase-storage://${BUCKET}/${PREFIX}"
