import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(backendDirectory, '../..')

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  return port
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: readPort(process.env.PORT),
  frontendDirectory: process.env.FRONTEND_DIRECTORY
    ?? resolve(repositoryRoot, 'apps/frontend/dist'),
  openApiPath: process.env.OPENAPI_PATH
    ?? resolve(repositoryRoot, 'packages/contracts/openapi.yaml'),
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: readPort(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'multiple_choice',
    password: process.env.DB_PASSWORD ?? 'multiple_choice',
    database: process.env.DB_NAME ?? 'multiple_choice',
  },
}
