// One line per event, with an ISO timestamp, on stdout. After logTo(dir, name),
// also in one file per UTC day: <dir>/<name>-YYYY-MM-DD.log.
import { appendFileSync, mkdirSync } from 'node:fs'
import { stringify } from './ason.ts'

let file = ''

export function logTo(dir: string, name: string) {
	mkdirSync(dir, { recursive: true })
	file = `${dir}/${name}-`
}

// `data` goes on the same line as short ASON.
export function log(text: string, data?: object) {
	const at = new Date().toISOString()
	const line = `${at} ${text}${data ? ` ${stringify(data, 'short')}` : ''}\n`
	process.stdout.write(line)
	if (file) appendFileSync(`${file}${at.slice(0, 10)}.log`, line)
}
