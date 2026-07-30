#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

readonly DEPLOY_HOST="${DEPLOY_HOST:-vps3}"
readonly DEPLOY_PATH="${DEPLOY_PATH:-/var/www/wiso.abschluss.jetzt/httpdocs}"
readonly DEPLOY_URL="${DEPLOY_URL:-https://wiso.abschluss.jetzt}"
readonly SERVE_HOST="${SERVE_HOST:-127.0.0.1}"
readonly SERVE_PORT="${SERVE_PORT:-4173}"

cd "${PROJECT_DIR}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/build-serve-deploy.sh build
  ./scripts/build-serve-deploy.sh serve
  ./scripts/build-serve-deploy.sh deploy [--dry-run | --yes]

Commands:
  build   Lint and build the production bundle in dist/
  serve   Serve the existing dist/ bundle with Vite Preview
  deploy  Build, show an rsync dry-run, and deploy dist/ after confirmation

Environment:
  SERVE_HOST   Preview bind address (default: 127.0.0.1)
  SERVE_PORT   Preview port (default: 4173)
  DEPLOY_HOST  SSH host or alias (default: vps3)
  DEPLOY_PATH  Remote document root
  DEPLOY_URL   Public URL checked after deployment
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_dependencies() {
  [[ -x node_modules/.bin/vite ]] ||
    fail "Dependencies are missing. Run 'npm ci' first."
}

build_app() {
  require_command npm
  require_dependencies

  npm run lint
  npm run build
}

serve_app() {
  require_command npm
  require_dependencies
  [[ -f dist/index.html ]] ||
    fail "dist/ is missing. Run '$0 build' first."

  npm run preview -- --host "${SERVE_HOST}" --port "${SERVE_PORT}"
}

validate_deploy_target() {
  [[ -n "${DEPLOY_HOST}" ]] || fail "DEPLOY_HOST must not be empty."

  case "${DEPLOY_PATH}" in
    "" | "/")
      fail "Refusing unsafe DEPLOY_PATH: '${DEPLOY_PATH}'"
      ;;
  esac

  [[ "${DEPLOY_PATH}" == /* ]] ||
    fail "DEPLOY_PATH must be an absolute path."
}

remote_path_quote() {
  printf '%q' "$1"
}

check_remote_target() {
  local quoted_path
  quoted_path="$(remote_path_quote "${DEPLOY_PATH}")"

  ssh -o BatchMode=yes -- "${DEPLOY_HOST}" \
    "test -d ${quoted_path} && test -f ${quoted_path}/index.html" ||
    fail "Remote target is not an existing website: ${DEPLOY_HOST}:${DEPLOY_PATH}"
}

run_rsync() {
  local -a extra_args=("$@")

  rsync -avz --delete "${extra_args[@]}" \
    -e "ssh -o BatchMode=yes" \
    dist/ \
    "${DEPLOY_HOST}:${DEPLOY_PATH}/"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi

  fail "Neither sha256sum nor shasum is available."
}

verify_deploy() {
  local local_hash remote_hash quoted_file
  quoted_file="$(remote_path_quote "${DEPLOY_PATH}/index.html")"

  local_hash="$(sha256_file dist/index.html)"
  remote_hash="$(
    ssh -o BatchMode=yes -- "${DEPLOY_HOST}" \
      "sha256sum ${quoted_file}" |
      awk '{print $1}'
  )"

  [[ "${local_hash}" == "${remote_hash}" ]] ||
    fail "Local and remote index.html checksums differ."

  printf 'Verified remote index.html: %s\n' "${local_hash}"

  if ! command -v curl >/dev/null 2>&1; then
    printf 'Warning: curl is unavailable; skipped public URL check.\n' >&2
  elif ! curl --fail --silent --show-error --output /dev/null "${DEPLOY_URL}/"; then
    printf 'Warning: public URL check failed: %s\n' "${DEPLOY_URL}" >&2
  else
    printf 'Verified public URL: %s\n' "${DEPLOY_URL}"
  fi
}

deploy_app() {
  local mode="${1:-confirm}"
  local confirmation

  require_command ssh
  require_command rsync
  validate_deploy_target
  build_app
  check_remote_target

  printf '\nDeployment dry-run for %s:%s\n' "${DEPLOY_HOST}" "${DEPLOY_PATH}"
  run_rsync --dry-run

  if [[ "${mode}" == "dry-run" ]]; then
    return
  fi

  if [[ "${mode}" != "yes" ]]; then
    [[ -t 0 ]] ||
      fail "Interactive confirmation is unavailable. Use --yes to deploy."
    read -r -p "Deploy these changes? Type 'deploy': " confirmation
    [[ "${confirmation}" == "deploy" ]] || fail "Deployment cancelled."
  fi

  run_rsync
  verify_deploy
}

main() {
  local command="${1:-help}"
  local deploy_mode="confirm"

  shift || true

  case "${command}" in
    build)
      [[ "$#" -eq 0 ]] || fail "The build command takes no arguments."
      build_app
      ;;
    serve)
      [[ "$#" -eq 0 ]] || fail "The serve command takes no arguments."
      serve_app
      ;;
    deploy)
      if [[ "$#" -gt 1 ]]; then
        fail "The deploy command accepts at most one option."
      fi

      case "${1:-}" in
        "")
          ;;
        --dry-run)
          deploy_mode="dry-run"
          ;;
        --yes)
          deploy_mode="yes"
          ;;
        *)
          fail "Unknown deploy option: $1"
          ;;
      esac

      deploy_app "${deploy_mode}"
      ;;
    help | --help | -h)
      usage
      ;;
    *)
      usage >&2
      fail "Unknown command: ${command}"
      ;;
  esac
}

main "$@"
