/**
 * Update _routes.json to include all necessary routes
 * This script runs after the build to ensure all routes are included
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const routesPath = join(__dirname, '../dist/_routes.json')

console.log('📝 Updating _routes.json...')

try {
  // Read current routes
  const routesContent = readFileSync(routesPath, 'utf-8')
  const routes = JSON.parse(routesContent)
  
  // Add essay-admin if not present
  if (!routes.include.includes('/essay-admin*')) {
    // Find the position after essay-coaching
    const index = routes.include.findIndex(r => r.startsWith('/essay-coaching'))
    if (index !== -1) {
      routes.include.splice(index + 1, 0, '/essay-admin*')
    } else {
      routes.include.push('/essay-admin*')
    }
    
    // Write updated routes
    writeFileSync(routesPath, JSON.stringify(routes, null, 2) + '\n', 'utf-8')
    console.log('✅ Added /essay-admin* to _routes.json')
  } else {
    console.log('✅ /essay-admin* already in _routes.json')
  }
  
  // Display final routes
  console.log('\n📋 Final routes configuration:')
  console.log('Include:', routes.include.join(', '))
  
} catch (error) {
  console.error('❌ Failed to update _routes.json:', error.message)
  process.exit(1)
}
