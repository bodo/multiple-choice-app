import { buildApp } from './app.js'
import { config } from './config.js'
import { MariaDbExerciseRepository } from './mariaDbExerciseRepository.js'

const repository = new MariaDbExerciseRepository(config.database)
const app = await buildApp({
  repository,
  frontendDirectory: config.frontendDirectory,
  openApiPath: config.openApiPath,
  logger: true,
})

async function stop(signal: string): Promise<void> {
  app.log.info({ signal }, 'Stopping server')
  await app.close()
  process.exit(0)
}

process.once('SIGINT', () => void stop('SIGINT'))
process.once('SIGTERM', () => void stop('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exit(1)
}
