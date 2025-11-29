#!/usr/bin/env bash
# @format
# Build and push Docker image to ECR

set -euo pipefail

# Required environment variables
: "${ECR_REPO_URI:?ECR_REPO_URI must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set}"
: "${ENVIRONMENT:?ENVIRONMENT must be set}"

IMAGE_TAG_SHA="${IMAGE_TAG}"
IMAGE_TAG_LATEST="latest"
IMAGE_TAG_ENV="${ENVIRONMENT}-latest"

echo "Building and pushing Docker image..."
echo "Repository: ${ECR_REPO_URI}"
echo "Tags: ${IMAGE_TAG_SHA}, ${IMAGE_TAG_LATEST}, ${IMAGE_TAG_ENV}"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NODE_ENV=production \
  --tag "${ECR_REPO_URI}:${IMAGE_TAG_SHA}" \
  --tag "${ECR_REPO_URI}:${IMAGE_TAG_LATEST}" \
  --tag "${ECR_REPO_URI}:${IMAGE_TAG_ENV}" \
  --push \
  --cache-from type=registry,ref="${ECR_REPO_URI}:buildcache" \
  --cache-to type=registry,ref="${ECR_REPO_URI}:buildcache,mode=max" \
  ./frontend

echo "✓ Successfully pushed image with tags: ${IMAGE_TAG_SHA}, ${IMAGE_TAG_LATEST}, ${IMAGE_TAG_ENV}"
