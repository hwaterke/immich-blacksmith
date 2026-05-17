Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
npm install
npm run dev
```

# Building For Production

To build this application for production:

```bash
npm run build
```

## Deploy with Nitro

This project uses Nitro as a generic server adapter, so it can run on any Node-compatible host.

```bash
npm run build
node dist/server/index.mjs
```

The build output is a self-contained Node server. To deploy, push the `dist/` directory to your host (Render, Fly.io, your own VPS, etc.) and run the server command above.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.

## Docker Deployment

The included `Dockerfile` produces a self-contained image that can run next to a
self-hosted [Immich](https://immich.app) stack. The runtime image only contains
the Nitro server bundle (`.output/`) on top of `node:22-alpine`, so it stays
small (~150–250 MB).

### Build the image

```bash
docker build -t immich-plus:latest .
```

The build is fully self-contained — it installs dependencies and runs
`npm run build` inside the builder stage, so no local `node_modules` or
`.output` is required.

### Run alongside Immich

Add the following service to the existing Immich `docker-compose.yml` (the one
that already defines `immich-server`, `database`, `redis`, …):

```yaml
immich-plus:
  container_name: immich_plus
  image: immich-plus:latest
  # Or build from a local checkout instead of pulling the image:
  # build: ./immich-plus
  environment:
    DB_HOST: database
    DB_PORT: 5432
    DB_NAME: ${DB_DATABASE_NAME}
    DB_USER: ${DB_USERNAME}
    DB_PASSWORD: ${DB_PASSWORD}
    IMMICH_URL: http://immich-server:2283/api
    IMMICH_API_KEY: ${IMMICH_API_KEY}
  ports:
    - 3001:3000
  depends_on:
    - database
    - immich-server
  restart: always
```

Notes:

- `DB_DATABASE_NAME`, `DB_USERNAME`, `DB_PASSWORD` are already defined in
  Immich's `.env` file next to its `docker-compose.yml`. Reuse them as-is.
- `IMMICH_API_KEY` must be generated in Immich (Account Settings → API Keys)
  and added to the same `.env`.
- Because the service runs in the same compose file, it joins Immich's default
  network and can reach `database` and `immich-server` by service name — no
  extra `networks:` entry needed.
- Host port `3001` is used to avoid clashing with Immich's web UI on `2283`.
  Change it to whatever you prefer.

Bring it up with:

```bash
docker compose up -d immich-plus
```

Then browse `http://<host>:3001`.

### Optional: use a read-only PostgreSQL user

`immich-plus` only ever runs `SELECT` queries against Immich's database (all
writes go through the Immich HTTP API using `IMMICH_API_KEY`). If you'd rather
not hand the container Immich's full DB credentials, create a dedicated
read-only role.

Open a `psql` shell inside the Immich database container:

```bash
docker exec -it immich_postgres psql -U <immich_user> -d <immich_db>
```

Then run, once:

```sql
CREATE USER immich_readonly WITH PASSWORD 'choose-a-password';
GRANT CONNECT ON DATABASE immich TO immich_readonly;
GRANT USAGE ON SCHEMA public TO immich_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO immich_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO immich_readonly;
```

Then point the compose service at the new credentials:

```yaml
DB_USER: immich_readonly
DB_PASSWORD: choose-a-password
```

Write workflows (e.g. marking duplicates for deletion) keep working because
they go through Immich's REST API, not direct SQL.
