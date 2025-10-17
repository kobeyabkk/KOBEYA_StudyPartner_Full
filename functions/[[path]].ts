// Cloudflare Pages Functions entry point
import app from '../src/index'

export const onRequest: PagesFunction = app.fetch