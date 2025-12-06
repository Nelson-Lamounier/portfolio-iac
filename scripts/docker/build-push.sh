#!/usr/bin/env bash
# @format
# Build and push Docker image to ECR

set -euo pipefail

# Required environment variables
: "${ECR_REPO_URI:?ECR_REPO_URI must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set}"
: "${ENVIRONMENT:?ENVIRONMENT must be set}"

IMAGE_TAG_SHA="${IMAGE_TAG}"

echo "Building and pushing Docker image..."
echo "Repository: ${ECR_REPO_URI}"
echo "Tags: ${IMAGE_TAG_SHA}"
echo "Note: Using immutable tags for security. Latest image determined by timestamp."

# Build cache arguments
CACHE_ARGS=""

# Use GitHub Actions cache if available (only works in GitHub Actions with buildx)
if [ -n "${ACTIONS_CACHE_URL:-}" ]; then
  echo "✓ GitHub Actions cache available"
  CACHE_ARGS="--cache-from type=gha --cache-to type=gha,mode=max"
else
  echo "⚠ GitHub Actions cache not available (running locally or cache not configured)"
fi

# Note: ECR registry cache is not used with immutable tags
# The buildcache tag would conflict with immutability on subsequent builds
# GitHub Actions cache is sufficient for CI/CD builds

docker buildx build \
  --platform linux/amd64 \
  --build-arg NODE_ENV=production \
  --file ./frontend/Dockerfile \
  --tag "${ECR_REPO_URI}:${IMAGE_TAG_SHA}" \
  --push \
  ${CACHE_ARGS} \
  .

echo "✓ Successfully pushed image with tag: ${IMAGE_TAG_SHA}"
