# Runtime deployment scaffold

The Actions files only copy this scaffold and the SQL initialization files.
They do not yet publish container images or run `docker compose up` on a server.

Before enabling the opt-in deployment job:

1. Publish the backend image from `apps/backend/Dockerfile` to a registry.
2. Copy `.env.example` to `.env` on the runtime host and replace every secret.
3. Configure `DEPLOY_HOST`, `DEPLOY_PATH`, and `DEPLOY_USER` as repository
   variables.
4. Configure `DEPLOY_SSH_KEY` and pinned `DEPLOY_KNOWN_HOSTS` as secrets.
5. Add the server-side pull and rollout only after backup and rollback behavior
   has been decided.

The backend image already contains the built frontend and serves it on `/`.
The separate frontend image is intended for independent testing or a later
split deployment.
