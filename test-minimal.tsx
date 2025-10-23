// Test minimal Study Partner page
app.get('/test-minimal', (c) => {
  console.log('🧪 Test minimal page requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minimal Test</title>
        <link href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" rel="stylesheet">
    </head>
    <body>
        <div class="container">
            <h1>🧪 Minimal Test Page</h1>
            
            <button id="testBtn" onclick="testClick()">Test Click</button>
            
            <script>
            console.log('🧪 Minimal test script started');
            
            function testClick() {
                alert('Button works!');
                console.log('Button clicked successfully');
            }
            
            console.log('🧪 Minimal test script completed');
            </script>
        </div>
    </body>
    </html>
  `)
})