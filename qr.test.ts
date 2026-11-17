import { expect, test } from 'bun:test'
import { qr } from './qr'

const hash = (m: boolean[][]) =>
	new Bun.CryptoHasher('sha256')
		.update(m.map((r) => r.map(Number).join('')).join('\n'))
		.digest('hex')
		.slice(0, 16)
const long = (k: number) => Array.from({ length: k }, (_, i) => String.fromCharCode(33 + ((i * 7) % 90))).join('')

// The expected hashes come from uqr 0.1.3 with the same mask, level M and no border.
test('matches a reference encoder', () => {
	expect(hash(qr('https://example.com/?claim=0123456789abcdef', 2))).toBe('2df8338accb504fd')
	expect(hash(qr('Hyvää päivää 🌞', 5))).toBe('51ec7c485c353475')
	expect(hash(qr(long(250), 0))).toBe('9a1d460b9cb58e06')
	expect(hash(qr(long(2300), 7))).toBe('42e60c14abf90c7e')
})

test('picks the smallest version and refuses too much text', () => {
	expect(qr('a').length).toBe(21)
	expect(qr(long(2331)).length).toBe(177)
	expect(() => qr(long(2332))).toThrow()
})
