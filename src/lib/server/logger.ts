import '@tanstack/react-start/server-only'

/**
 * Tiny zero-dependency structured logger.
 *
 * Output is one line per call: `<ISO timestamp> <LEVEL> [namespace] <message>`,
 * optionally followed by a context object. The minimum level is read once from
 * `LOG_LEVEL` (default `info`); set `LOG_LEVEL=debug` to see entry/success
 * traces. Follows the project's existing `[namespace]` prefix convention.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function resolveThreshold(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined
  return configured && configured in LEVEL_ORDER
    ? LEVEL_ORDER[configured]
    : LEVEL_ORDER.info
}

const threshold = resolveThreshold()

export type LogContext = Record<string, unknown>

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

function emit(
  namespace: string,
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  if (LEVEL_ORDER[level] < threshold) return

  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${namespace}] ${message}`
  // Route to the matching stream so warnings/errors land on stderr in Docker/Nitro.
  const sink =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log

  if (context && Object.keys(context).length > 0) {
    sink(line, context)
  } else {
    sink(line)
  }
}

export function createLogger(namespace: string): Logger {
  return {
    debug: (message, context) => emit(namespace, 'debug', message, context),
    info: (message, context) => emit(namespace, 'info', message, context),
    warn: (message, context) => emit(namespace, 'warn', message, context),
    error: (message, context) => emit(namespace, 'error', message, context),
  }
}

/**
 * Normalizes an unknown thrown value into a loggable context object, so callers
 * can write `log.error('...', {...errorContext(err)})`.
 */
export function errorContext(err: unknown): LogContext {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    return {
      error: err.message,
      ...(code ? {code} : {}),
      ...(err.stack ? {stack: err.stack} : {}),
    }
  }
  return {error: String(err)}
}

/** Handler context shape shared by every TanStack `server.handlers` function. */
type HandlerContext = {request: Request; params: Record<string, string>}

/**
 * Wraps an API route handler with a per-request log line (method, path, status,
 * duration) and a catch-all: any thrown error is logged and turned into a
 * well-formed 500 instead of an opaque crash.
 */
export function withRequestLogging<Ctx extends HandlerContext>(
  namespace: string,
  handler: (ctx: Ctx) => Response | Promise<Response>,
): (ctx: Ctx) => Promise<Response> {
  const log = createLogger(namespace)
  return async (ctx) => {
    const start = Date.now()
    const {method, url} = ctx.request
    const path = new URL(url).pathname
    try {
      const response = await handler(ctx)
      log.info(`${method} ${path} -> ${response.status}`, {
        ms: Date.now() - start,
      })
      return response
    } catch (err) {
      log.error(`${method} ${path} failed`, {
        ...errorContext(err),
        ms: Date.now() - start,
      })
      return Response.json({error: 'Internal server error'}, {status: 500})
    }
  }
}
