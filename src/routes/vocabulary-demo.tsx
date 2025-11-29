import { Hono } from 'hono'
import { renderToString } from 'react-dom/server'
import VocabularyDemo from '../pages/vocabulary-demo'

const app = new Hono()

app.get('/', (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Vocabulary Annotation Demo - KOBEYA StudyPartner</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body>
      <div id="root">${renderToString(<VocabularyDemo />)}</div>
      <script type="module" src="/assets/client.js"></script>
    </body>
    </html>
  `
  return c.html(html)
})

export default app
