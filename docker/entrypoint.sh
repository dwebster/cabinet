#!/usr/bin/env bash
# Runs on every container start — rewrites git config from env vars so the
# container can push/pull without manual setup. Idempotent.
set -euo pipefail

# Git identity. git(1) picks up GIT_AUTHOR_* natively, but also write user.name /
# user.email so tools that read `git config` see the values.
if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

# Trust every mounted working tree — we're inside a container, ownership
# checks aren't the right security boundary here.
git config --global --add safe.directory '*'

# Rewrite SSH GitHub remotes to HTTPS so the PAT credential helper handles auth.
# insteadOf is multi-valued — clear any prior entries, then --add both forms so
# they don't clobber each other.
git config --global --unset-all url."https://github.com/".insteadOf 2>/dev/null || true
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"

# Write the PAT into the credential store if present. Never baked into the image.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  git config --global credential.helper store
  printf "https://x-access-token:%s@github.com\n" "$GITHUB_TOKEN" > "$HOME/.git-credentials"
  chmod 600 "$HOME/.git-credentials"
fi

exec "$@"
