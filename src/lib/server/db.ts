import '@tanstack/react-start/server-only'
import {Kysely, PostgresDialect} from 'kysely'
import {Pool} from 'pg'
import type {DB} from './db.d'

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST ?? 'database',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'immich',
      user: process.env.DB_USER ?? 'immich_readonly',
      password: process.env.DB_PASSWORD,
      max: 5,
    }),
  }),
})
