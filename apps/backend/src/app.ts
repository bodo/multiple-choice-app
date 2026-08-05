import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import type { ExerciseRepository } from './exercise.js'
import {
  exerciseListSchema,
  problemSchema,
} from './exerciseSchemas.js'

interface AppOptions {
  repository: ExerciseRepository
  frontendDirectory?: string
  openApiPath: string
  logger?: boolean
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? false })

  await app.register(fastifySwagger, {
    mode: 'static',
    specification: {
      path: options.openApiPath,
      baseDir: dirname(options.openApiPath),
    },
  })
  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
  })

  app.get('/api/v1/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string' } },
        },
      },
    },
  }, async () => ({ status: 'ok' }))

  app.get('/api/v1/exercises', {
    schema: {
      response: {
        200: exerciseListSchema,
        500: problemSchema,
      },
    },
  }, async () => ({ items: await options.repository.findAll() }))

  if (
    options.frontendDirectory
    && existsSync(`${options.frontendDirectory}/index.html`)
  ) {
    await app.register(fastifyStatic, {
      root: options.frontendDirectory,
      prefix: '/',
    })
  }

  app.setNotFoundHandler((request, reply) => {
    if (
      options.frontendDirectory
      && existsSync(`${options.frontendDirectory}/index.html`)
      && !request.url.startsWith('/api/')
    ) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route not found.',
    })
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'The request could not be processed.',
    })
  })

  app.addHook('onClose', async () => {
    await options.repository.close?.()
  })

  return app
}
