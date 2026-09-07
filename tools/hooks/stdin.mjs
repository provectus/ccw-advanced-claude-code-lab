/**
 * Reads all of stdin as a string. Hooks receive their payload this way.
 *
 * Strips a leading UTF-8 BOM: piping a string to a native command from PowerShell
 * (`$payload | node hook.mjs`) encodes it with a leading BOM, which would otherwise
 * break `JSON.parse` and make the hook silently no-op.
 */
export function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(strip(data)))
    process.stdin.on('error', () => resolve(strip(data)))
    if (process.stdin.isTTY) resolve('')
  })
}

function strip(data) {
  return data.charCodeAt(0) === 0xfeff ? data.slice(1) : data
}
