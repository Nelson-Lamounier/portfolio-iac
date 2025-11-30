#!/usr/bin/env bash
# @format
# Clean up buildcache tag from ECR (conflicts with immutable tags)

set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be set}"

REPO_NAME="app-repo-${ENVIRONMENT}"

echo "Cleaning up buildcache tag from ${REPO_NAME}..."

# Check if buildcache tag exists
if aws ecr describe-images \
  --repository-name "${REPO_NAME}" \
  --image-ids imageTag=buildcache &>/dev/null; then
  
  echo "Found buildcache tag, deleting..."
  aws ecr batch-delete-image \
    --repository-name "${REPO_NAME}" \
    --image-ids imageTag=buildcache
  
  echo "✓ Deleted buildcache tag"
else
  echo "✓ No buildcache tag found (already clean)"
fi
